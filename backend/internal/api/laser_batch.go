package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type createLaserBatchRequest struct {
	TrayCycleID    int64  `json:"tray_cycle_id" binding:"required"`
	ProductionDate string `json:"production_date" binding:"required"`
	IdempotencyKey string `json:"idempotency_key" binding:"required"`
}

func (s *Server) createLaserBatch(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req createLaserBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err)
		return
	}
	productionDate, err := time.Parse("2006-01-02", req.ProductionDate)
	if err != nil {
		fail(c, http.StatusBadRequest, fmt.Errorf("invalid production_date"))
		return
	}
	idempotencyKey, err := uuid.Parse(req.IdempotencyKey)
	if err != nil {
		fail(c, http.StatusBadRequest, fmt.Errorf("invalid idempotency_key"))
		return
	}

	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	_, _ = tx.Exec(c, `SELECT pg_advisory_xact_lock(26062901)`)

	var existingID int64
	if tx.QueryRow(c, `SELECT id FROM t_laser_batches WHERE tray_cycle_id=$1`, req.TrayCycleID).Scan(&existingID) == nil {
		if err = tx.Commit(c); err != nil {
			fail(c, 500, err)
			return
		}
		s.respondLaserBatch(c, existingID, http.StatusOK)
		return
	}

	var productionOrderID, packagingConfigID int64
	var plannedQty, partsPerSmallBox int
	var cycleStatus string
	err = tx.QueryRow(c, `
		SELECT tc.production_order_id,tc.planned_qty,tc.status,
		       sol.packaging_config_id,pc.parts_per_small_box
		FROM t_tray_cycles tc
		JOIN t_production_orders po ON po.id=tc.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_packaging_configs pc ON pc.id=sol.packaging_config_id
		WHERE tc.id=$1 AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
		FOR UPDATE OF tc,po
	`, req.TrayCycleID).Scan(
		&productionOrderID, &plannedQty, &cycleStatus, &packagingConfigID, &partsPerSmallBox,
	)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("tray cycle is not available for laser marking"))
		return
	}

	var existingQty, invalidQty int
	err = tx.QueryRow(c, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE status NOT IN ('ALLOCATED','LASER_PENDING'))
		FROM t_units_tracking WHERE tray_cycle_id=$1
	`, req.TrayCycleID).Scan(&existingQty, &invalidQty)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if invalidQty > 0 {
		fail(c, http.StatusConflict, fmt.Errorf("tray already contains units that passed the laser stage"))
		return
	}

	remaining := plannedQty - existingQty
	for remaining > 0 {
		groupSize := min(partsPerSmallBox, remaining)
		var groupNumber int
		err = tx.QueryRow(c, `
			SELECT COALESCE(MAX(group_number),0)+1
			FROM t_serial_groups WHERE production_order_id=$1
		`, productionOrderID).Scan(&groupNumber)
		if err != nil {
			fail(c, 500, err)
			return
		}
		var groupID int64
		err = tx.QueryRow(c, `
			INSERT INTO t_serial_groups
				(production_order_id,packaging_config_id,group_number,group_size,production_date)
			VALUES ($1,$2,$3,$4,$5) RETURNING id
		`, productionOrderID, packagingConfigID, groupNumber, groupSize, productionDate).Scan(&groupID)
		if err != nil {
			fail(c, 500, err)
			return
		}
		for position := 1; position <= groupSize; position++ {
			var sequence int64
			if err = tx.QueryRow(c, `SELECT nextval('seq_commercial_serial')`).Scan(&sequence); err != nil {
				fail(c, 500, err)
				return
			}
			if sequence > 99999999 {
				fail(c, 500, fmt.Errorf("commercial serial exceeded 8 digits"))
				return
			}
			serial := productionDate.Format("060102") + fmt.Sprintf("%08d", sequence)
			_, err = tx.Exec(c, `
				INSERT INTO t_units_tracking
					(serial_sequence,serial_number,serial_group_id,tray_cycle_id,group_position,status)
				VALUES ($1,$2,$3,$4,$5,'LASER_PENDING')
			`, sequence, serial, groupID, req.TrayCycleID, position)
			if err != nil {
				fail(c, 500, err)
				return
			}
		}
		remaining -= groupSize
	}
	_, err = tx.Exec(c, `
		UPDATE t_units_tracking SET status='LASER_PENDING',updated_at=NOW()
		WHERE tray_cycle_id=$1 AND status='ALLOCATED'
	`, req.TrayCycleID)
	if err != nil {
		fail(c, 500, err)
		return
	}

	rows, err := tx.Query(c, `
		SELECT id,serial_number FROM t_units_tracking
		WHERE tray_cycle_id=$1 ORDER BY serial_sequence
	`, req.TrayCycleID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	type batchUnit struct {
		ID     int64
		Serial string
	}
	units := make([]batchUnit, 0, plannedQty)
	serials := make([]string, 0, plannedQty)
	for rows.Next() {
		var unit batchUnit
		if err = rows.Scan(&unit.ID, &unit.Serial); err != nil {
			rows.Close()
			fail(c, 500, err)
			return
		}
		units = append(units, unit)
		serials = append(serials, unit.Serial)
	}
	rows.Close()
	if len(units) != plannedQty {
		fail(c, http.StatusConflict, fmt.Errorf("tray unit quantity does not match its planned quantity"))
		return
	}

	batchCode := "LB-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:12])
	var batchID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_laser_batches
			(batch_code,tray_cycle_id,production_order_id,total_qty,serial_from,serial_to,station_id,created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
	`, batchCode, req.TrayCycleID, productionOrderID, len(units), serials[0], serials[len(serials)-1], station, operator).Scan(&batchID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	for index, unit := range units {
		if _, err = tx.Exec(c, `
			INSERT INTO t_laser_batch_units (laser_batch_id,unit_id,batch_position)
			VALUES ($1,$2,$3)
		`, batchID, unit.ID, index+1); err != nil {
			fail(c, 500, err)
			return
		}
	}
	payload := strings.Join(serials, "\r\n") + "\r\n"
	_, err = tx.Exec(c, `
		INSERT INTO t_print_jobs
			(idempotency_key,entity_type,entity_id,station_id,device_role,payload)
		VALUES ($1,'LASER_BATCH',$2,$3,'LASER',$4)
	`, idempotencyKey, batchID, station, payload)
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	s.respondLaserBatch(c, batchID, http.StatusAccepted)
}

