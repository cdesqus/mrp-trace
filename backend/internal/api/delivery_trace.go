package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type deliveryOrderRequest struct {
	DONumber     string `json:"do_number" binding:"required"`
	SalesOrderID int64  `json:"sales_order_id" binding:"required"`
	DeliveryDate string `json:"delivery_date" binding:"required"`
}

func (s *Server) listDeliveryOrders(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT d.id,d.do_number,d.delivery_date,d.status,so.id,so.so_number,
		       c.customer_code,c.customer_name,
		       COUNT(mb.id),COALESCE(SUM(mb.actual_unit_qty),0),d.created_by,d.created_at
		FROM t_delivery_orders d
		JOIN t_sales_orders so ON so.id=d.sales_order_id
		JOIN m_customers c ON c.id=so.customer_id
		LEFT JOIN t_delivery_order_master_boxes domb ON domb.delivery_order_id=d.id
		LEFT JOIN t_master_boxes mb ON mb.id=domb.master_box_id
		GROUP BY d.id,so.id,c.id
		ORDER BY d.created_at DESC LIMIT 100
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id, salesOrderID int64
		var number, status, soNumber, customerCode, customerName, createdBy string
		var deliveryDate, created time.Time
		var masterQty, unitQty int
		if err = rows.Scan(&id, &number, &deliveryDate, &status, &salesOrderID, &soNumber,
			&customerCode, &customerName, &masterQty, &unitQty, &createdBy, &created); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "do_number": number, "delivery_date": deliveryDate.Format("2006-01-02"),
			"status": status, "sales_order_id": salesOrderID, "so_number": soNumber,
			"customer_code": customerCode, "customer_name": customerName,
			"master_box_qty": masterQty, "unit_qty": unitQty, "created_by": createdBy, "created_at": created,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) createDeliveryOrder(c *gin.Context) {
	operator, _, ok := stationContext(c)
	if !ok {
		return
	}
	var req deliveryOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	date, err := time.Parse("2006-01-02", req.DeliveryDate)
	if err != nil {
		fail(c, 400, fmt.Errorf("invalid delivery_date"))
		return
	}
	var id int64
	err = s.db.QueryRow(c, `
		INSERT INTO t_delivery_orders (do_number,sales_order_id,delivery_date,created_by)
		VALUES ($1,$2,$3,$4) RETURNING id
	`, req.DONumber, req.SalesOrderID, date, operator).Scan(&id)
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	c.JSON(201, gin.H{"id": id, "do_number": req.DONumber})
}

type assignMasterRequest struct {
	MasterBoxCode string `json:"master_box_code" binding:"required"`
}

func (s *Server) assignMasterBox(c *gin.Context) {
	doID, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req assignMasterRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tag, err := s.db.Exec(c, `
		INSERT INTO t_delivery_order_master_boxes (delivery_order_id,master_box_id)
		SELECT d.id,mb.id
		FROM t_delivery_orders d
		JOIN t_sales_orders so ON so.id=d.sales_order_id
		JOIN t_sales_order_lines sol ON sol.sales_order_id=so.id
		JOIN t_production_orders po ON po.sales_order_line_id=sol.id
		JOIN t_master_boxes mb ON mb.production_order_id=po.id
		WHERE d.id=$1 AND d.status='OPEN' AND mb.master_box_code=$2 AND mb.status='LOCKED'
	`, doID, req.MasterBoxCode)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, http.StatusConflict, fmt.Errorf("master box cannot be assigned to this delivery order"))
		return
	}
	c.JSON(200, gin.H{"delivery_order_id": doID, "master_box_code": req.MasterBoxCode})
}

