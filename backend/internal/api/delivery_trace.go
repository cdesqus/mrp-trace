package api

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
		       COUNT(mb.id),COALESCE(SUM(mb.actual_unit_qty),0),
		       COALESCE(order_qty.quantity,0),GREATEST(COALESCE(order_qty.quantity,0)-COALESCE(SUM(mb.actual_unit_qty),0),0),
		       d.created_by,d.created_at
		FROM t_delivery_orders d
		JOIN t_sales_orders so ON so.id=d.sales_order_id
		JOIN m_customers c ON c.id=so.customer_id
		LEFT JOIN (
			SELECT sales_order_id,SUM(quantity) quantity
			FROM t_sales_order_lines
			GROUP BY sales_order_id
		) order_qty ON order_qty.sales_order_id=so.id
		LEFT JOIN t_delivery_order_master_boxes domb ON domb.delivery_order_id=d.id
		LEFT JOIN t_master_boxes mb ON mb.id=domb.master_box_id
		GROUP BY d.id,so.id,c.id,order_qty.quantity
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
		var masterQty, unitQty, orderQty, outstandingQty int
		if err = rows.Scan(&id, &number, &deliveryDate, &status, &salesOrderID, &soNumber,
			&customerCode, &customerName, &masterQty, &unitQty, &orderQty, &outstandingQty, &createdBy, &created); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "do_number": number, "delivery_date": deliveryDate.Format("2006-01-02"),
			"status": status, "sales_order_id": salesOrderID, "so_number": soNumber,
			"customer_code": customerCode, "customer_name": customerName,
			"master_box_qty": masterQty, "unit_qty": unitQty, "order_qty": orderQty,
			"outstanding_qty": outstandingQty, "created_by": createdBy, "created_at": created,
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

type deliveryManifestRow struct {
	Code       string
	Product    string
	PO         string
	SmallBoxes int
	Units      int
	PackedAt   time.Time
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

func (s *Server) listDeliveryAvailableMasterBoxes(c *gin.Context) {
	doID, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	rows, err := s.db.Query(c, `
		SELECT mb.id,mb.master_box_code,mb.actual_small_box_qty,mb.actual_unit_qty,mb.packed_at,
		       po.production_order_number,p.product_code,p.product_name
		FROM t_delivery_orders d
		JOIN t_sales_orders so ON so.id=d.sales_order_id
		JOIN t_sales_order_lines sol ON sol.sales_order_id=so.id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_production_orders po ON po.sales_order_line_id=sol.id
		JOIN t_master_boxes mb ON mb.production_order_id=po.id
		LEFT JOIN t_delivery_order_master_boxes domb ON domb.master_box_id=mb.id
		WHERE d.id=$1 AND d.status IN ('OPEN','READY') AND mb.status='LOCKED' AND domb.master_box_id IS NULL
		ORDER BY mb.packed_at,mb.id
	`, doID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, po, productCode, productName string
		var smallBoxes, units int
		var packedAt time.Time
		if err = rows.Scan(&id, &code, &smallBoxes, &units, &packedAt, &po, &productCode, &productName); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "master_box_code": code, "actual_small_box_qty": smallBoxes,
			"actual_unit_qty": units, "packed_at": packedAt, "production_order_number": po,
			"product_code": productCode, "product_name": productName,
		})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) autoAssignDeliveryMasterBoxes(c *gin.Context) {
	doID, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	tag, err := s.db.Exec(c, `
		WITH candidates AS (
			SELECT mb.id
			FROM t_delivery_orders d
			JOIN t_sales_orders so ON so.id=d.sales_order_id
			JOIN t_sales_order_lines sol ON sol.sales_order_id=so.id
			JOIN t_production_orders po ON po.sales_order_line_id=sol.id
			JOIN t_master_boxes mb ON mb.production_order_id=po.id
			LEFT JOIN t_delivery_order_master_boxes domb ON domb.master_box_id=mb.id
			WHERE d.id=$1 AND d.status IN ('OPEN','READY') AND mb.status='LOCKED' AND domb.master_box_id IS NULL
			ORDER BY mb.packed_at,mb.id
		), inserted AS (
			INSERT INTO t_delivery_order_master_boxes (delivery_order_id,master_box_id)
			SELECT $1,id FROM candidates
			ON CONFLICT DO NOTHING
			RETURNING master_box_id
		)
		UPDATE t_delivery_orders
		SET status='READY'
		WHERE id=$1 AND EXISTS (SELECT 1 FROM inserted)
	`, doID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"delivery_order_id": doID, "updated": tag.RowsAffected()})
}

