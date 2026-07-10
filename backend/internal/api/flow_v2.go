package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listQCSetupOrders(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT po.id,po.production_order_number,so.so_number,p.product_code,p.product_name,
		       po.planned_qty,COALESCE(SUM(qs.actual_qty) FILTER (WHERE qs.status<>'CANCELLED'),0)
		FROM t_production_orders po
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_qc_sessions qs ON qs.production_order_id=po.id
		WHERE po.status IN ('OPEN','IN_PROGRESS')
		GROUP BY po.id,so.id,p.id
		HAVING po.planned_qty > COALESCE(SUM(qs.actual_qty) FILTER (WHERE qs.status<>'CANCELLED'),0)
		ORDER BY po.created_at
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var po, so, productCode, productName string
		var planned, started int
		if err = rows.Scan(&id, &po, &so, &productCode, &productName, &planned, &started); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"production_order_id": id, "production_order_number": po, "so_number": so, "product_code": productCode, "product_name": productName, "order_qty": planned, "started_qty": started})
	}
	c.JSON(200, gin.H{"items": items})
}

type createQCSessionRequest struct {
	ProductionOrderID int64  `json:"production_order_id" binding:"required"`
	TrayCode          string `json:"tray_code" binding:"required"`
	ActualQty         int    `json:"actual_qty" binding:"required"`
}

func (s *Server) clearEmptyReworkTrayLock(ctx context.Context, trayID int64) {
	_, _ = s.db.Exec(ctx, `
		DELETE FROM t_rework_tray_locks
		WHERE tray_id=$1
		  AND NOT EXISTS (
		      SELECT 1 FROM t_pre_laser_units
		      WHERE rework_tray_id=$1
		        AND status IN ('REWORK','QC_PASSED_UNMARKED')
		        AND pass_tray_id IS NULL
		  )
	`, trayID)
}

func (s *Server) closeFinalizedTrayCycles(ctx context.Context, trayID int64) error {
	_, err := s.db.Exec(ctx, `
		UPDATE t_tray_cycles tc
		SET status='COMPLETED',completed_at=COALESCE(tc.completed_at,NOW())
		FROM t_qc_sessions qs
		WHERE qs.tray_cycle_id=tc.id
		  AND tc.tray_id=$1
		  AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
		  AND qs.status IN ('READY_FOR_LASER','LASER_COMPLETE','CANCELLED')
	`, trayID)
	return err
}

func (s *Server) activeTrayCycle(ctx context.Context, trayID int64) (code, status string, exists bool, err error) {
	err = s.db.QueryRow(ctx, `
		SELECT tray_cycle_code,status
		FROM t_tray_cycles
		WHERE tray_id=$1 AND status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
		ORDER BY id DESC LIMIT 1
	`, trayID).Scan(&code, &status)
	if err == pgx.ErrNoRows {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, err
	}
	return code, status, true, nil
}

