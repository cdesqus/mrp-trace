package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) listMasterTrays(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT t.id,t.tray_code,t.tray_type,t.is_active,t.created_at,t.updated_at,
		       COALESCE(cu.full_name,'System'),COALESCE(uu.full_name,cu.full_name,'System')
		FROM m_trays t
		LEFT JOIN m_users cu ON cu.id=t.created_by_user_id
		LEFT JOIN m_users uu ON uu.id=t.updated_by_user_id
		ORDER BY t.tray_code
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, trayType, createdBy, updatedBy string
		var active bool
		var created, updated time.Time
		if err = rows.Scan(&id, &code, &trayType, &active, &created, &updated, &createdBy, &updatedBy); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"id": id, "tray_code": code, "tray_type": trayType, "is_active": active,
			"created_at": created, "updated_at": updated, "created_by": createdBy, "updated_by": updatedBy})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) createMasterTray(c *gin.Context) {
	var req struct {
		TrayCode string `json:"tray_code" binding:"required"`
		TrayType string `json:"tray_type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.TrayCode))
	trayType := strings.ToUpper(strings.TrimSpace(req.TrayType))
	if trayType != "SOURCE" && trayType != "PASS" && trayType != "REWORK" && trayType != "GENERAL" {
		fail(c, 400, fmt.Errorf("tray type must be SOURCE, PASS, or REWORK"))
		return
	}
	var id int64
	userID, _ := c.Get("auth_user_id")
	if err := s.db.QueryRow(c, `
		INSERT INTO m_trays (tray_code,tray_type,created_by_user_id,updated_by_user_id)
		VALUES ($1,$2,$3,$3) RETURNING id
	`, code, trayType, userID).Scan(&id); err != nil {
		fail(c, 409, fmt.Errorf("tray ID already exists"))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "tray_code": code, "tray_type": trayType})
}

func (s *Server) updateMasterTray(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		TrayCode string `json:"tray_code" binding:"required"`
		TrayType string `json:"tray_type" binding:"required"`
		IsActive bool   `json:"is_active"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.TrayCode))
	trayType := strings.ToUpper(strings.TrimSpace(req.TrayType))
	if trayType != "SOURCE" && trayType != "PASS" && trayType != "REWORK" {
		fail(c, 400, fmt.Errorf("tray type must be SOURCE, PASS, or REWORK"))
		return
	}
	s.clearEmptyReworkTrayLock(c, id)
	var busy bool
	err = s.db.QueryRow(c, `
		SELECT EXISTS(
			SELECT 1 FROM t_tray_cycles WHERE tray_id=$1 AND status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
			UNION ALL
			SELECT 1 FROM t_rework_tray_locks
			WHERE tray_id=$1
			  AND EXISTS (
			      SELECT 1 FROM t_pre_laser_units
			      WHERE rework_tray_id=$1
			        AND status IN ('REWORK','QC_PASSED_UNMARKED')
			        AND pass_tray_id IS NULL
			  )
		)
	`, id).Scan(&busy)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if busy {
		fail(c, 409, fmt.Errorf("tray is currently used by an active operation and cannot be edited"))
		return
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `
		UPDATE m_trays
		SET tray_code=$2,tray_type=$3,is_active=$4,updated_by_user_id=$5,updated_at=NOW()
		WHERE id=$1
	`, id, code, trayType, req.IsActive, userID)
	if err != nil {
		fail(c, 409, fmt.Errorf("tray ID already exists or update is invalid"))
		return
	}
	if tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("tray not found"))
		return
	}
	c.JSON(200, gin.H{"id": id, "tray_code": code, "tray_type": trayType, "is_active": req.IsActive})
}

func (s *Server) listProductionOrders(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT po.id,po.production_order_number,po.planned_qty,po.status,
		       so.so_number,p.product_code,p.product_name,
		       COALESCE(cycles.assigned_qty,0),COALESCE(progress.pass_qty,0),
		       po.created_by,po.created_at,po.updated_at
		FROM t_production_orders po
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN LATERAL (
			SELECT SUM(planned_qty) assigned_qty FROM t_tray_cycles
			WHERE production_order_id=po.id AND status <> 'CANCELLED'
		) cycles ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED')) pass_qty
			FROM t_serial_groups sg LEFT JOIN t_units_tracking u ON u.serial_group_id=sg.id
			WHERE sg.production_order_id=po.id
		) progress ON TRUE
		WHERE ($1='' OR po.status=$1)
		ORDER BY po.created_at DESC
		LIMIT 100
	`, c.Query("status"))
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var number, status, soNumber, productCode, productName, createdBy string
		var planned, assigned, passed int
		var created, updated time.Time
		if err = rows.Scan(&id, &number, &planned, &status, &soNumber, &productCode, &productName, &assigned, &passed, &createdBy, &created, &updated); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "production_order_number": number, "planned_qty": planned,
			"assigned_qty": assigned, "pass_qty": passed, "status": status,
			"so_number": soNumber, "product_code": productCode, "product_name": productName,
			"created_by": createdBy, "created_at": created, "updated_by": createdBy, "updated_at": updated,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) listTrays(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT t.id,t.tray_code,t.status,t.updated_at,
		       tc.id,tc.tray_cycle_code,po.production_order_number,tc.planned_qty,tc.operator_id
		FROM m_trays t
		LEFT JOIN LATERAL (
			SELECT * FROM t_tray_cycles
			WHERE tray_id=t.id AND status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
			ORDER BY id DESC LIMIT 1
		) tc ON TRUE
		LEFT JOIN t_production_orders po ON po.id=tc.production_order_id
		ORDER BY t.tray_code
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, status string
		var updated time.Time
		var cycleID *int64
		var cycleCode, productionNumber, operator *string
		var qty *int
		if err = rows.Scan(&id, &code, &status, &updated, &cycleID, &cycleCode, &productionNumber, &qty, &operator); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "tray_code": code, "status": status, "updated_at": updated,
			"active_cycle_id": cycleID, "active_cycle_code": cycleCode,
			"production_order_number": productionNumber, "planned_qty": qty, "operator_id": operator,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) listTrayCycles(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT tc.id,tc.tray_cycle_code,t.tray_code,po.production_order_number,
		       tc.planned_qty,tc.operator_id,tc.status,tc.started_at,tc.completed_at,
		       COUNT(u.id),COUNT(u.id) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED'))
		FROM t_tray_cycles tc
		JOIN m_trays t ON t.id=tc.tray_id
		JOIN t_production_orders po ON po.id=tc.production_order_id
		LEFT JOIN t_units_tracking u ON u.tray_cycle_id=tc.id
		GROUP BY tc.id,t.tray_code,po.production_order_number
		ORDER BY tc.started_at DESC LIMIT 100
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var cycleCode, trayCode, productionNumber, operator, status string
		var planned, serialized, passed int
		var started time.Time
		var completed *time.Time
		if err = rows.Scan(&id, &cycleCode, &trayCode, &productionNumber, &planned, &operator, &status, &started, &completed, &serialized, &passed); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "tray_cycle_code": cycleCode, "tray_code": trayCode,
			"production_order_number": productionNumber, "planned_qty": planned,
			"serialized_qty": serialized, "pass_qty": passed, "operator_id": operator,
			"status": status, "started_at": started, "completed_at": completed,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
