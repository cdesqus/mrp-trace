package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listSalesOrders(c *gin.Context) {
	search := c.Query("search")
	status := c.Query("status")
	limit := 25
	if raw := c.Query("limit"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 && value <= 100 {
			limit = value
		}
	}
	rows, err := s.db.Query(c, `
		SELECT so.id,so.so_number,so.order_date,so.target_delivery_date,so.status,
		       c.customer_code,c.customer_name,
		       COALESCE(lines.line_count,0),COALESCE(lines.order_qty,0),
		       COALESCE(progress.pass_qty,0),so.created_by,so.created_at,so.updated_at
		FROM t_sales_orders so
		JOIN m_customers c ON c.id=so.customer_id
		LEFT JOIN LATERAL (
			SELECT COUNT(*) line_count,SUM(order_qty) order_qty
			FROM t_sales_order_lines WHERE sales_order_id=so.id
		) lines ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED')) pass_qty
			FROM t_sales_order_lines sol
			JOIN t_production_orders po ON po.sales_order_line_id=sol.id
			LEFT JOIN t_serial_groups sg ON sg.production_order_id=po.id
			LEFT JOIN t_units_tracking u ON u.serial_group_id=sg.id
			WHERE sol.sales_order_id=so.id
		) progress ON TRUE
		WHERE ($1='' OR so.so_number ILIKE '%'||$1||'%' OR c.customer_name ILIKE '%'||$1||'%')
		  AND ($2='' OR so.status=$2)
		ORDER BY so.created_at DESC
		LIMIT $3
	`, search, status, limit)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var number, orderStatus, customerCode, customerName, createdBy string
		var orderDate time.Time
		var targetDate *time.Time
		var lineCount, orderQty, passQty int
		var createdAt, updatedAt time.Time
		if err = rows.Scan(&id, &number, &orderDate, &targetDate, &orderStatus, &customerCode, &customerName, &lineCount, &orderQty, &passQty, &createdBy, &createdAt, &updatedAt); err != nil {
			fail(c, 500, err)
			return
		}
		var target any
		if targetDate != nil {
			target = targetDate.Format("2006-01-02")
		}
		items = append(items, gin.H{
			"id": id, "so_number": number, "order_date": orderDate.Format("2006-01-02"),
			"target_delivery_date": target, "status": orderStatus,
			"customer_code": customerCode, "customer_name": customerName,
			"line_count": lineCount, "order_qty": orderQty, "pass_qty": passQty,
			"created_by": createdBy, "created_at": createdAt, "updated_by": createdBy, "updated_at": updatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) getSalesOrder(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var header gin.H
	var number, customerCode, customerName, status string
	var orderDate time.Time
	var targetDate *time.Time
	err = s.db.QueryRow(c, `
		SELECT so.so_number,c.customer_code,c.customer_name,so.order_date,so.target_delivery_date,so.status
		FROM t_sales_orders so JOIN m_customers c ON c.id=so.customer_id
		WHERE so.id=$1
	`, id).Scan(&number, &customerCode, &customerName, &orderDate, &targetDate, &status)
	if err != nil {
		fail(c, 404, fmt.Errorf("sales order not found"))
		return
	}
	header = gin.H{
		"id": id, "so_number": number, "customer_code": customerCode,
		"customer_name": customerName, "order_date": orderDate.Format("2006-01-02"), "status": status,
	}
	if targetDate != nil {
		header["target_delivery_date"] = targetDate.Format("2006-01-02")
	}
	rows, err := s.db.Query(c, `
		SELECT sol.id,sol.line_number,p.product_code,p.product_name,sol.order_qty,
		       pc.id,pc.config_name,pc.parts_per_small_box,pc.small_boxes_per_master_box,
		       po.id,po.production_order_number,po.status,
		       COALESCE(progress.pass_qty,0)
		FROM t_sales_order_lines sol
		JOIN m_products p ON p.id=sol.product_id
		JOIN m_packaging_configs pc ON pc.id=sol.packaging_config_id
		LEFT JOIN t_production_orders po ON po.sales_order_line_id=sol.id
		LEFT JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED')) pass_qty
			FROM t_serial_groups sg LEFT JOIN t_units_tracking u ON u.serial_group_id=sg.id
			WHERE sg.production_order_id=po.id
		) progress ON TRUE
		WHERE sol.sales_order_id=$1 ORDER BY sol.line_number
	`, id)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	lines := make([]gin.H, 0)
	for rows.Next() {
		var lineID, configID int64
		var productionID *int64
		var lineNumber, quantity, parts, boxes, passQty int
		var productCode, productName, configName string
		var productionNumber, productionStatus *string
		if err = rows.Scan(&lineID, &lineNumber, &productCode, &productName, &quantity,
			&configID, &configName, &parts, &boxes, &productionID, &productionNumber,
			&productionStatus, &passQty); err != nil {
			fail(c, 500, err)
			return
		}
		lines = append(lines, gin.H{
			"id": lineID, "line_number": lineNumber, "product_code": productCode,
			"product_name": productName, "order_qty": quantity, "pass_qty": passQty,
			"packaging_config_id": configID, "packaging_name": configName,
			"parts_per_small_box": parts, "small_boxes_per_master_box": boxes,
			"production_order_id": productionID, "production_order_number": productionNumber,
			"production_status": productionStatus,
		})
	}
	header["lines"] = lines
	c.JSON(http.StatusOK, header)
}

type salesOrderRequest struct {
	SONumber           string `json:"so_number" binding:"required"`
	CustomerID         int64  `json:"customer_id" binding:"required"`
	OrderDate          string `json:"order_date" binding:"required"`
	TargetDeliveryDate string `json:"target_delivery_date"`
	Lines              []struct {
		ProductID         int64 `json:"product_id" binding:"required"`
		PackagingConfigID int64 `json:"packaging_config_id" binding:"required"`
		Quantity          int   `json:"quantity" binding:"required"`
	} `json:"lines" binding:"required,min=1"`
}

func (s *Server) createSalesOrder(c *gin.Context) {
	operator, _, ok := stationContext(c)
	if !ok {
		return
	}
	var req salesOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err)
		return
	}
	orderDate, err := time.Parse("2006-01-02", req.OrderDate)
	if err != nil {
		fail(c, http.StatusBadRequest, fmt.Errorf("invalid order_date"))
		return
	}
	var target any
	if req.TargetDeliveryDate != "" {
		value, parseErr := time.Parse("2006-01-02", req.TargetDeliveryDate)
		if parseErr != nil {
			fail(c, http.StatusBadRequest, fmt.Errorf("invalid target_delivery_date"))
			return
		}
		target = value
	}

	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var soID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_sales_orders
			(so_number, customer_id, order_date, target_delivery_date, created_by)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, req.SONumber, req.CustomerID, orderDate, target, operator).Scan(&soID)
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	for index, line := range req.Lines {
		if line.Quantity <= 0 {
			fail(c, http.StatusBadRequest, fmt.Errorf("line %d quantity must be positive", index+1))
			return
		}
		var valid bool
		err = tx.QueryRow(c, `
			SELECT EXISTS(
				SELECT 1 FROM m_packaging_configs
				WHERE id=$1 AND product_id=$2 AND is_active
			)
		`, line.PackagingConfigID, line.ProductID).Scan(&valid)
		if err != nil || !valid {
			fail(c, http.StatusBadRequest, fmt.Errorf("line %d packaging configuration is invalid", index+1))
			return
		}
		var lineID int64
		err = tx.QueryRow(c, `
			INSERT INTO t_sales_order_lines
				(sales_order_id, line_number, product_id, packaging_config_id, order_qty)
			VALUES ($1,$2,$3,$4,$5) RETURNING id
		`, soID, index+1, line.ProductID, line.PackagingConfigID, line.Quantity).Scan(&lineID)
		if err != nil {
			fail(c, 500, err)
			return
		}
		poNumber := fmt.Sprintf("PO-%s-%02d", req.SONumber, index+1)
		_, err = tx.Exec(c, `
			INSERT INTO t_production_orders
				(production_order_number, sales_order_line_id, planned_qty, created_by)
			VALUES ($1,$2,$3,$4)
		`, poNumber, lineID, line.Quantity, operator)
		if err != nil {
			fail(c, 500, err)
			return
		}
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": soID, "so_number": req.SONumber})
}