func (s *Server) shipDeliveryOrder(c *gin.Context) {
	doID, err := parseID(c.Param("id"))
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
	var assigned int
	if err = tx.QueryRow(c, `SELECT COUNT(*) FROM t_delivery_order_master_boxes WHERE delivery_order_id=$1`, doID).Scan(&assigned); err != nil {
		fail(c, 500, err)
		return
	}
	if assigned == 0 {
		fail(c, 409, fmt.Errorf("assign at least one Master Box before Delivery Out"))
		return
	}
	if _, err = tx.Exec(c, `
		UPDATE t_master_boxes mb
		SET status='DELIVERED'
		FROM t_delivery_order_master_boxes domb
		WHERE domb.master_box_id=mb.id AND domb.delivery_order_id=$1
	`, doID); err != nil {
		fail(c, 500, err)
		return
	}
	tag, err := tx.Exec(c, `UPDATE t_delivery_orders SET status='SHIPPED' WHERE id=$1 AND status IN ('OPEN','READY')`, doID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 409, fmt.Errorf("delivery order cannot be shipped"))
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"delivery_order_id": doID, "status": "SHIPPED", "master_box_qty": assigned})
}

func (s *Server) deliveryOrderPDF(c *gin.Context) {
	doID, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var doNumber, status, soNumber, customerCode, customerName string
	var deliveryDate time.Time
	var orderQty int
	err = s.db.QueryRow(c, `
		SELECT d.do_number,d.delivery_date,d.status,so.so_number,c.customer_code,c.customer_name,
		       COALESCE((SELECT SUM(quantity) FROM t_sales_order_lines WHERE sales_order_id=so.id),0)
		FROM t_delivery_orders d
		JOIN t_sales_orders so ON so.id=d.sales_order_id
		JOIN m_customers c ON c.id=so.customer_id
		WHERE d.id=$1
	`, doID).Scan(&doNumber, &deliveryDate, &status, &soNumber, &customerCode, &customerName, &orderQty)
	if err != nil {
		fail(c, 404, fmt.Errorf("delivery order not found"))
		return
	}
	rows, err := s.db.Query(c, `
		SELECT mb.master_box_code,mb.actual_small_box_qty,mb.actual_unit_qty,
		       po.production_order_number,p.product_code,mb.packed_at
		FROM t_delivery_order_master_boxes domb
		JOIN t_master_boxes mb ON mb.id=domb.master_box_id
		JOIN t_production_orders po ON po.id=mb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		WHERE domb.delivery_order_id=$1
		ORDER BY domb.assigned_at,mb.id
	`, doID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	manifestRows := make([]deliveryManifestRow, 0)
	totalBoxes, totalUnits := 0, 0
	for rows.Next() {
		var code, po, product string
		var smallBoxes, units int
		var packedAt time.Time
		if err = rows.Scan(&code, &smallBoxes, &units, &po, &product, &packedAt); err != nil {
			fail(c, 500, err)
			return
		}
		totalBoxes += smallBoxes
		totalUnits += units
		manifestRows = append(manifestRows, deliveryManifestRow{Code: code, Product: product, PO: po, SmallBoxes: smallBoxes, Units: units, PackedAt: packedAt})
	}
	outstanding := orderQty - totalUnits
	if outstanding < 0 {
		outstanding = 0
	}
	pdf := deliveryManifestPDF(gin.H{
		"do_number": doNumber, "sales_order": soNumber, "customer": customerCode + " - " + customerName,
		"delivery_date": deliveryDate.Format("02 Jan 2006"), "status": status,
		"generated_at": time.Now().Format("02 Jan 2006 15:04"),
		"order_qty": orderQty, "total_master": len(manifestRows), "total_small": totalBoxes,
		"total_fg": totalUnits, "outstanding": outstanding,
	}, manifestRows)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s.pdf"`, doNumber))
	c.Data(http.StatusOK, "application/pdf", pdf)
}

func deliveryManifestPDF(header gin.H, rows []deliveryManifestRow) []byte {
	type pdfRow struct {
		Code       string
		Product    string
		PO         string
		SmallBoxes int
		Units      int
		PackedAt   time.Time
	}
	items := make([]pdfRow, len(rows))
	for i, row := range rows {
		items[i] = pdfRow(row)
	}
	var buf bytes.Buffer
	offsets := []int{0}
	buf.WriteString("%PDF-1.4\n")
	writeObj := func(id int, body string) {
		offsets = append(offsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", id, body)
	}
	writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObj(2, "<< /Type /Pages /Kids [4 0 R] /Count 1 >>")
	writeObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	writeObj(4, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>")
	var content bytes.Buffer
	text := func(size int, x, y int, value string) {
		fmt.Fprintf(&content, "BT /F1 %d Tf %d %d Td (%s) Tj ET\n", size, x, y, escapePDFText(value))
	}
	line := func(x1, y1, x2, y2 int) {
		fmt.Fprintf(&content, "%d %d m %d %d l S\n", x1, y1, x2, y2)
	}
	rect := func(x, y, w, h int) {
		fmt.Fprintf(&content, "%d %d %d %d re S\n", x, y, w, h)
	}
	text(18, 36, 550, "DELIVERY OUT MANIFEST")
	text(9, 36, 530, "DO Number: "+fmt.Sprint(header["do_number"]))
	text(9, 36, 515, "Sales Order: "+fmt.Sprint(header["sales_order"]))
	text(9, 36, 500, "Customer: "+fmt.Sprint(header["customer"]))
	text(9, 350, 530, "Delivery Date: "+fmt.Sprint(header["delivery_date"]))
	text(9, 350, 515, "Status: "+fmt.Sprint(header["status"]))
	text(9, 350, 500, "Generated At: "+fmt.Sprint(header["generated_at"]))
	summary := []struct{ label, value string }{
		{"Order Qty", fmt.Sprint(header["order_qty"])},
		{"Delivered FG", fmt.Sprint(header["total_fg"])},
		{"Outstanding", fmt.Sprint(header["outstanding"])},
		{"Master Boxes", fmt.Sprint(header["total_master"])},
		{"Small Boxes", fmt.Sprint(header["total_small"])},
	}
	for i, item := range summary {
		x := 36 + i*150
		rect(x, 455, 136, 42)
		text(8, x+8, 480, item.label)
		text(16, x+8, 462, item.value)
	}
	tableX, tableY := 36, 420
	widths := []int{32, 178, 95, 150, 82, 70, 95}
	headers := []string{"No", "Master Box", "Product", "Production Order", "Small Boxes", "FG Qty", "Packed At"}
	x := tableX
	for i, h := range headers {
		rect(x, tableY-20, widths[i], 20)
		text(8, x+5, tableY-14, h)
		x += widths[i]
	}
	y := tableY - 40
	for i, row := range items {
		if y < 90 {
			break
		}
		values := []string{fmt.Sprintf("%02d", i+1), row.Code, row.Product, row.PO, fmt.Sprint(row.SmallBoxes), fmt.Sprint(row.Units), row.PackedAt.Format("02 Jan 15:04")}
		x = tableX
		for col, value := range values {
			rect(x, y, widths[col], 20)
			text(8, x+5, y+6, value)
			x += widths[col]
		}
		y -= 20
	}
	line(36, 64, 260, 64)
	line(320, 64, 544, 64)
	text(9, 36, 48, "Prepared By")
	text(9, 320, 48, "Received By")
	body := fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", content.Len(), content.String())
	writeObj(5, body)
	xrefAt := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%s\n%%%%EOF", len(offsets), strconv.Itoa(xrefAt))
	return buf.Bytes()
}

func simpleTextPDF(lines []string) []byte {
	const maxLines = 45
	chunks := make([][]string, 0)
	for start := 0; start < len(lines); start += maxLines {
		end := start + maxLines
		if end > len(lines) {
			end = len(lines)
		}
		chunks = append(chunks, lines[start:end])
	}
	if len(chunks) == 0 {
		chunks = append(chunks, []string{"Delivery Out Manifest"})
	}

	var buf bytes.Buffer
	offsets := []int{0}
	buf.WriteString("%PDF-1.4\n")
	writeObj := func(id int, body string) {
		offsets = append(offsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", id, body)
	}
	kids := make([]string, 0, len(chunks))
	for page := range chunks {
		kids = append(kids, fmt.Sprintf("%d 0 R", 4+page*2))
	}
	writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObj(2, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(chunks)))
	writeObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	for page, pageLines := range chunks {
		pageObj := 4 + page*2
		contentObj := pageObj + 1
		writeObj(pageObj, fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>", contentObj))
		var content bytes.Buffer
		content.WriteString("BT /F1 10 Tf 42 800 Td 14 TL\n")
		for _, line := range pageLines {
			content.WriteString("(")
			content.WriteString(escapePDFText(line))
			content.WriteString(") Tj T*\n")
		}
		content.WriteString("ET")
		body := fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", content.Len(), content.String())
		writeObj(contentObj, body)
	}
	xrefAt := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%s\n%%%%EOF", len(offsets), strconv.Itoa(xrefAt))
	return buf.Bytes()
}

func escapePDFText(value string) string {
	value = strings.NewReplacer("→", "->", "—", "-", "·", "-", "Â", "", "â", "").Replace(value)
	var builder strings.Builder
	for _, r := range value {
		switch r {
		case '\\', '(', ')':
			builder.WriteByte('\\')
			builder.WriteRune(r)
		case '\n', '\r', '\t':
			builder.WriteByte(' ')
		default:
			if r >= 32 && r <= 126 {
				builder.WriteRune(r)
			} else {
				builder.WriteByte('?')
			}
		}
	}
	return builder.String()
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
