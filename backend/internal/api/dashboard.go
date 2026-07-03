package api

import (
	"fmt"
	"math"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) dashboard(c *gin.Context) {
	response := gin.H{"generated_at": time.Now()}
	var openOrders, openOrderQty, qcToday, qcPassToday, openRework, availableFG, availableMasters, deliveriesDue int
	err := s.db.QueryRow(c, `
		SELECT
		  (SELECT COUNT(*) FROM t_sales_orders WHERE status IN ('OPEN','PRODUCTION')),
		  (SELECT COALESCE(SUM(sol.order_qty),0) FROM t_sales_order_lines sol JOIN t_sales_orders so ON so.id=sol.sales_order_id WHERE so.status IN ('OPEN','PRODUCTION')),
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE inspected_at::date=CURRENT_DATE),
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE inspected_at::date=CURRENT_DATE AND initial_result='PASS'),
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE status='REWORK'),
		  (SELECT COALESCE(SUM(mb.actual_unit_qty),0) FROM t_master_boxes mb LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mb.id WHERE mb.status='LOCKED' AND dom.master_box_id IS NULL),
		  (SELECT COUNT(*) FROM t_master_boxes mb LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mb.id WHERE mb.status='LOCKED' AND dom.master_box_id IS NULL),
		  (SELECT COUNT(*) FROM t_delivery_orders WHERE delivery_date<=CURRENT_DATE AND status IN ('OPEN','READY'))
	`).Scan(&openOrders, &openOrderQty, &qcToday, &qcPassToday, &openRework, &availableFG, &availableMasters, &deliveriesDue)
	if err != nil {
		fail(c, 500, err)
		return
	}
	passRate := 0.0
	if qcToday > 0 {
		passRate = math.Round(float64(qcPassToday)/float64(qcToday)*1000) / 10
	}
	response["kpis"] = gin.H{
		"open_sales_orders": openOrders, "open_order_qty": openOrderQty,
		"qc_today": qcToday, "qc_pass_rate": passRate, "open_rework": openRework,
		"available_fg": availableFG, "available_master_boxes": availableMasters,
		"deliveries_due": deliveriesDue,
	}

	rows, err := s.db.Query(c, `
		SELECT day::date,
		       COUNT(pu.id) FILTER(WHERE pu.inspected_at::date=day::date),
		       COUNT(pu.id) FILTER(WHERE pu.inspected_at::date=day::date AND pu.initial_result='PASS'),
		       COALESCE((SELECT SUM(sb.actual_qty) FROM t_small_boxes sb WHERE sb.packed_at::date=day::date),0)
		FROM generate_series(CURRENT_DATE-INTERVAL '6 days',CURRENT_DATE,INTERVAL '1 day') day
		LEFT JOIN t_pre_laser_units pu ON pu.inspected_at::date=day::date
		GROUP BY day ORDER BY day
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	throughput := make([]gin.H, 0, 7)
	for rows.Next() {
		var day time.Time
		var inspected, passed, packed int
		if rows.Scan(&day, &inspected, &passed, &packed) != nil {
			continue
		}
		rate := 0.0
		if inspected > 0 {
			rate = math.Round(float64(passed)/float64(inspected)*1000) / 10
		}
		throughput = append(throughput, gin.H{"date": day.Format("2006-01-02"), "qc_inspected": inspected, "qc_passed": passed, "packed": packed, "pass_rate": rate})
	}
	rows.Close()
	response["throughput"] = throughput

	var initialQC, waitingLaser, waitingPacking int
	_ = s.db.QueryRow(c, `
		SELECT
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE status='QC_PENDING'),
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE status='QC_PASSED_UNMARKED'),
		  (SELECT COUNT(*) FROM t_units_tracking WHERE status='PASSED_UNBOXED')
	`).Scan(&initialQC, &waitingLaser, &waitingPacking)
	response["wip"] = []gin.H{
		{"key": "INITIAL_QC", "label": "Initial QC", "quantity": initialQC, "href": "/qc"},
		{"key": "REWORK", "label": "Rework", "quantity": openRework, "href": "/qc/rework"},
		{"key": "WAITING_LASER", "label": "Waiting Laser", "quantity": waitingLaser, "href": "/laser-marking"},
		{"key": "WAITING_PACKING", "label": "Waiting Packing", "quantity": waitingPacking, "href": "/packing"},
		{"key": "FINISHED_GOODS", "label": "Finished Goods", "quantity": availableFG, "href": "/finished-goods"},
	}

	rows, err = s.db.Query(c, `
		SELECT so.so_number,c.customer_name,p.product_code,sol.order_qty,so.target_delivery_date,
		       COUNT(DISTINCT u.id) FILTER(WHERE u.status='PACKED'),
		       COUNT(DISTINCT u.id) FILTER(WHERE d.status='SHIPPED')
		FROM t_sales_orders so JOIN m_customers c ON c.id=so.customer_id
		JOIN t_sales_order_lines sol ON sol.sales_order_id=so.id JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_production_orders po ON po.sales_order_line_id=sol.id
		LEFT JOIN t_tray_cycles tc ON tc.production_order_id=po.id LEFT JOIN t_units_tracking u ON u.tray_cycle_id=tc.id
		LEFT JOIN t_small_box_units sbu ON sbu.unit_id=u.id LEFT JOIN t_small_boxes sb ON sb.id=sbu.small_box_id
		LEFT JOIN t_master_box_small_boxes mbsb ON mbsb.small_box_id=sb.id
		LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mbsb.master_box_id
		LEFT JOIN t_delivery_orders d ON d.id=dom.delivery_order_id
		WHERE so.status<>'CANCELLED'
		GROUP BY so.id,c.id,p.id,sol.id ORDER BY so.target_delivery_date NULLS LAST,so.id LIMIT 10
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	orders := make([]gin.H, 0)
	for rows.Next() {
		var so, customer, product string
		var qty, packed, shipped int
		var target *time.Time
		if rows.Scan(&so, &customer, &product, &qty, &target, &packed, &shipped) != nil {
			continue
		}
		progress := 0.0
		if qty > 0 {
			progress = math.Round(float64(packed)/float64(qty)*1000) / 10
		}
		risk := "ON_TRACK"
		if target != nil && target.Before(time.Now().Add(48*time.Hour)) && progress < 90 {
			risk = "AT_RISK"
		}
		orders = append(orders, gin.H{"so_number": so, "customer": customer, "product_code": product, "ordered_qty": qty, "packed_qty": packed, "shipped_qty": shipped, "progress": progress, "target_date": target, "risk": risk})
	}
	rows.Close()
	response["orders"] = orders

	rows, err = s.db.Query(c, `SELECT COALESCE(ng_reason,'Unspecified'),COUNT(*) FROM t_pre_laser_units WHERE initial_result='REJECT' AND inspected_at>=NOW()-INTERVAL '30 days' GROUP BY ng_reason ORDER BY COUNT(*) DESC LIMIT 5`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defects := make([]gin.H, 0)
	for rows.Next() {
		var reason string
		var count int
		if rows.Scan(&reason, &count) == nil {
			defects = append(defects, gin.H{"reason": reason, "count": count})
		}
	}
	rows.Close()
	var qualityTotal, qualityPass int
	_ = s.db.QueryRow(c, `SELECT COUNT(*),COUNT(*) FILTER(WHERE initial_result='PASS') FROM t_pre_laser_units WHERE inspected_at>=NOW()-INTERVAL '30 days'`).Scan(&qualityTotal, &qualityPass)
	response["quality"] = gin.H{"total": qualityTotal, "passed": qualityPass, "rejected": qualityTotal - qualityPass, "defects": defects}

	rows, err = s.db.Query(c, `
		SELECT p.product_code,p.product_name,
		       COUNT(*) FILTER(WHERE dom.master_box_id IS NULL),COALESCE(SUM(mb.actual_unit_qty) FILTER(WHERE dom.master_box_id IS NULL),0),
		       COALESCE(SUM(mb.actual_unit_qty) FILTER(WHERE dom.master_box_id IS NOT NULL AND d.status<>'SHIPPED'),0),
		       MIN(mb.packed_at) FILTER(WHERE dom.master_box_id IS NULL)
		FROM t_master_boxes mb JOIN t_production_orders po ON po.id=mb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mb.id LEFT JOIN t_delivery_orders d ON d.id=dom.delivery_order_id
		GROUP BY p.id ORDER BY 4 DESC LIMIT 8
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	inventory := make([]gin.H, 0)
	for rows.Next() {
		var code, name string
		var boxes, available, allocated int
		var oldest *time.Time
		if rows.Scan(&code, &name, &boxes, &available, &allocated, &oldest) == nil {
			inventory = append(inventory, gin.H{"product_code": code, "product_name": name, "master_boxes": boxes, "available_qty": available, "allocated_qty": allocated, "oldest_at": oldest})
		}
	}
	rows.Close()
	response["inventory"] = inventory

	rows, err = s.db.Query(c, `
		SELECT d.do_number,c.customer_name,d.delivery_date,d.status,COALESCE(SUM(mb.actual_unit_qty),0)
		FROM t_delivery_orders d JOIN t_sales_orders so ON so.id=d.sales_order_id JOIN m_customers c ON c.id=so.customer_id
		LEFT JOIN t_delivery_order_master_boxes dom ON dom.delivery_order_id=d.id LEFT JOIN t_master_boxes mb ON mb.id=dom.master_box_id
		WHERE d.status IN ('OPEN','READY') GROUP BY d.id,c.id ORDER BY d.delivery_date LIMIT 6
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	deliveries := make([]gin.H, 0)
	for rows.Next() {
		var number, customer, status string
		var date time.Time
		var allocated int
		if rows.Scan(&number, &customer, &date, &status, &allocated) == nil {
			deliveries = append(deliveries, gin.H{"do_number": number, "customer": customer, "delivery_date": date, "allocated_qty": allocated, "status": status})
		}
	}
	rows.Close()
	response["deliveries"] = deliveries

	actions := make([]gin.H, 0)
	appendAction := func(level, title, detail, href string, count int) {
		if count > 0 {
			actions = append(actions, gin.H{"level": level, "title": title, "detail": fmt.Sprintf(detail, count), "href": href, "count": count})
		}
	}
	var agingRework, awaitingTrays, blockedPacking, atRiskOrders, incompleteDO int
	_ = s.db.QueryRow(c, `
		SELECT
		  (SELECT COUNT(*) FROM t_pre_laser_units WHERE status='REWORK' AND inspected_at<NOW()-INTERVAL '2 hours'),
		  (SELECT COUNT(*) FROM t_qc_sessions WHERE status='AWAITING_OUTPUT_TRAYS'),
		  (SELECT COUNT(*) FROM t_serial_groups WHERE status='WAITING_REWORK'),
		  (SELECT COUNT(*) FROM t_sales_orders WHERE target_delivery_date<=CURRENT_DATE+2 AND status IN ('OPEN','PRODUCTION')),
		  (SELECT COUNT(*) FROM t_delivery_orders WHERE delivery_date<=CURRENT_DATE+1 AND status='OPEN')
	`).Scan(&agingRework, &awaitingTrays, &blockedPacking, &atRiskOrders, &incompleteDO)
	appendAction("HIGH", "Aging Rework", "%d parts have waited more than two hours.", "/qc/rework", agingRework)
	appendAction("MEDIUM", "QC Output Tray Required", "%d QC sessions are waiting for output trays.", "/qc", awaitingTrays)
	appendAction("MEDIUM", "Packing Groups Blocked", "%d serial groups are waiting for rework completion.", "/packing", blockedPacking)
	appendAction("HIGH", "Sales Orders Near Target", "%d open Sales Orders are due within two days.", "/sales-orders", atRiskOrders)
	appendAction("HIGH", "Delivery Preparation Required", "%d Delivery Orders are due within one day.", "/delivery-orders", incompleteDO)
	response["actions"] = actions
	c.JSON(200, response)
}