func (s *Server) sourceTrayBlocker(ctx context.Context, trayID int64, trayCode string) (string, bool, error) {
	var session string
	err := s.db.QueryRow(ctx, `
		SELECT session_code
		FROM t_qc_sessions
		WHERE tray_id=$1 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
		ORDER BY started_at DESC LIMIT 1
	`, trayID).Scan(&session)
	if err != nil && err != pgx.ErrNoRows {
		return "", false, err
	}
	if err == nil {
		return fmt.Sprintf("%s already has unfinished Initial QC (%s). Use Resume Active QC below.", trayCode, session), true, nil
	}
	var passWaiting int
	if err = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM t_pre_laser_units WHERE pass_tray_id=$1 AND status='QC_PASSED_UNMARKED'`, trayID).Scan(&passWaiting); err != nil {
		return "", false, err
	}
	if passWaiting > 0 {
		return fmt.Sprintf("%s is currently a Pass Tray with %d items waiting for Laser. Open Laser Marking first.", trayCode, passWaiting), true, nil
	}
	var reworkWaiting int
	if err = s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM t_pre_laser_units
		WHERE rework_tray_id=$1
		  AND status IN ('REWORK','QC_PASSED_UNMARKED')
		  AND pass_tray_id IS NULL
	`, trayID).Scan(&reworkWaiting); err != nil {
		return "", false, err
	}
	if reworkWaiting > 0 {
		var locked bool
		if err = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM t_rework_tray_locks WHERE tray_id=$1)`, trayID).Scan(&locked); err != nil {
			return "", false, err
		}
		if locked {
			return fmt.Sprintf("%s is locked for Rework QC with %d items. Open Rework QC first.", trayCode, reworkWaiting), true, nil
		}
		return fmt.Sprintf("%s is currently a Rework Tray with %d items waiting. Open Rework QC first.", trayCode, reworkWaiting), true, nil
	}
	return "", false, nil
}

func (s *Server) validateQCTray(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	purpose := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("purpose", "SOURCE")))
	if purpose != "SOURCE" && purpose != "REWORK" && purpose != "PASS" && purpose != "OUTPUT_REWORK" {
		fail(c, 400, fmt.Errorf("invalid tray validation purpose"))
		return
	}
	var trayID int64
	var active bool
	var trayType string
	if err := s.db.QueryRow(c, `SELECT id,tray_type,is_active FROM m_trays WHERE tray_code=$1`, code).Scan(&trayID, &trayType, &active); err != nil || !active {
		fail(c, 404, fmt.Errorf("tray %s is not registered or inactive", code))
		return
	}
	s.clearEmptyReworkTrayLock(c, trayID)
	if err := s.closeFinalizedTrayCycles(c, trayID); err != nil {
		fail(c, 500, err)
		return
	}
	expectedType := map[string]string{"SOURCE": "SOURCE", "PASS": "PASS", "REWORK": "REWORK", "OUTPUT_REWORK": "REWORK"}[purpose]
	if trayType != "GENERAL" && trayType != expectedType {
		fail(c, 409, fmt.Errorf("tray %s is type %s; this step requires a %s tray", code, trayType, expectedType))
		return
	}
	if purpose == "SOURCE" {
		if message, blocked, err := s.sourceTrayBlocker(c, trayID, code); err != nil {
			fail(c, 500, err)
			return
		} else if blocked {
			fail(c, 409, fmt.Errorf("%s", message))
			return
		}
		cycleCode, cycleStatus, exists, err := s.activeTrayCycle(c, trayID)
		if err != nil {
			fail(c, 500, err)
			return
		}
		if exists {
			fail(c, 409, fmt.Errorf("%s has an unfinished tray cycle %s (%s). The system could not auto-close it; ask a supervisor to review this tray.", code, cycleCode, cycleStatus))
			return
		}
	}
	if purpose == "REWORK" {
		var count int
		if err := s.db.QueryRow(c, `SELECT COUNT(*) FROM t_pre_laser_units WHERE rework_tray_id=$1 AND status IN ('REWORK','QC_PASSED_UNMARKED') AND pass_tray_id IS NULL`, trayID).Scan(&count); err != nil {
			fail(c, 500, err)
			return
		}
		if count == 0 {
			fail(c, 409, fmt.Errorf("tray %s has no open Rework QC items", code))
			return
		}
		c.JSON(200, gin.H{"valid": true, "tray_code": code, "purpose": purpose, "item_count": count})
		return
	}
	if purpose == "OUTPUT_REWORK" {
		sessionID, err := parseID(c.Query("session_id"))
		if err != nil {
			fail(c, 400, fmt.Errorf("QC session is required to validate a pooled Rework Tray"))
			return
		}
		var productID int64
		var newQty int
		err = s.db.QueryRow(c, `
			SELECT sol.product_id,COUNT(pu.id) FILTER (WHERE pu.initial_result='REJECT')
			FROM t_qc_sessions qs
			JOIN t_production_orders po ON po.id=qs.production_order_id
			JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
			LEFT JOIN t_pre_laser_units pu ON pu.qc_session_id=qs.id
			WHERE qs.id=$1 AND qs.status='AWAITING_OUTPUT_TRAYS'
			GROUP BY sol.product_id
		`, sessionID).Scan(&productID, &newQty)
		if err != nil {
			fail(c, 409, fmt.Errorf("QC session is not ready to assign output trays"))
			return
		}
		var locked, busyOther, incompatible bool
		var existingQty int
		err = s.db.QueryRow(c, `
			SELECT EXISTS(SELECT 1 FROM t_rework_tray_locks WHERE tray_id=$1)
			       AND EXISTS(SELECT 1 FROM t_pre_laser_units WHERE rework_tray_id=$1 AND status IN ('REWORK','QC_PASSED_UNMARKED') AND pass_tray_id IS NULL),
			       EXISTS(
			           SELECT 1 FROM t_qc_sessions WHERE tray_id=$1 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
			       ) OR EXISTS(
			           SELECT 1 FROM t_pre_laser_units
			           WHERE pass_tray_id=$1 AND status='QC_PASSED_UNMARKED'
			       ),
			       EXISTS(
			           SELECT 1 FROM t_pre_laser_units existing
			           JOIN t_qc_sessions eqs ON eqs.id=existing.qc_session_id
			           JOIN t_production_orders epo ON epo.id=eqs.production_order_id
			           JOIN t_sales_order_lines esol ON esol.id=epo.sales_order_line_id
			           WHERE existing.rework_tray_id=$1
			             AND existing.status IN ('REWORK','QC_PASSED_UNMARKED')
			             AND existing.pass_tray_id IS NULL
			             AND esol.product_id<>$2
			       ),
			       (SELECT COUNT(*) FROM t_pre_laser_units WHERE rework_tray_id=$1 AND status IN ('REWORK','QC_PASSED_UNMARKED') AND pass_tray_id IS NULL)
		`, trayID, productID).Scan(&locked, &busyOther, &incompatible, &existingQty)
		if err != nil {
			fail(c, 500, err)
			return
		}
		if locked {
			fail(c, 409, fmt.Errorf("Rework Tray %s is locked for Rework QC", code))
			return
		}
		if busyOther {
			fail(c, 409, fmt.Errorf("tray %s is assigned to another active process", code))
			return
		}
		if incompatible {
			fail(c, 409, fmt.Errorf("Rework Tray %s contains a different product", code))
			return
		}
		c.JSON(200, gin.H{"valid": true, "tray_code": code, "purpose": purpose, "existing_qty": existingQty, "new_qty": newQty, "after_qty": existingQty + newQty, "status": "COLLECTING"})
		return
	}
	var occupied bool
	err := s.db.QueryRow(c, `
		SELECT EXISTS (
			SELECT 1 FROM t_qc_sessions
			WHERE tray_id=$1 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
		) OR EXISTS (
			SELECT 1 FROM t_pre_laser_units
			WHERE (pass_tray_id=$1 AND status='QC_PASSED_UNMARKED')
			   OR (rework_tray_id=$1 AND status='REWORK')
			   OR (rework_tray_id=$1 AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL)
		)
	`, trayID).Scan(&occupied)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if occupied {
		fail(c, 409, fmt.Errorf("tray %s is still assigned to another active process", code))
		return
	}
	c.JSON(200, gin.H{"valid": true, "tray_code": code, "purpose": purpose})
}

func (s *Server) lockReworkTray(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var trayID int64
	var trayType string
	if err = tx.QueryRow(c, `SELECT id,tray_type FROM m_trays WHERE tray_code=$1 AND is_active FOR UPDATE`, code).Scan(&trayID, &trayType); err != nil {
		fail(c, 404, fmt.Errorf("Rework Tray is not registered or inactive"))
		return
	}
	if trayType != "GENERAL" && trayType != "REWORK" {
		fail(c, 409, fmt.Errorf("tray %s is type %s; Rework QC requires a REWORK tray", code, trayType))
		return
	}
	var count int
	if err = tx.QueryRow(c, `SELECT COUNT(*) FROM t_pre_laser_units WHERE rework_tray_id=$1 AND status IN ('REWORK','QC_PASSED_UNMARKED') AND pass_tray_id IS NULL`, trayID).Scan(&count); err != nil {
		fail(c, 500, err)
		return
	}
	if count == 0 {
		fail(c, 409, fmt.Errorf("tray %s has no open Rework QC items", code))
		return
	}
	tag, err := tx.Exec(c, `INSERT INTO t_rework_tray_locks(tray_id,station_id,operator_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, trayID, station, operator)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if tag.RowsAffected() == 0 {
		var owner string
		if err = tx.QueryRow(c, `SELECT station_id FROM t_rework_tray_locks WHERE tray_id=$1`, trayID).Scan(&owner); err != nil || owner != station {
			fail(c, 409, fmt.Errorf("Rework Tray %s is locked by station %s", code, owner))
			return
		}
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"tray_code": code, "status": "LOCKED_FOR_QC", "item_count": count})
}

func (s *Server) listActiveReworkTrays(c *gin.Context) {
	_, station, ok := stationContext(c)
	if !ok {
		return
	}
	rows, err := s.db.Query(c, `
		SELECT t.tray_code,l.locked_at,
		       COUNT(pu.id) FILTER (WHERE pu.status='REWORK'),
		       COUNT(pu.id) FILTER (WHERE pu.status='QC_PASSED_UNMARKED' AND pu.pass_tray_id IS NULL)
		FROM t_rework_tray_locks l
		JOIN m_trays t ON t.id=l.tray_id
		LEFT JOIN t_pre_laser_units pu ON pu.rework_tray_id=l.tray_id
			AND pu.status IN ('REWORK','QC_PASSED_UNMARKED')
			AND pu.pass_tray_id IS NULL
		WHERE l.station_id=$1
		GROUP BY t.tray_code,l.locked_at
		HAVING COUNT(pu.id) FILTER (WHERE pu.status IN ('REWORK','QC_PASSED_UNMARKED')) > 0
		ORDER BY l.locked_at DESC
	`, station)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var trayCode string
		var lockedAt time.Time
		var openCount, stagedCount int
		if err = rows.Scan(&trayCode, &lockedAt, &openCount, &stagedCount); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"tray_code": trayCode, "locked_at": lockedAt, "open_count": openCount, "staged_count": stagedCount, "total_count": openCount + stagedCount})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) unlockReworkTray(c *gin.Context) {
	_, station, ok := stationContext(c)
	if !ok {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	tag, err := s.db.Exec(c, `DELETE FROM t_rework_tray_locks l USING m_trays t WHERE l.tray_id=t.id AND t.tray_code=$1 AND l.station_id=$2`, code, station)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(c, 409, fmt.Errorf("Rework Tray is not locked by this station"))
		return
	}
	c.JSON(200, gin.H{"tray_code": code, "status": "COLLECTING"})
}