func (s *Server) listLaserBatches(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT lb.id,lb.batch_code,t.tray_code,tc.tray_cycle_code,
		       po.production_order_number,p.product_code,p.product_name,
		       lb.total_qty,lb.serial_from,lb.serial_to,lb.status,
		       COUNT(u.id) FILTER (WHERE u.status NOT IN ('ALLOCATED','LASER_PENDING')),
		       lb.transmission_attempts,lb.last_error,lb.created_by,lb.created_at,lb.updated_at,lb.sent_at
		FROM t_laser_batches lb
		JOIN t_tray_cycles tc ON tc.id=lb.tray_cycle_id
		JOIN m_trays t ON t.id=tc.tray_id
		JOIN t_production_orders po ON po.id=lb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_laser_batch_units lbu ON lbu.laser_batch_id=lb.id
		JOIN t_units_tracking u ON u.id=lbu.unit_id
		GROUP BY lb.id,t.tray_code,tc.tray_cycle_code,po.production_order_number,p.product_code,p.product_name
		ORDER BY lb.created_at DESC LIMIT 100
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		item, scanErr := scanLaserBatchSummary(rows)
		if scanErr != nil {
			fail(c, 500, scanErr)
			return
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) getLaserBatch(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var batchCode, status string
	var total int
	err = s.db.QueryRow(c, `SELECT batch_code,total_qty,status FROM t_laser_batches WHERE id=$1`, id).
		Scan(&batchCode, &total, &status)
	if err != nil {
		fail(c, 404, fmt.Errorf("laser batch not found"))
		return
	}
	rows, err := s.db.Query(c, `
		SELECT u.serial_number,u.status,lbu.batch_position,
		       COALESCE(pu.initial_result,'PASS'),pu.rework_code,origin.tray_code
		FROM t_laser_batch_units lbu
		JOIN t_units_tracking u ON u.id=lbu.unit_id
		LEFT JOIN t_pre_laser_units pu ON pu.commercial_unit_id=u.id
		LEFT JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id
		LEFT JOIN m_trays origin ON origin.id=qs.tray_id
		WHERE lbu.laser_batch_id=$1 ORDER BY lbu.batch_position
	`, id)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	serials := make([]gin.H, 0, total)
	for rows.Next() {
		var serial, unitStatus, initialResult string
		var reworkCode, originalTray *string
		var position int
		if err = rows.Scan(&serial, &unitStatus, &position, &initialResult, &reworkCode, &originalTray); err != nil {
			fail(c, 500, err)
			return
		}
		sourceType := "DIRECT"
		if initialResult == "REJECT" {
			sourceType = "REWORK"
		}
		serials = append(serials, gin.H{
			"position": position, "serial_number": serial, "status": unitStatus,
			"source_type": sourceType, "rework_code": reworkCode, "original_tray": originalTray,
		})
	}
	c.JSON(200, gin.H{"id": id, "batch_code": batchCode, "status": status, "total_qty": total, "serials": serials})
}

func (s *Server) resendLaserBatch(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var status string
	err = tx.QueryRow(c, `SELECT status FROM t_laser_batches WHERE id=$1 FOR UPDATE`, id).Scan(&status)
	if err != nil {
		fail(c, 404, fmt.Errorf("laser batch not found"))
		return
	}
	if status == "SENT" || status == "PROCESSING" {
		fail(c, http.StatusConflict, fmt.Errorf("only pending or failed batches can be resent"))
		return
	}
	tag, err := tx.Exec(c, `
		UPDATE t_print_jobs
		SET status='QUEUED',next_attempt_at=NOW(),last_error=NULL
		WHERE id=(
			SELECT id FROM t_print_jobs
			WHERE entity_type='LASER_BATCH' AND entity_id=$1
			ORDER BY id DESC LIMIT 1
		)
	`, id)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 500, fmt.Errorf("laser transmission job not found"))
		return
	}
	_, err = tx.Exec(c, `
		UPDATE t_laser_batches SET status='PENDING',last_error=NULL,updated_at=NOW() WHERE id=$1
	`, id)
	if err == nil {
		err = tx.Commit(c)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	s.respondLaserBatch(c, id, http.StatusAccepted)
}

