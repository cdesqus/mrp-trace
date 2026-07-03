package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) getQCTray(c *gin.Context) {
	var trayID, cycleID, productionID, configID int64
	var trayCode, trayStatus, cycleCode, cycleStatus, productionNumber, productCode, productName string
	var planned, partsPerSmall int
	err := s.db.QueryRow(c, `
		SELECT t.id,t.tray_code,t.status,tc.id,tc.tray_cycle_code,tc.status,tc.planned_qty,
		       po.id,po.production_order_number,sol.packaging_config_id,
		       p.product_code,p.product_name,pc.parts_per_small_box
		FROM m_trays t
		JOIN t_tray_cycles tc ON tc.tray_id=t.id
		  AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
		JOIN t_production_orders po ON po.id=tc.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN m_packaging_configs pc ON pc.id=sol.packaging_config_id
		WHERE t.tray_code=$1
		ORDER BY tc.id DESC LIMIT 1
	`, c.Param("code")).Scan(
		&trayID, &trayCode, &trayStatus, &cycleID, &cycleCode, &cycleStatus, &planned,
		&productionID, &productionNumber, &configID, &productCode, &productName, &partsPerSmall,
	)
	if err != nil {
		fail(c, http.StatusNotFound, fmt.Errorf("no active Tray Cycle found for this tray"))
		return
	}
	var allocated, laserPending, qcPending, rework, passed int
	err = s.db.QueryRow(c, `
		SELECT COUNT(*) FILTER (WHERE status='ALLOCATED'),
		       COUNT(*) FILTER (WHERE status='LASER_PENDING'),
		       COUNT(*) FILTER (WHERE status='QC_PENDING'),
		       COUNT(*) FILTER (WHERE status='REWORK'),
		       COUNT(*) FILTER (WHERE status IN ('PASSED_UNBOXED','PACKED'))
		FROM t_units_tracking WHERE tray_cycle_id=$1
	`, cycleID).Scan(&allocated, &laserPending, &qcPending, &rework, &passed)
	if err != nil {
		fail(c, 500, err)
		return
	}
	var activeGroupID *int64
	var activeGroupStatus *string
	var activeGroupAllocated int
	_ = s.db.QueryRow(c, `
		SELECT sg.id,sg.status,COUNT(u.id) FILTER (WHERE u.status='ALLOCATED')
		FROM t_serial_groups sg
		JOIN t_units_tracking u ON u.serial_group_id=sg.id
		WHERE u.tray_cycle_id=$1 AND sg.status <> 'PACKED'
		GROUP BY sg.id ORDER BY sg.id DESC LIMIT 1
	`, cycleID).Scan(&activeGroupID, &activeGroupStatus, &activeGroupAllocated)

	rows, err := s.db.Query(c, `
		SELECT u.serial_number,u.status,u.group_position,sg.group_number,
		       rw.rework_code,rw.reason
		FROM t_units_tracking u
		JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		LEFT JOIN LATERAL (
			SELECT rework_code,reason FROM t_rework_logs
			WHERE unit_id=u.id ORDER BY id DESC LIMIT 1
		) rw ON TRUE
		WHERE u.tray_cycle_id=$1
		ORDER BY u.id DESC LIMIT 30
	`, cycleID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	units := make([]gin.H, 0)
	for rows.Next() {
		var serial, status string
		var position, groupNumber int
		var reworkCode, reason *string
		if err = rows.Scan(&serial, &status, &position, &groupNumber, &reworkCode, &reason); err != nil {
			fail(c, 500, err)
			return
		}
		units = append(units, gin.H{
			"serial_number": serial, "status": status, "group_position": position,
			"group_number": groupNumber, "rework_code": reworkCode, "rework_reason": reason,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"tray_id": trayID, "tray_code": trayCode, "tray_status": trayStatus,
		"tray_cycle_id": cycleID, "tray_cycle_code": cycleCode, "tray_cycle_status": cycleStatus,
		"production_order_id": productionID, "production_order_number": productionNumber,
		"packaging_config_id": configID, "parts_per_small_box": partsPerSmall,
		"product_code": productCode, "product_name": productName, "planned_qty": planned,
		"counts":          gin.H{"allocated": allocated, "laser_pending": laserPending, "qc_pending": qcPending, "rework": rework, "passed": passed},
		"active_group_id": activeGroupID, "active_group_status": activeGroupStatus,
		"active_group_allocated": activeGroupAllocated, "units": units,
	})
}

func (s *Server) getQCSerial(c *gin.Context) {
	var serial, status, productCode, productName, trayCode string
	var reworkCode, reason *string
	var lastInspectedAt *time.Time
	var qcAttempts int
	var previouslyNG bool
	err := s.db.QueryRow(c, `
		SELECT u.serial_number,u.status,p.product_code,p.product_name,t.tray_code,
		       rw.rework_code,rw.reason,
		       (SELECT COUNT(*) FROM t_qc_events qe WHERE qe.unit_id=u.id),
		       EXISTS(SELECT 1 FROM t_qc_events qe WHERE qe.unit_id=u.id AND qe.result='REJECT'),
		       (SELECT MAX(qe.inspected_at) FROM t_qc_events qe WHERE qe.unit_id=u.id)
		FROM t_units_tracking u
		JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_tray_cycles tc ON tc.id=u.tray_cycle_id
		JOIN m_trays t ON t.id=tc.tray_id
		LEFT JOIN LATERAL (
			SELECT rework_code,reason FROM t_rework_logs WHERE unit_id=u.id ORDER BY id DESC LIMIT 1
		) rw ON TRUE
		WHERE u.serial_number=$1
	`, c.Param("serial")).Scan(
		&serial, &status, &productCode, &productName, &trayCode, &reworkCode, &reason,
		&qcAttempts, &previouslyNG, &lastInspectedAt,
	)
	if err != nil {
		fail(c, http.StatusNotFound, fmt.Errorf("serial not found"))
		return
	}
	c.JSON(200, gin.H{
		"serial_number": serial, "status": status, "product_code": productCode,
		"product_name": productName, "tray_code": trayCode, "rework_code": reworkCode,
		"rework_reason": reason, "qc_attempts": qcAttempts, "previously_ng": previouslyNG,
		"last_inspected_at": lastInspectedAt,
	})
}

func (s *Server) getRework(c *gin.Context) {
	var reworkCode, serial, reason, unitStatus, reworkStatus, productCode, productName, trayCode string
	var created time.Time
	var lastInspectedAt *time.Time
	var qcAttempts int
	err := s.db.QueryRow(c, `
		SELECT rw.rework_code,u.serial_number,rw.reason,u.status,rw.status,rw.created_at,
		       p.product_code,p.product_name,t.tray_code,
		       (SELECT COUNT(*) FROM t_qc_events qe WHERE qe.unit_id=u.id),
		       (SELECT MAX(qe.inspected_at) FROM t_qc_events qe WHERE qe.unit_id=u.id)
		FROM t_rework_logs rw
		JOIN t_units_tracking u ON u.id=rw.unit_id
		JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_tray_cycles tc ON tc.id=u.tray_cycle_id
		JOIN m_trays t ON t.id=tc.tray_id
		WHERE rw.rework_code=$1
		ORDER BY rw.id DESC LIMIT 1
	`, c.Param("code")).Scan(
		&reworkCode, &serial, &reason, &unitStatus, &reworkStatus, &created,
		&productCode, &productName, &trayCode, &qcAttempts, &lastInspectedAt,
	)
	if err != nil {
		fail(c, http.StatusNotFound, fmt.Errorf("rework code not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"rework_code": reworkCode, "serial_number": serial, "reason": reason,
		"status": unitStatus, "rework_status": reworkStatus, "created_at": created,
		"product_code": productCode, "product_name": productName, "tray_code": trayCode,
		"qc_attempts": qcAttempts, "previously_ng": true, "last_inspected_at": lastInspectedAt,
	})
}

func (s *Server) listQCHistory(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = min(parsed, 200)
		}
	}
	serialFilter := c.Query("serial")
	rows, err := s.db.Query(c, `
		SELECT qe.id,u.serial_number,t.tray_code,
		       CASE WHEN EXISTS (
		         SELECT 1 FROM t_qc_events previous
		         WHERE previous.unit_id=qe.unit_id
		           AND previous.result='REJECT'
		           AND (previous.inspected_at < qe.inspected_at
		                OR (previous.inspected_at=qe.inspected_at AND previous.id < qe.id))
		       ) THEN 'REWORK' ELSE 'INITIAL' END AS inspection_type,
		       qe.result,qe.reason,rw.rework_code,qe.operator_id,qe.station_id,qe.inspected_at
		FROM t_qc_events qe
		JOIN t_units_tracking u ON u.id=qe.unit_id
		JOIN t_tray_cycles tc ON tc.id=qe.tray_cycle_id
		JOIN m_trays t ON t.id=tc.tray_id
		LEFT JOIN LATERAL (
			SELECT rework_code FROM t_rework_logs
			WHERE unit_id=qe.unit_id ORDER BY id DESC LIMIT 1
		) rw ON TRUE
		WHERE ($1='' OR u.serial_number ILIKE '%' || $1 || '%')
		ORDER BY qe.inspected_at DESC,qe.id DESC
		LIMIT $2
	`, serialFilter, limit)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var serial, trayCode, inspectionType, result, operator, station string
		var reason, reworkCode *string
		var inspectedAt time.Time
		if err = rows.Scan(
			&id, &serial, &trayCode, &inspectionType, &result, &reason, &reworkCode,
			&operator, &station, &inspectedAt,
		); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "serial_number": serial, "tray_code": trayCode,
			"inspection_type": inspectionType, "result": result, "reason": reason,
			"rework_code": reworkCode, "operator_id": operator, "station_id": station,
			"inspected_at": inspectedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) listOpenReworks(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT u.serial_number,t.tray_code,rw.rework_code,rw.reason,rw.created_at,
		       po.production_order_number,sg.group_number,sg.group_size,u.group_position
		FROM t_units_tracking u
		JOIN t_rework_logs rw ON rw.unit_id=u.id AND rw.status='OPEN'
		JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_tray_cycles tc ON tc.id=u.tray_cycle_id
		JOIN m_trays t ON t.id=tc.tray_id
		WHERE u.status='REWORK'
		ORDER BY rw.created_at,rw.id
		LIMIT 200
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var serial, trayCode, reworkCode, reason, productionOrder string
		var createdAt time.Time
		var groupNumber, groupSize, position int
		if err = rows.Scan(
			&serial, &trayCode, &reworkCode, &reason, &createdAt,
			&productionOrder, &groupNumber, &groupSize, &position,
		); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"serial_number": serial, "tray_code": trayCode, "rework_code": reworkCode,
			"reason": reason, "ng_at": createdAt, "production_order": productionOrder,
			"group_number": groupNumber, "group_size": groupSize, "group_position": position,
			"status": "WAITING_REWORK",
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type allocateGroupRequest struct {
	ProductionOrderID int64  `json:"production_order_id" binding:"required"`
	TrayCycleID       int64  `json:"tray_cycle_id" binding:"required"`
	ProductionDate    string `json:"production_date" binding:"required"`
}

func (s *Server) allocateSerialGroup(c *gin.Context) {
	if _, _, ok := stationContext(c); !ok {
		return
	}
	var req allocateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	productionDate, err := time.Parse("2006-01-02", req.ProductionDate)
	if err != nil {
		fail(c, 400, fmt.Errorf("invalid production_date"))
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	_, _ = tx.Exec(c, `SELECT pg_advisory_xact_lock(26062901)`)

	var configID int64
	var capacity, planned, allocated, cycleRemaining, groupNumber int
	err = tx.QueryRow(c, `
		SELECT sol.packaging_config_id, pc.parts_per_small_box, po.planned_qty,
		       (SELECT COUNT(*) FROM t_units_tracking u
		        JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		        WHERE sg.production_order_id=po.id),
		       tc.planned_qty - (SELECT COUNT(*) FROM t_units_tracking u WHERE u.tray_cycle_id=tc.id),
		       COALESCE((SELECT MAX(group_number) FROM t_serial_groups WHERE production_order_id=po.id),0)+1
		FROM t_production_orders po
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_packaging_configs pc ON pc.id=sol.packaging_config_id
		JOIN t_tray_cycles tc ON tc.production_order_id=po.id AND tc.id=$2
		WHERE po.id=$1 AND po.status='IN_PROGRESS'
		FOR UPDATE OF po,tc
	`, req.ProductionOrderID, req.TrayCycleID).
		Scan(&configID, &capacity, &planned, &allocated, &cycleRemaining, &groupNumber)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("production order or tray cycle is unavailable"))
		return
	}
	size := min(capacity, planned-allocated, cycleRemaining)
	if size <= 0 {
		fail(c, http.StatusConflict, fmt.Errorf("no remaining quantity to allocate"))
		return
	}
	var groupID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_serial_groups
			(production_order_id,packaging_config_id,group_number,group_size,production_date)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, req.ProductionOrderID, configID, groupNumber, size, productionDate).Scan(&groupID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	serials := make([]string, 0, size)
	for position := 1; position <= size; position++ {
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
				(serial_sequence,serial_number,serial_group_id,tray_cycle_id,group_position)
			VALUES ($1,$2,$3,$4,$5)
		`, sequence, serial, groupID, req.TrayCycleID, position)
		if err != nil {
			fail(c, 500, err)
			return
		}
		serials = append(serials, serial)
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"serial_group_id": groupID, "size": size, "serials": serials})
}

type laserNextRequest struct {
	SerialGroupID int64  `json:"serial_group_id" binding:"required"`
	Idempotency   string `json:"idempotency_key" binding:"required"`
}

func (s *Server) laserNext(c *gin.Context) {
	_, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req laserNextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	key, err := uuid.Parse(req.Idempotency)
	if err != nil {
		fail(c, 400, fmt.Errorf("invalid idempotency_key"))
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var unitID int64
	var serial string
	err = tx.QueryRow(c, `
		SELECT id,serial_number FROM t_units_tracking
		WHERE serial_group_id=$1 AND status='ALLOCATED'
		ORDER BY group_position FOR UPDATE SKIP LOCKED LIMIT 1
	`, req.SerialGroupID).Scan(&unitID, &serial)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("no allocated unit remains"))
		return
	}
	_, err = tx.Exec(c, `UPDATE t_units_tracking SET status='LASER_PENDING',updated_at=NOW() WHERE id=$1`, unitID)
	if err == nil {
		_, err = tx.Exec(c, `
			INSERT INTO t_print_jobs
				(idempotency_key,entity_type,entity_id,station_id,device_role,payload)
			VALUES ($1,'UNIT',$2,$3,'LASER',$4)
		`, key, unitID, station, serial)
	}
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(202, gin.H{"unit_id": unitID, "serial_number": serial, "print_status": "QUEUED"})
}

type evaluateRequest struct {
	Idempotency string `json:"idempotency_key" binding:"required"`
	Serial      string `json:"serial_number" binding:"required"`
	Result      string `json:"result" binding:"required"`
	Reason      string `json:"reason"`
}

func (s *Server) evaluateQC(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req evaluateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	key, err := uuid.Parse(req.Idempotency)
	req.Serial = strings.TrimSpace(strings.ToUpper(req.Serial))
	req.Reason = strings.TrimSpace(req.Reason)
	if err != nil || (req.Result != "PASS" && req.Result != "REJECT") || (req.Result == "REJECT" && req.Reason == "") {
		fail(c, 400, fmt.Errorf("invalid QC request"))
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var existingResult string
	if tx.QueryRow(c, `SELECT result FROM t_qc_events WHERE idempotency_key=$1`, key).Scan(&existingResult) == nil {
		c.JSON(200, gin.H{"serial_number": req.Serial, "result": existingResult, "idempotent": true})
		return
	}
	var unitID, groupID, cycleID int64
	var current string
	err = tx.QueryRow(c, `
		SELECT id,serial_group_id,tray_cycle_id,status
		FROM t_units_tracking WHERE serial_number=$1 FOR UPDATE
	`, req.Serial).Scan(&unitID, &groupID, &cycleID, &current)
	if err != nil {
		fail(c, http.StatusNotFound, fmt.Errorf("serial not found"))
		return
	}
	if current == "PASSED_UNBOXED" || current == "PACKED" {
		fail(c, http.StatusConflict, fmt.Errorf("this serial has already passed QC and cannot be evaluated again"))
		return
	}
	if current != "QC_PENDING" && current != "REWORK" {
		fail(c, http.StatusConflict, fmt.Errorf("this serial is currently at %s and is not ready for QC", current))
		return
	}
	if current == "REWORK" && req.Result != "PASS" {
		fail(c, http.StatusConflict, fmt.Errorf("a rework return can only be completed with OK"))
		return
	}
	var reason any
	if req.Reason != "" {
		reason = req.Reason
	}
	_, err = tx.Exec(c, `
		INSERT INTO t_qc_events
			(idempotency_key,unit_id,tray_cycle_id,result,reason,operator_id,station_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, key, unitID, cycleID, req.Result, reason, operator, station)
	var reworkCode string
	if err == nil && req.Result == "PASS" {
		_, err = tx.Exec(c, `
			UPDATE t_units_tracking SET status='PASSED_UNBOXED',qc_passed_at=NOW(),updated_at=NOW() WHERE id=$1
		`, unitID)
		if err == nil {
			_, err = tx.Exec(c, `
				UPDATE t_rework_logs SET status='PASSED',passed_at=NOW()
				WHERE unit_id=$1 AND status='OPEN'
			`, unitID)
		}
	} else if err == nil {
		err = tx.QueryRow(c, `
			SELECT rework_code FROM t_rework_logs WHERE unit_id=$1 AND status='OPEN' LIMIT 1
		`, unitID).Scan(&reworkCode)
		if err != nil {
			var reworkID int64
			err = tx.QueryRow(c, `
				INSERT INTO t_rework_logs
					(rework_code,unit_id,attempt_number,reason,created_by)
				VALUES ('TEMP-' || $1,$1,1,$2,$3) RETURNING id
			`, unitID, req.Reason, operator).Scan(&reworkID)
			if err == nil {
				reworkCode = "RW-" + fmt.Sprintf("%010d", reworkID)
				_, err = tx.Exec(c, `UPDATE t_rework_logs SET rework_code=$2 WHERE id=$1`, reworkID, reworkCode)
			}
		} else {
			_, err = tx.Exec(c, `UPDATE t_rework_logs SET reason=$2 WHERE unit_id=$1 AND status='OPEN'`, unitID, req.Reason)
		}
		if err == nil {
			_, err = tx.Exec(c, `UPDATE t_units_tracking SET status='REWORK',updated_at=NOW() WHERE id=$1`, unitID)
		}
		if err == nil {
			_, err = tx.Exec(c, `
				INSERT INTO t_print_jobs
					(idempotency_key,entity_type,entity_id,station_id,device_role,payload)
				VALUES ($1,'REWORK',$2,$3,'REWORK_PRINTER',$4)
			`, key, unitID, station, "^XA^FD"+reworkCode+"^FS^XZ")
		}
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	_, err = tx.Exec(c, `
		UPDATE t_serial_groups sg SET status=CASE
			WHEN NOT EXISTS (SELECT 1 FROM t_units_tracking u WHERE u.serial_group_id=sg.id AND u.status <> 'PASSED_UNBOXED') THEN 'READY_TO_PACK'
			WHEN EXISTS (SELECT 1 FROM t_units_tracking u WHERE u.serial_group_id=sg.id AND u.status='REWORK') THEN 'WAITING_REWORK'
			ELSE 'QC_PROCESS' END
		WHERE sg.id=$1
	`, groupID)
	if err == nil {
		err = tx.Commit(c)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	inspectionType := "INITIAL"
	if current == "REWORK" {
		inspectionType = "REWORK"
	}
	response := gin.H{"serial_number": req.Serial, "result": req.Result, "inspection_type": inspectionType}
	if reworkCode != "" {
		response["rework_code"] = reworkCode
		response["print_status"] = "QUEUED"
	}
	c.JSON(200, response)
}

func parseID(raw string) (int64, error) {
	return strconv.ParseInt(raw, 10, 64)
}