func (s *Server) createQCSession(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req createQCSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ActualQty <= 0 {
		fail(c, 400, fmt.Errorf("production order, tray, and positive actual quantity are required"))
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var trayID int64
	var active bool
	var trayType string
	if err = tx.QueryRow(c, `SELECT id,tray_type,is_active FROM m_trays WHERE tray_code=$1 FOR UPDATE`, strings.ToUpper(strings.TrimSpace(req.TrayCode))).Scan(&trayID, &trayType, &active); err != nil || !active {
		fail(c, 409, fmt.Errorf("tray label is not registered or inactive"))
		return
	}
	s.clearEmptyReworkTrayLock(c, trayID)
	if err = s.closeFinalizedTrayCycles(c, trayID); err != nil {
		fail(c, 500, err)
		return
	}
	if trayType != "GENERAL" && trayType != "SOURCE" {
		fail(c, 409, fmt.Errorf("Initial QC requires a SOURCE tray; scanned tray is %s", trayType))
		return
	}
	if message, blocked, err := s.sourceTrayBlocker(c, trayID, strings.ToUpper(strings.TrimSpace(req.TrayCode))); err != nil {
		fail(c, 500, err)
		return
	} else if blocked {
		fail(c, http.StatusConflict, fmt.Errorf("%s", message))
		return
	}
	if cycleCode, cycleStatus, exists, err := s.activeTrayCycle(c, trayID); err != nil {
		fail(c, 500, err)
		return
	} else if exists {
		fail(c, http.StatusConflict, fmt.Errorf("%s has an unfinished tray cycle %s (%s). The system could not auto-close it; ask a supervisor to review this tray.", strings.ToUpper(strings.TrimSpace(req.TrayCode)), cycleCode, cycleStatus))
		return
	}
	var occupied bool
	if err = tx.QueryRow(c, `
		SELECT EXISTS (
			SELECT 1 FROM t_qc_sessions
			WHERE tray_id=$1 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
		) OR EXISTS (
			SELECT 1 FROM t_pre_laser_units
			WHERE (pass_tray_id=$1 AND status='QC_PASSED_UNMARKED')
			   OR (rework_tray_id=$1 AND status='REWORK')
			   OR (rework_tray_id=$1 AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL)
		)
	`, trayID).Scan(&occupied); err != nil {
		fail(c, 500, err)
		return
	}
	if occupied {
		fail(c, 409, fmt.Errorf("tray is still assigned to another active process"))
		return
	}
	var plannedQty, startedQty int
	if err = tx.QueryRow(c, `
		SELECT po.planned_qty
		FROM t_production_orders po
		WHERE po.id=$1 AND po.status IN ('OPEN','IN_PROGRESS')
		FOR UPDATE
	`, req.ProductionOrderID).Scan(&plannedQty); err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("production order is unavailable for Initial QC"))
		return
	}
	if err = tx.QueryRow(c, `
		SELECT COALESCE(SUM(actual_qty) FILTER (WHERE status<>'CANCELLED'),0)
		FROM t_qc_sessions
		WHERE production_order_id=$1
	`, req.ProductionOrderID).Scan(&startedQty); err != nil {
		fail(c, 500, err)
		return
	}
	remainingQty := plannedQty - startedQty
	if remainingQty <= 0 {
		fail(c, http.StatusConflict, fmt.Errorf("production order is already completed"))
		return
	}
	if req.ActualQty > remainingQty {
		fail(c, http.StatusConflict, fmt.Errorf("actual quantity exceeds remaining order quantity (%d)", remainingQty))
		return
	}
	var cycle int
	if err = tx.QueryRow(c, `SELECT COALESCE(MAX(cycle_number),0)+1 FROM t_tray_cycles WHERE tray_id=$1`, trayID).Scan(&cycle); err != nil {
		fail(c, 500, err)
		return
	}
	code := fmt.Sprintf("%s-QC%06d", strings.ToUpper(strings.TrimSpace(req.TrayCode)), cycle)
	var trayCycleID int64
	err = tx.QueryRow(c, `INSERT INTO t_tray_cycles (tray_cycle_code,tray_id,production_order_id,cycle_number,planned_qty,operator_id,status) VALUES ($1,$2,$3,$4,$5,$6,'QC_PROCESS') RETURNING id`, code, trayID, req.ProductionOrderID, cycle, req.ActualQty, operator).Scan(&trayCycleID)
	if err != nil {
		if strings.Contains(err.Error(), "uq_tray_active_cycle") {
			fail(c, http.StatusConflict, fmt.Errorf("%s already has unfinished Initial QC. Use Resume Active QC below.", strings.ToUpper(strings.TrimSpace(req.TrayCode))))
			return
		}
		fail(c, 409, err)
		return
	}
	var sessionID int64
	sessionCode := "QCS-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:12])
	err = tx.QueryRow(c, `INSERT INTO t_qc_sessions (session_code,tray_id,tray_cycle_id,production_order_id,actual_qty,operator_id,started_station_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, sessionCode, trayID, trayCycleID, req.ProductionOrderID, req.ActualQty, operator, station).Scan(&sessionID)
	if err == nil {
		_, err = tx.Exec(c, `INSERT INTO t_pre_laser_units (qc_session_id,inspection_sequence) SELECT $1,generate_series(1,$2)`, sessionID, req.ActualQty)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_production_orders SET status='IN_PROGRESS',updated_at=NOW() WHERE id=$1`, req.ProductionOrderID)
	}
	if err != nil {
		fail(c, 409, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": sessionID, "session_code": sessionCode, "tray_cycle_id": trayCycleID})
}

func (s *Server) getQCSession(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var sessionCode, trayCode, po, so, productCode, productName, status, operator string
	var qcImage *string
	var startedStation, completedBy, completedStation, finalizedBy, finalizedStation *string
	var startedAt time.Time
	var completedAt, finalizedAt *time.Time
	var qty, inspected, okQty, ngQty int
	err = s.db.QueryRow(c, `
		SELECT qs.session_code,t.tray_code,po.production_order_number,so.so_number,p.product_code,p.product_name,p.qc_image_data_url,
		       qs.actual_qty,qs.inspected_qty,qs.status,qs.operator_id,qs.started_station_id,qs.started_at,
		       qs.completed_by_operator_id,qs.completed_station_id,qs.completed_at,
		       qs.finalized_by_operator_id,qs.finalized_station_id,qs.finalized_at,
		       COUNT(pu.id) FILTER (WHERE pu.initial_result='PASS'),
		       COUNT(pu.id) FILTER (WHERE pu.initial_result='REJECT')
		FROM t_qc_sessions qs JOIN m_trays t ON t.id=qs.tray_id
		JOIN t_production_orders po ON po.id=qs.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id LEFT JOIN t_pre_laser_units pu ON pu.qc_session_id=qs.id
		WHERE qs.id=$1 GROUP BY qs.id,t.id,po.id,so.id,p.id
	`, id).Scan(&sessionCode, &trayCode, &po, &so, &productCode, &productName, &qcImage, &qty, &inspected, &status, &operator, &startedStation, &startedAt, &completedBy, &completedStation, &completedAt, &finalizedBy, &finalizedStation, &finalizedAt, &okQty, &ngQty)
	if err != nil {
		fail(c, 404, fmt.Errorf("QC session not found"))
		return
	}
	c.JSON(200, gin.H{"id": id, "session_code": sessionCode, "tray_code": trayCode, "production_order_number": po, "so_number": so, "product_code": productCode, "product_name": productName, "qc_image_data_url": qcImage, "actual_qty": qty, "inspected_qty": inspected, "ok_qty": okQty, "ng_qty": ngQty, "remaining_qty": qty - inspected, "status": status, "operator_id": operator, "started_station_id": startedStation, "started_at": startedAt, "completed_by_operator_id": completedBy, "completed_station_id": completedStation, "completed_at": completedAt, "finalized_by_operator_id": finalizedBy, "finalized_station_id": finalizedStation, "finalized_at": finalizedAt})
}

func (s *Server) listActiveQCSessions(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT qs.id,qs.session_code,t.tray_code,po.production_order_number,so.so_number,
		       p.product_code,p.product_name,p.qc_image_data_url,qs.actual_qty,qs.inspected_qty,qs.status,
		       qs.operator_id,qs.started_station_id,qs.started_at,qs.completed_by_operator_id,qs.completed_station_id,qs.completed_at,
		       COUNT(pu.id) FILTER (WHERE pu.initial_result='PASS'),
		       COUNT(pu.id) FILTER (WHERE pu.initial_result='REJECT')
		FROM t_qc_sessions qs
		JOIN m_trays t ON t.id=qs.tray_id
		JOIN t_production_orders po ON po.id=qs.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_pre_laser_units pu ON pu.qc_session_id=qs.id
		WHERE qs.status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
		GROUP BY qs.id,t.id,po.id,so.id,p.id
		ORDER BY qs.started_at DESC
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var sessionCode, trayCode, po, so, productCode, productName, status, operator string
		var qcImage *string
		var startedStation, completedBy, completedStation *string
		var startedAt time.Time
		var completedAt *time.Time
		var qty, inspected, okQty, ngQty int
		if err = rows.Scan(&id, &sessionCode, &trayCode, &po, &so, &productCode, &productName, &qcImage, &qty, &inspected, &status, &operator, &startedStation, &startedAt, &completedBy, &completedStation, &completedAt, &okQty, &ngQty); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"id": id, "session_code": sessionCode, "tray_code": trayCode, "production_order_number": po, "so_number": so, "product_code": productCode, "product_name": productName, "qc_image_data_url": qcImage, "actual_qty": qty, "inspected_qty": inspected, "ok_qty": okQty, "ng_qty": ngQty, "remaining_qty": qty - inspected, "status": status, "operator_id": operator, "started_station_id": startedStation, "started_at": startedAt, "completed_by_operator_id": completedBy, "completed_station_id": completedStation, "completed_at": completedAt})
	}
	c.JSON(200, gin.H{"items": items})
}