func (s *Server) traceSerial(c *gin.Context) {
	var result struct {
		Serial, UnitStatus, PO, SO, Product, TrayCycle string
		ReworkCode, SmallBox, MasterBox, DO            *string
	}
	err := s.db.QueryRow(c, `
		SELECT u.serial_number,u.status,po.production_order_number,so.so_number,p.product_code,tc.tray_cycle_code,
		       rw.rework_code,sb.box_code,mb.master_box_code,d.do_number
		FROM t_units_tracking u
		JOIN t_serial_groups sg ON sg.id=u.serial_group_id
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_tray_cycles tc ON tc.id=u.tray_cycle_id
		LEFT JOIN LATERAL (
			SELECT rework_code FROM t_rework_logs WHERE unit_id=u.id ORDER BY id DESC LIMIT 1
		) rw ON TRUE
		LEFT JOIN t_small_box_units sbu ON sbu.unit_id=u.id
		LEFT JOIN t_small_boxes sb ON sb.id=sbu.small_box_id
		LEFT JOIN t_master_box_small_boxes mbsb ON mbsb.small_box_id=sb.id
		LEFT JOIN t_master_boxes mb ON mb.id=mbsb.master_box_id
		LEFT JOIN t_delivery_order_master_boxes domb ON domb.master_box_id=mb.id
		LEFT JOIN t_delivery_orders d ON d.id=domb.delivery_order_id
		WHERE u.serial_number=$1
	`, c.Param("serial")).Scan(
		&result.Serial, &result.UnitStatus, &result.PO, &result.SO, &result.Product, &result.TrayCycle,
		&result.ReworkCode, &result.SmallBox, &result.MasterBox, &result.DO,
	)
	if err != nil {
		fail(c, 404, fmt.Errorf("serial not found"))
		return
	}
	var qcSession, originalTray, laserCarrier string
	var laserBatch *string
	_ = s.db.QueryRow(c, `
		SELECT qs.session_code,origin.tray_code,COALESCE(carrier.tray_code,origin.tray_code),lb.batch_code
		FROM t_units_tracking u
		JOIN t_pre_laser_units pu ON pu.commercial_unit_id=u.id
		JOIN t_qc_sessions qs ON qs.id=pu.qc_session_id
		JOIN m_trays origin ON origin.id=qs.tray_id
		LEFT JOIN t_laser_batch_units lbu ON lbu.unit_id=u.id
		LEFT JOIN t_laser_batches lb ON lb.id=lbu.laser_batch_id
		LEFT JOIN m_trays carrier ON carrier.id=lb.carrier_tray_id
		WHERE u.serial_number=$1
	`, c.Param("serial")).Scan(&qcSession, &originalTray, &laserCarrier, &laserBatch)
	rows, err := s.db.Query(c, `
		SELECT qe.id,
		       CASE WHEN EXISTS (
		         SELECT 1 FROM t_qc_events previous
		         WHERE previous.unit_id=qe.unit_id
		           AND previous.result='REJECT'
		           AND (previous.inspected_at < qe.inspected_at
		                OR (previous.inspected_at=qe.inspected_at AND previous.id < qe.id))
		       ) THEN 'REWORK' ELSE 'INITIAL' END,
		       qe.result,qe.reason,rw.rework_code,qe.operator_id,qe.station_id,qe.inspected_at
		FROM t_qc_events qe
		JOIN t_units_tracking u ON u.id=qe.unit_id
		LEFT JOIN LATERAL (
			SELECT rework_code FROM t_rework_logs
			WHERE unit_id=qe.unit_id ORDER BY id DESC LIMIT 1
		) rw ON TRUE
		WHERE u.serial_number=$1
		ORDER BY qe.inspected_at,qe.id
	`, c.Param("serial"))
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	qcHistory := make([]gin.H, 0)
	previouslyNG := false
	for rows.Next() {
		var id int64
		var inspectionType, eventResult, operator, station string
		var reason, reworkCode *string
		var inspectedAt time.Time
		if err = rows.Scan(
			&id, &inspectionType, &eventResult, &reason, &reworkCode,
			&operator, &station, &inspectedAt,
		); err != nil {
			fail(c, 500, err)
			return
		}
		if eventResult == "REJECT" {
			previouslyNG = true
		}
		qcHistory = append(qcHistory, gin.H{
			"id": id, "inspection_type": inspectionType, "result": eventResult,
			"reason": reason, "rework_code": reworkCode, "operator_id": operator,
			"station_id": station, "inspected_at": inspectedAt,
		})
	}
	if result.ReworkCode != nil {
		previouslyNG = true
	}
	c.JSON(200, gin.H{
		"serial_number": result.Serial, "status": result.UnitStatus,
		"sales_order": result.SO, "production_order": result.PO, "product": result.Product,
		"tray_cycle": result.TrayCycle, "rework_code": result.ReworkCode,
		"small_box": result.SmallBox, "master_box": result.MasterBox, "delivery_order": result.DO,
		"previously_ng": previouslyNG, "qc_attempts": len(qcHistory), "qc_history": qcHistory,
		"qc_session": qcSession, "original_tray": originalTray,
		"laser_carrier_tray": laserCarrier, "laser_batch": laserBatch,
	})
}