type assignTrayRequest struct {
	TrayCode          string `json:"tray_code" binding:"required"`
	ProductionOrderID int64  `json:"production_order_id" binding:"required"`
	Quantity          int    `json:"quantity" binding:"required"`
}

func (s *Server) assignTray(c *gin.Context) {
	operator, _, ok := stationContext(c)
	if !ok {
		return
	}
	var req assignTrayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Quantity <= 0 {
		if err == nil {
			err = fmt.Errorf("quantity must be positive")
		}
		fail(c, http.StatusBadRequest, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)

	var trayID int64
	var trayStatus string
	err = tx.QueryRow(c, `SELECT id,status FROM m_trays WHERE tray_code=$1 FOR UPDATE`, req.TrayCode).
		Scan(&trayID, &trayStatus)
	if err != nil || trayStatus != "AVAILABLE" {
		fail(c, http.StatusConflict, fmt.Errorf("tray is not available"))
		return
	}
	var planned, assigned, cycle int
	err = tx.QueryRow(c, `
		SELECT po.planned_qty,
		       COALESCE((SELECT SUM(tc.planned_qty) FROM t_tray_cycles tc
		                 WHERE tc.production_order_id=po.id AND tc.status <> 'CANCELLED'),0),
		       COALESCE((SELECT MAX(tc.cycle_number) FROM t_tray_cycles tc WHERE tc.tray_id=$2),0)+1
		FROM t_production_orders po WHERE po.id=$1 AND po.status IN ('OPEN','IN_PROGRESS')
		FOR UPDATE
	`, req.ProductionOrderID, trayID).Scan(&planned, &assigned, &cycle)
	if err != nil || assigned+req.Quantity > planned {
		fail(c, http.StatusConflict, fmt.Errorf("tray quantity exceeds remaining production quantity"))
		return
	}
	code := fmt.Sprintf("%s-C%06d", req.TrayCode, cycle)
	var cycleID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_tray_cycles
			(tray_cycle_code,tray_id,production_order_id,cycle_number,planned_qty,operator_id)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
	`, code, trayID, req.ProductionOrderID, cycle, req.Quantity, operator).Scan(&cycleID)
	if err == nil {
		_, err = tx.Exec(c, `UPDATE m_trays SET status='IN_PRODUCTION',updated_at=NOW() WHERE id=$1`, trayID)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_production_orders SET status='IN_PROGRESS',updated_at=NOW() WHERE id=$1`, req.ProductionOrderID)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"tray_cycle_id": cycleID, "tray_cycle_code": code})
}