type evaluateSessionRequest struct {
	Result       string `json:"result" binding:"required"`
	Reason       string `json:"reason"`
	NGCategoryID int64  `json:"ng_category_id"`
}

func (s *Server) evaluateQCSessionItem(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req evaluateSessionRequest
	if err = c.ShouldBindJSON(&req); err != nil || (req.Result != "PASS" && req.Result != "REJECT") || (req.Result == "REJECT" && req.NGCategoryID <= 0) {
		fail(c, 400, fmt.Errorf("select a valid QC result and NG category"))
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var unitID int64
	var sequence int
	err = tx.QueryRow(c, `SELECT id,inspection_sequence FROM t_pre_laser_units WHERE qc_session_id=$1 AND status='QC_PENDING' ORDER BY inspection_sequence FOR UPDATE SKIP LOCKED LIMIT 1`, id).Scan(&unitID, &sequence)
	if err != nil {
		fail(c, 409, fmt.Errorf("QC session has no remaining item"))
		return
	}
	var reworkCode *string
	if req.Result == "PASS" {
		_, err = tx.Exec(c, `UPDATE t_pre_laser_units SET status='QC_PASSED_UNMARKED',initial_result='PASS',ng_category_id=NULL,ng_reason=NULL,qc_operator_id=$2,initial_qc_operator_id=$2,initial_qc_station_id=$3,inspected_at=NOW() WHERE id=$1`, unitID, operator, station)
	} else {
		var reason string
		if err = tx.QueryRow(c, `SELECT category_name FROM m_ng_categories WHERE id=$1 AND is_active`, req.NGCategoryID).Scan(&reason); err != nil {
			fail(c, 409, fmt.Errorf("selected NG category is inactive or not found"))
			return
		}
		code := fmt.Sprintf("RW-%010d", unitID)
		reworkCode = &code
		_, err = tx.Exec(c, `UPDATE t_pre_laser_units SET status='REWORK',initial_result='REJECT',rework_code=$2,ng_category_id=$3,ng_reason=$4,qc_operator_id=$5,initial_qc_operator_id=$5,initial_qc_station_id=$6,inspected_at=NOW() WHERE id=$1`, unitID, code, req.NGCategoryID, reason, operator, station)
		if err == nil {
			payload := fmt.Sprintf("^XA^FO30,25^A0N,32,32^FDREWORK^FS^FO30,70^BY2^BCN,70,Y,N,N^FD%s^FS^FO30,175^A0N,22,22^FD%s^FS^XZ", code, reason)
			_, err = tx.Exec(c, `INSERT INTO t_print_jobs(idempotency_key,entity_type,entity_id,station_id,device_role,payload) VALUES($1,'REWORK',$2,$3,'REWORK_PRINTER',$4)`, uuid.New(), unitID, station, payload)
		}
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_qc_sessions SET inspected_qty=inspected_qty+1 WHERE id=$1`, id)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_qc_sessions SET status='AWAITING_OUTPUT_TRAYS',completed_at=NOW(),completed_by_operator_id=$2,completed_station_id=$3 WHERE id=$1 AND inspected_qty=actual_qty`, id, operator, station)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	response := gin.H{"inspection_sequence": sequence, "result": req.Result, "rework_code": reworkCode}
	if reworkCode != nil {
		response["print_status"] = "QUEUED"
	}
	c.JSON(200, response)
}

func (s *Server) finishQCSession(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		PassTrayCode   string `json:"pass_tray_code"`
		ReworkTrayCode string `json:"rework_tray_code"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var sourceTrayID, productID int64
	var okQty, ngQty int
	err = tx.QueryRow(c, `SELECT qs.tray_id,sol.product_id,(SELECT COUNT(*) FROM t_pre_laser_units WHERE qc_session_id=$1 AND initial_result='PASS'),(SELECT COUNT(*) FROM t_pre_laser_units WHERE qc_session_id=$1 AND initial_result='REJECT') FROM t_qc_sessions qs JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id WHERE qs.id=$1 AND qs.status='AWAITING_OUTPUT_TRAYS' FOR UPDATE`, id).Scan(&sourceTrayID, &productID, &okQty, &ngQty)
	if err != nil {
		fail(c, 409, fmt.Errorf("QC session is not ready to finish"))
		return
	}
	var passTrayID, reworkTrayID *int64
	resolve := func(code string, allowReworkPool bool) (*int64, error) {
		var trayID int64
		var trayType string
		err := tx.QueryRow(c, `SELECT id,tray_type FROM m_trays WHERE tray_code=$1 AND is_active`, strings.ToUpper(strings.TrimSpace(code))).Scan(&trayID, &trayType)
		if err != nil {
			return &trayID, err
		}
		expectedType := "PASS"
		if allowReworkPool {
			expectedType = "REWORK"
		}
		if trayType != "GENERAL" && trayType != expectedType {
			return &trayID, fmt.Errorf("tray type is %s; expected %s", trayType, expectedType)
		}
		var occupied bool
		if allowReworkPool {
			var locked, incompatible bool
			err = tx.QueryRow(c, `
				SELECT EXISTS(SELECT 1 FROM t_rework_tray_locks WHERE tray_id=$1)
				       AND EXISTS(SELECT 1 FROM t_pre_laser_units WHERE rework_tray_id=$1 AND status IN ('REWORK','QC_PASSED_UNMARKED') AND pass_tray_id IS NULL),
				       EXISTS(
				           SELECT 1 FROM t_qc_sessions WHERE tray_id=$1 AND id<>$3 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
				       ) OR EXISTS(
				           SELECT 1 FROM t_pre_laser_units WHERE pass_tray_id=$1 AND status='QC_PASSED_UNMARKED'
				       ),
				       EXISTS(
				           SELECT 1 FROM t_pre_laser_units existing
				           JOIN t_qc_sessions eqs ON eqs.id=existing.qc_session_id
				           JOIN t_production_orders epo ON epo.id=eqs.production_order_id
				           JOIN t_sales_order_lines esol ON esol.id=epo.sales_order_line_id
				           WHERE existing.rework_tray_id=$1
				             AND existing.status IN ('REWORK','QC_PASSED_UNMARKED')
				             AND existing.pass_tray_id IS NULL
				             AND esol.product_id<>$2
				       )
			`, trayID, productID, id).Scan(&locked, &occupied, &incompatible)
			if err == nil && locked {
				err = fmt.Errorf("tray is locked for Rework QC")
			}
			if err == nil && occupied {
				err = fmt.Errorf("tray is assigned to another active process")
			}
			if err == nil && incompatible {
				err = fmt.Errorf("tray contains a different product")
			}
			return &trayID, err
		}
		err = tx.QueryRow(c, `
			SELECT EXISTS (
				SELECT 1 FROM t_qc_sessions
				WHERE tray_id=$1 AND id<>$2 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
			) OR EXISTS (
				SELECT 1 FROM t_pre_laser_units
				WHERE (pass_tray_id=$1 AND status='QC_PASSED_UNMARKED')
				   OR (rework_tray_id=$1 AND status='REWORK')
				   OR (rework_tray_id=$1 AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL)
			)
		`, trayID, id).Scan(&occupied)
		if err == nil && occupied {
			err = fmt.Errorf("tray is still assigned to another active process")
		}
		return &trayID, err
	}
	if okQty > 0 {
		if strings.TrimSpace(req.PassTrayCode) == "" {
			fail(c, 400, fmt.Errorf("scan a Pass Tray for %d OK items", okQty))
			return
		}
		passTrayID, err = resolve(req.PassTrayCode, false)
		if err != nil {
			fail(c, 409, fmt.Errorf("Pass Tray is unavailable: %v", err))
			return
		}
	}
	if ngQty > 0 {
		if strings.TrimSpace(req.ReworkTrayCode) == "" {
			fail(c, 400, fmt.Errorf("scan a Rework Tray for %d NG items", ngQty))
			return
		}
		reworkTrayID, err = resolve(req.ReworkTrayCode, true)
		if err != nil {
			fail(c, 409, fmt.Errorf("Rework Tray is unavailable: %v", err))
			return
		}
	}
	if (passTrayID != nil && *passTrayID == sourceTrayID) || (reworkTrayID != nil && *reworkTrayID == sourceTrayID) || (passTrayID != nil && reworkTrayID != nil && *passTrayID == *reworkTrayID) {
		fail(c, 409, fmt.Errorf("Source, Pass, and Rework trays must be different"))
		return
	}
	if _, err = tx.Exec(c, `UPDATE t_pre_laser_units SET pass_tray_id=CASE WHEN initial_result='PASS' THEN $2 ELSE pass_tray_id END,rework_tray_id=CASE WHEN initial_result='REJECT' THEN $3 ELSE rework_tray_id END WHERE qc_session_id=$1`, id, passTrayID, reworkTrayID); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec(c, `UPDATE t_qc_sessions SET pass_tray_id=$2,rework_tray_id=$3,status='READY_FOR_LASER',finalized_at=NOW(),finalized_by_operator_id=$4,finalized_station_id=$5 WHERE id=$1`, id, passTrayID, reworkTrayID, operator, station); err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = tx.Exec(c, `
		UPDATE t_tray_cycles tc
		SET status='COMPLETED',completed_at=COALESCE(tc.completed_at,NOW())
		FROM t_qc_sessions qs
		WHERE qs.tray_cycle_id=tc.id
		  AND qs.id=$1
		  AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
	`, id); err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": id, "ok_qty": okQty, "ng_qty": ngQty, "status": "READY_FOR_LASER"})
}

func (s *Server) listPreLaserReworks(c *gin.Context) {
	rows, err := s.db.Query(c, `SELECT pu.rework_code,pu.ng_reason,pu.inspected_at,qs.session_code,t.tray_code,rt.tray_code,po.production_order_number,so.so_number,p.product_code,p.product_name FROM t_pre_laser_units pu JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id JOIN m_trays t ON t.id=qs.tray_id JOIN m_trays rt ON rt.id=pu.rework_tray_id JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN t_sales_orders so ON so.id=sol.sales_order_id JOIN m_products p ON p.id=sol.product_id WHERE pu.status='REWORK' ORDER BY pu.inspected_at`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var code, reason, session, tray, po, so, pc, pn string
		var reworkTray *string
		var at time.Time
		if err = rows.Scan(&code, &reason, &at, &session, &tray, &reworkTray, &po, &so, &pc, &pn); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"rework_code": code, "reason": reason, "ng_at": at, "session_code": session, "original_tray": tray, "rework_tray": reworkTray, "production_order": po, "so_number": so, "product_code": pc, "product_name": pn})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) getPreLaserRework(c *gin.Context) {
	var code, reason, session, tray, po, so, pc, pn, status string
	var image, reworkTray *string
	err := s.db.QueryRow(c, `SELECT pu.rework_code,pu.ng_reason,pu.status,qs.session_code,t.tray_code,rt.tray_code,po.production_order_number,so.so_number,p.product_code,p.product_name,p.qc_image_data_url FROM t_pre_laser_units pu JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id JOIN m_trays t ON t.id=qs.tray_id JOIN m_trays rt ON rt.id=pu.rework_tray_id JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN t_sales_orders so ON so.id=sol.sales_order_id JOIN m_products p ON p.id=sol.product_id WHERE pu.rework_code=$1 AND pu.status='REWORK'`, strings.ToUpper(c.Param("code"))).Scan(&code, &reason, &status, &session, &tray, &reworkTray, &po, &so, &pc, &pn, &image)
	if err != nil {
		fail(c, 404, fmt.Errorf("open rework item not found"))
		return
	}
	c.JSON(200, gin.H{"rework_code": code, "reason": reason, "status": status, "session_code": session, "original_tray": tray, "rework_tray": reworkTray, "production_order": po, "so_number": so, "product_code": pc, "product_name": pn, "qc_image_data_url": image})
}

func (s *Server) passPreLaserRework(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	tag, err := s.db.Exec(c, `UPDATE t_pre_laser_units SET status='QC_PASSED_UNMARKED',rework_passed_at=NOW(),qc_operator_id=$2,rework_qc_operator_id=$2,rework_qc_station_id=$3 WHERE rework_code=$1 AND status='REWORK' AND rework_tray_id IS NOT NULL`, strings.ToUpper(c.Param("code")), operator, station)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 409, fmt.Errorf("rework item is unavailable"))
		return
	}
	c.JSON(200, gin.H{"rework_code": strings.ToUpper(c.Param("code")), "status": "QC_PASSED_UNMARKED"})
}

func (s *Server) listStagedReworks(c *gin.Context) {
	rows, err := s.db.Query(c, `SELECT pu.rework_code,pu.ng_reason,qs.session_code,t.tray_code,rt.tray_code,so.so_number,p.product_code,p.product_name FROM t_pre_laser_units pu JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id JOIN m_trays t ON t.id=qs.tray_id LEFT JOIN m_trays rt ON rt.id=pu.rework_tray_id JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN t_sales_orders so ON so.id=sol.sales_order_id JOIN m_products p ON p.id=sol.product_id WHERE pu.initial_result='REJECT' AND pu.status='QC_PASSED_UNMARKED' AND pu.pass_tray_id IS NULL ORDER BY pu.rework_passed_at`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var code, reason, session, tray, so, pc, pn string
		var reworkTray *string
		if err = rows.Scan(&code, &reason, &session, &tray, &reworkTray, &so, &pc, &pn); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"rework_code": code, "reason": reason, "session_code": session, "original_tray": tray, "rework_tray": reworkTray, "so_number": so, "product_code": pc, "product_name": pn})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) listPreLaserQCHistory(c *gin.Context) {
	stage := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("stage", "INITIAL")))
	if stage != "INITIAL" && stage != "REWORK" {
		fail(c, 400, fmt.Errorf("QC history stage must be INITIAL or REWORK"))
		return
	}
	rows, err := s.db.Query(c, `
		SELECT pu.id,pu.inspection_sequence,pu.initial_result,pu.ng_reason,pu.rework_code,
		       qs.session_code,source.tray_code,rework_tray.tray_code,pass_tray.tray_code,
		       po.production_order_number,so.so_number,p.product_code,p.product_name,
		       qs.operator_id,qs.started_station_id,qs.started_at,
		       qs.completed_by_operator_id,qs.completed_station_id,qs.completed_at,
		       qs.finalized_by_operator_id,qs.finalized_station_id,qs.finalized_at,
		       CASE WHEN $1='INITIAL' THEN pu.initial_qc_operator_id ELSE pu.rework_qc_operator_id END,
		       CASE WHEN $1='INITIAL' THEN pu.initial_qc_station_id ELSE pu.rework_qc_station_id END,
		       CASE WHEN $1='INITIAL' THEN pu.inspected_at ELSE pu.rework_passed_at END
		FROM t_pre_laser_units pu
		JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id
		JOIN m_trays source ON source.id=qs.tray_id
		LEFT JOIN m_trays rework_tray ON rework_tray.id=pu.rework_tray_id
		LEFT JOIN m_trays pass_tray ON pass_tray.id=pu.pass_tray_id
		JOIN t_production_orders po ON po.id=qs.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		WHERE ($1='INITIAL' AND pu.initial_result IS NOT NULL)
		   OR ($1='REWORK' AND pu.rework_passed_at IS NOT NULL)
		ORDER BY CASE WHEN $1='INITIAL' THEN pu.inspected_at ELSE pu.rework_passed_at END DESC
		LIMIT 5000
	`, stage)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var sequence int
		var initialResult, sessionCode, sourceTray, productionOrder, soNumber, productCode, productName, sessionOperator string
		var reason, reworkCode, reworkTray, passTray, startedStation, completedBy, completedStation, finalizedBy, finalizedStation, operator, station *string
		var startedAt time.Time
		var completedAt, finalizedAt, inspectedAt *time.Time
		if err = rows.Scan(&id, &sequence, &initialResult, &reason, &reworkCode, &sessionCode,
			&sourceTray, &reworkTray, &passTray, &productionOrder, &soNumber, &productCode,
			&productName, &sessionOperator, &startedStation, &startedAt, &completedBy, &completedStation,
			&completedAt, &finalizedBy, &finalizedStation, &finalizedAt, &operator, &station, &inspectedAt); err != nil {
			fail(c, 500, err)
			return
		}
		result := initialResult
		if stage == "REWORK" {
			result = "PASS"
		}
		items = append(items, gin.H{
			"id": id, "stage": stage, "sequence": sequence, "result": result,
			"reason": reason, "rework_code": reworkCode, "session_code": sessionCode,
			"source_tray": sourceTray, "rework_tray": reworkTray, "pass_tray": passTray,
			"production_order": productionOrder, "so_number": soNumber,
			"product_code": productCode, "product_name": productName,
			"session_operator_id": sessionOperator, "started_station_id": startedStation,
			"started_at": startedAt, "completed_by_operator_id": completedBy,
			"completed_station_id": completedStation, "completed_at": completedAt,
			"finalized_by_operator_id": finalizedBy, "finalized_station_id": finalizedStation,
			"finalized_at": finalizedAt,
			"operator_id":  operator, "station_id": station, "inspected_at": inspectedAt,
		})
	}
	c.JSON(200, gin.H{"items": items, "stage": stage})
}

func (s *Server) finishReworkBatch(c *gin.Context) {
	_, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req struct {
		ReworkCodes  []string `json:"rework_codes" binding:"required,min=1"`
		PassTrayCode string   `json:"pass_tray_code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var trayID int64
	var passTrayType string
	if err = tx.QueryRow(c, `SELECT id,tray_type FROM m_trays WHERE tray_code=$1 AND is_active FOR UPDATE`, strings.ToUpper(strings.TrimSpace(req.PassTrayCode))).Scan(&trayID, &passTrayType); err != nil {
		fail(c, 409, fmt.Errorf("Pass Tray is not registered"))
		return
	}
	if passTrayType != "GENERAL" && passTrayType != "PASS" {
		fail(c, 409, fmt.Errorf("destination tray must be type PASS"))
		return
	}
	var destinationOccupied bool
	if err = tx.QueryRow(c, `
		SELECT EXISTS (
			SELECT 1 FROM t_qc_sessions
			WHERE tray_id=$1 AND status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS')
		) OR EXISTS (
			SELECT 1 FROM t_pre_laser_units
			WHERE (pass_tray_id=$1 AND status='QC_PASSED_UNMARKED')
			   OR (rework_tray_id=$1 AND status='REWORK')
			   OR (rework_tray_id=$1 AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL)
		)
	`, trayID).Scan(&destinationOccupied); err != nil {
		fail(c, 500, err)
		return
	}
	if destinationOccupied {
		fail(c, 409, fmt.Errorf("destination Pass Tray is still assigned to another active process"))
		return
	}
	var reworkTrayID int64
	var selected int
	err = tx.QueryRow(c, `SELECT MIN(rework_tray_id),COUNT(*) FROM t_pre_laser_units WHERE rework_code=ANY($1) AND initial_result='REJECT' AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL HAVING COUNT(DISTINCT rework_tray_id)=1`, req.ReworkCodes).Scan(&reworkTrayID, &selected)
	if err != nil || selected != len(req.ReworkCodes) {
		fail(c, 409, fmt.Errorf("selected rework items are incomplete or belong to different trays"))
		return
	}
	if reworkTrayID == trayID {
		fail(c, 409, fmt.Errorf("destination Pass Tray must be different from the Rework Tray"))
		return
	}
	var lockStation string
	if err = tx.QueryRow(c, `SELECT station_id FROM t_rework_tray_locks WHERE tray_id=$1`, reworkTrayID).Scan(&lockStation); err != nil || lockStation != station {
		fail(c, 409, fmt.Errorf("Rework Tray must be locked by this station before release"))
		return
	}
	var openCount, stagedCount int
	if err = tx.QueryRow(c, `SELECT COUNT(*) FILTER (WHERE status='REWORK'),COUNT(*) FILTER (WHERE status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL) FROM t_pre_laser_units WHERE rework_tray_id=$1`, reworkTrayID).Scan(&openCount, &stagedCount); err != nil {
		fail(c, 500, err)
		return
	}
	if openCount > 0 || stagedCount != selected {
		fail(c, 409, fmt.Errorf("complete every item in the Rework Tray before release"))
		return
	}
	tag, err := tx.Exec(c, `UPDATE t_pre_laser_units SET pass_tray_id=$2 WHERE rework_code=ANY($1) AND initial_result='REJECT' AND status='QC_PASSED_UNMARKED' AND pass_tray_id IS NULL`, req.ReworkCodes, trayID)
	if err != nil || tag.RowsAffected() != int64(len(req.ReworkCodes)) {
		fail(c, 409, fmt.Errorf("one or more staged rework items are unavailable"))
		return
	}
	if _, err = tx.Exec(c, `DELETE FROM t_rework_tray_locks WHERE tray_id=$1`, reworkTrayID); err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"pass_tray_code": strings.ToUpper(strings.TrimSpace(req.PassTrayCode)), "quantity": len(req.ReworkCodes)})
}