func (s *Server) respondLaserBatch(c *gin.Context, id int64, statusCode int) {
	var batchCode, status, serialFrom, serialTo string
	var total, processed int
	var created time.Time
	err := s.db.QueryRow(c, `
		SELECT lb.batch_code,lb.status,lb.total_qty,lb.serial_from,lb.serial_to,lb.created_at,
		       COUNT(u.id) FILTER (WHERE u.status NOT IN ('ALLOCATED','LASER_PENDING'))
		FROM t_laser_batches lb
		JOIN t_laser_batch_units lbu ON lbu.laser_batch_id=lb.id
		JOIN t_units_tracking u ON u.id=lbu.unit_id
		WHERE lb.id=$1 GROUP BY lb.id
	`, id).Scan(&batchCode, &status, &total, &serialFrom, &serialTo, &created, &processed)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(statusCode, gin.H{
		"id": id, "batch_code": batchCode, "status": status, "total_qty": total,
		"processed_qty": processed, "serial_from": serialFrom, "serial_to": serialTo,
		"created_at": created,
	})
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanLaserBatchSummary(row rowScanner) (gin.H, error) {
	var id int64
	var batchCode, trayCode, cycleCode, productionNumber, productCode, productName, createdBy string
	var total, processed, attempts int
	var serialFrom, serialTo, status string
	var lastError *string
	var created, updated time.Time
	var sentAt *time.Time
	err := row.Scan(
		&id, &batchCode, &trayCode, &cycleCode, &productionNumber, &productCode, &productName,
		&total, &serialFrom, &serialTo, &status, &processed, &attempts, &lastError,
		&createdBy, &created, &updated, &sentAt,
	)
	if err != nil {
		return nil, err
	}
	return gin.H{
		"id": id, "batch_code": batchCode, "tray_code": trayCode, "tray_cycle_code": cycleCode,
		"production_order_number": productionNumber, "product_code": productCode,
		"product_name": productName, "total_qty": total, "processed_qty": processed,
		"serial_from": serialFrom, "serial_to": serialTo, "status": status,
		"transmission_attempts": attempts, "last_error": lastError,
		"created_by": createdBy, "created_at": created, "updated_by": createdBy, "updated_at": updated, "sent_at": sentAt,
	}, nil
}