func (s *Server) listLaserReady(c *gin.Context) {
	rows, err := s.db.Query(c, `SELECT qs.id,qs.session_code,t.tray_code,po.production_order_number,so.so_number,p.product_code,p.product_name,COUNT(pu.id) FILTER (WHERE pu.status='QC_PASSED_UNMARKED' AND pu.initial_result='PASS' AND pu.pass_tray_id IS NOT NULL),COUNT(pu.id) FILTER (WHERE pu.status='QC_PASSED_UNMARKED' AND pu.initial_result='REJECT' AND pu.pass_tray_id IS NOT NULL),MAX(pt.tray_code) FILTER (WHERE pu.initial_result='PASS'),MAX(pt.tray_code) FILTER (WHERE pu.initial_result='REJECT') FROM t_qc_sessions qs JOIN m_trays t ON t.id=qs.tray_id JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN t_sales_orders so ON so.id=sol.sales_order_id JOIN m_products p ON p.id=sol.product_id JOIN t_pre_laser_units pu ON pu.qc_session_id=qs.id LEFT JOIN m_trays pt ON pt.id=pu.pass_tray_id GROUP BY qs.id,t.id,po.id,so.id,p.id HAVING COUNT(pu.id) FILTER (WHERE pu.status='QC_PASSED_UNMARKED' AND pu.pass_tray_id IS NOT NULL)>0 ORDER BY qs.started_at`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var session, tray, po, so, pc, pn string
		var direct, rework int
		var directPassTray, reworkPassTray *string
		if err = rows.Scan(&id, &session, &tray, &po, &so, &pc, &pn, &direct, &rework, &directPassTray, &reworkPassTray); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"qc_session_id": id, "session_code": session, "original_tray": tray, "direct_pass_tray": directPassTray, "rework_pass_tray": reworkPassTray, "production_order": po, "so_number": so, "product_code": pc, "product_name": pn, "direct_ready_qty": direct, "rework_ready_qty": rework, "total_ready_qty": direct + rework})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) createPreQCFlowLaserBatch(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req struct {
		QCSessionID     int64  `json:"qc_session_id" binding:"required"`
		SourceType      string `json:"source_type" binding:"required"`
		CarrierTrayCode string `json:"carrier_tray_code" binding:"required"`
		IdempotencyKey  string `json:"idempotency_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	if req.SourceType != "DIRECT" && req.SourceType != "REWORK" {
		fail(c, 400, fmt.Errorf("invalid source_type"))
		return
	}
	key, err := uuid.Parse(req.IdempotencyKey)
	if err != nil {
		fail(c, 400, fmt.Errorf("invalid idempotency_key"))
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	_, _ = tx.Exec(c, `SELECT pg_advisory_xact_lock(26062901)`)
	var productionID, trayCycleID, configID, carrierTrayID int64
	var capacity, plannedQty, targetQty int
	err = tx.QueryRow(c, `SELECT qs.production_order_id,qs.tray_cycle_id,sol.packaging_config_id,pc.parts_per_small_box,po.planned_qty FROM t_qc_sessions qs JOIN t_production_orders po ON po.id=qs.production_order_id JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN m_packaging_configs pc ON pc.id=sol.packaging_config_id WHERE qs.id=$1`, req.QCSessionID).Scan(&productionID, &trayCycleID, &configID, &capacity, &plannedQty)
	if err != nil {
		fail(c, 409, fmt.Errorf("QC session is unavailable"))
		return
	}
	targetQty = plannedQty
	var actualQCQty int
	if err = tx.QueryRow(c, `
		SELECT COUNT(*)
		FROM t_pre_laser_units pu
		JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id
		WHERE qs.production_order_id=$1
	`, productionID).Scan(&actualQCQty); err != nil {
		fail(c, 500, err)
		return
	}
	if actualQCQty > targetQty {
		targetQty = actualQCQty
	}
	var carrierTrayType string
	if err = tx.QueryRow(c, `SELECT id,tray_type FROM m_trays WHERE tray_code=$1 AND is_active`, strings.ToUpper(strings.TrimSpace(req.CarrierTrayCode))).Scan(&carrierTrayID, &carrierTrayType); err != nil {
		fail(c, 409, fmt.Errorf("laser carrier tray is not registered"))
		return
	}
	if carrierTrayType != "GENERAL" && carrierTrayType != "PASS" {
		fail(c, 409, fmt.Errorf("Laser input requires a PASS tray"))
		return
	}
	rows, err := tx.Query(c, `
		SELECT id FROM t_pre_laser_units
		WHERE qc_session_id=$1
		  AND status='QC_PASSED_UNMARKED'
		  AND pass_tray_id=$3
		  AND (($2='DIRECT' AND initial_result='PASS') OR ($2='REWORK' AND initial_result='REJECT'))
		ORDER BY inspected_at,id
		FOR UPDATE
	`, req.QCSessionID, req.SourceType, carrierTrayID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	preIDs := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			fail(c, 500, err)
			return
		}
		preIDs = append(preIDs, id)
	}
	rows.Close()
	if len(preIDs) == 0 {
		fail(c, 409, fmt.Errorf("no QC-passed items are ready for this batch"))
		return
	}
	var existingUnits int
	if err = tx.QueryRow(c, `SELECT COUNT(*) FROM t_units_tracking u JOIN t_serial_groups sg ON sg.id=u.serial_group_id WHERE sg.production_order_id=$1`, productionID).Scan(&existingUnits); err != nil {
		fail(c, 500, err)
		return
	}
	unitIDs := make([]int64, 0, len(preIDs))
	serials := make([]string, 0, len(preIDs))
	for _, preID := range preIDs {
		var groupID int64
		err = tx.QueryRow(c, `SELECT sg.id FROM t_serial_groups sg WHERE sg.production_order_id=$1 AND sg.status='QC_PROCESS' AND (SELECT COUNT(*) FROM t_units_tracking u WHERE u.serial_group_id=sg.id)<sg.group_size ORDER BY sg.id LIMIT 1`, productionID).Scan(&groupID)
		if err != nil {
			remainingQty := targetQty - existingUnits
			if remainingQty <= 0 {
				fail(c, 409, fmt.Errorf("production order quantity is already fully serialized"))
				return
			}
			groupSize := min(capacity, remainingQty)
			var groupNumber int
			if err = tx.QueryRow(c, `SELECT COALESCE(MAX(group_number),0)+1 FROM t_serial_groups WHERE production_order_id=$1`, productionID).Scan(&groupNumber); err != nil {
				fail(c, 500, err)
				return
			}
			if err = tx.QueryRow(c, `INSERT INTO t_serial_groups(production_order_id,packaging_config_id,group_number,group_size,production_date,status) VALUES($1,$2,$3,$4,CURRENT_DATE,'QC_PROCESS') RETURNING id`, productionID, configID, groupNumber, groupSize).Scan(&groupID); err != nil {
				fail(c, 500, err)
				return
			}
		}
		var position int
		if err = tx.QueryRow(c, `SELECT COUNT(*)+1 FROM t_units_tracking WHERE serial_group_id=$1`, groupID).Scan(&position); err != nil {
			fail(c, 500, err)
			return
		}
		var sequence int64
		if err = tx.QueryRow(c, `SELECT nextval('seq_commercial_serial')`).Scan(&sequence); err != nil {
			fail(c, 500, err)
			return
		}
		serial := time.Now().Format("060102") + fmt.Sprintf("%08d", sequence)
		var unitID int64
		if err = tx.QueryRow(c, `INSERT INTO t_units_tracking(serial_sequence,serial_number,serial_group_id,tray_cycle_id,group_position,status) VALUES($1,$2,$3,$4,$5,'LASER_PENDING') RETURNING id`, sequence, serial, groupID, trayCycleID, position).Scan(&unitID); err != nil {
			fail(c, 500, err)
			return
		}
		if _, err = tx.Exec(c, `UPDATE t_pre_laser_units SET status='LASER_RESERVED',commercial_unit_id=$2 WHERE id=$1`, preID, unitID); err != nil {
			fail(c, 500, err)
			return
		}
		existingUnits++
		unitIDs = append(unitIDs, unitID)
		serials = append(serials, serial)
	}
	batchCode := "LB-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:12])
	var batchID int64
	err = tx.QueryRow(c, `INSERT INTO t_laser_batches(batch_code,tray_cycle_id,production_order_id,total_qty,serial_from,serial_to,station_id,created_by,qc_session_id,carrier_tray_id,source_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, batchCode, trayCycleID, productionID, len(unitIDs), serials[0], serials[len(serials)-1], station, operator, req.QCSessionID, carrierTrayID, req.SourceType).Scan(&batchID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	for index, unitID := range unitIDs {
		if _, err = tx.Exec(c, `INSERT INTO t_laser_batch_units(laser_batch_id,unit_id,batch_position) VALUES($1,$2,$3)`, batchID, unitID, index+1); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if _, err = tx.Exec(c, `INSERT INTO t_print_jobs(idempotency_key,entity_type,entity_id,station_id,device_role,payload) VALUES($1,'LASER_BATCH',$2,$3,'LASER',$4)`, key, batchID, station, strings.Join(serials, "\r\n")+"\r\n"); err != nil {
		fail(c, 409, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	s.respondLaserBatch(c, batchID, http.StatusAccepted)
}
