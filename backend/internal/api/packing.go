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

func (s *Server) packingQueue(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT sg.id,po.production_order_number,sg.group_number,sg.group_size,
		       MIN(u.serial_number),MAX(u.serial_number),sg.created_at,sg.status,
		       COUNT(*) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED')),
		       COUNT(*) FILTER (WHERE u.status='REWORK'),
		       COUNT(*) FILTER (WHERE u.status='QC_PENDING'),
		       COALESCE(ARRAY_AGG(u.serial_number ORDER BY u.group_position)
		         FILTER (WHERE u.status='REWORK'),'{}'::VARCHAR[])
		FROM t_serial_groups sg
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_units_tracking u ON u.serial_group_id=sg.id
		WHERE sg.status IN ('QC_PROCESS','WAITING_REWORK','READY_TO_PACK')
		GROUP BY sg.id,po.production_order_number
		HAVING COUNT(*) FILTER (WHERE u.status IN ('PASSED_UNBOXED','PACKED','REWORK')) > 0
		ORDER BY sg.created_at,sg.id
		LIMIT 100
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	result := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var po, first, last, status string
		var number, size, passedQty, reworkQty, qcPendingQty int
		var reworkSerials []string
		var created time.Time
		if err = rows.Scan(
			&id, &po, &number, &size, &first, &last, &created, &status,
			&passedQty, &reworkQty, &qcPendingQty, &reworkSerials,
		); err != nil {
			fail(c, 500, err)
			return
		}
		result = append(result, gin.H{
			"serial_group_id": id, "production_order": po, "group_number": number,
			"quantity": size, "serial_from": first, "serial_to": last, "ready_at": created,
			"status": status, "passed_qty": passedQty, "rework_qty": reworkQty,
			"qc_pending_qty": qcPendingQty, "rework_serials": reworkSerials,
			"is_ready": status == "READY_TO_PACK" && passedQty == size,
		})
	}
	c.JSON(200, gin.H{"items": result})
}

func (s *Server) listSmallBoxes(c *gin.Context) {
	status := c.DefaultQuery("status", "LOCKED")
	if status != "LOCKED" && status != "MASTERED" {
		fail(c, 400, fmt.Errorf("invalid Small Box status"))
		return
	}
	rows, err := s.db.Query(c, `
		SELECT sb.id,sb.box_code,sb.status,sb.production_order_id,sb.packaging_config_id,
		       sb.actual_qty,po.production_order_number,p.product_code,p.product_name,
		       pc.parts_per_small_box,pc.small_boxes_per_master_box,
		       MIN(u.serial_number),MAX(u.serial_number),sb.packed_by,sb.packed_at
		FROM t_small_boxes sb
		JOIN t_production_orders po ON po.id=sb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN m_packaging_configs pc ON pc.id=sb.packaging_config_id
		JOIN t_small_box_units sbu ON sbu.small_box_id=sb.id
		JOIN t_units_tracking u ON u.id=sbu.unit_id
		WHERE sb.status=$1
		GROUP BY sb.id,po.production_order_number,p.product_code,p.product_name,pc.parts_per_small_box,pc.small_boxes_per_master_box
		ORDER BY sb.packed_at,sb.id
		LIMIT 500
	`, status)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id, productionID, configID int64
		var code, boxStatus, productionNumber, productCode, productName, firstSerial, lastSerial, packedBy string
		var actualQty, smallCapacity, masterCapacity int
		var packedAt time.Time
		if err = rows.Scan(
			&id, &code, &boxStatus, &productionID, &configID, &actualQty, &productionNumber,
			&productCode, &productName, &smallCapacity, &masterCapacity, &firstSerial, &lastSerial, &packedBy, &packedAt,
		); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "box_code": code, "status": boxStatus,
			"production_order_id": productionID, "production_order_number": productionNumber,
			"packaging_config_id": configID, "actual_qty": actualQty,
			"product_code": productCode, "product_name": productName,
			"small_box_capacity": smallCapacity, "master_box_capacity": masterCapacity, "serial_from": firstSerial,
			"serial_to": lastSerial, "packed_by": packedBy, "packed_at": packedAt,
		})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) getSmallBox(c *gin.Context) {
	var id, productionID, configID int64
	var code, status, productionNumber, productCode, productName, firstSerial, lastSerial, packedBy string
	var actualQty, smallCapacity, masterCapacity int
	var packedAt time.Time
	err := s.db.QueryRow(c, `
		SELECT sb.id,sb.box_code,sb.status,sb.production_order_id,sb.packaging_config_id,
		       sb.actual_qty,po.production_order_number,p.product_code,p.product_name,
		       pc.parts_per_small_box,pc.small_boxes_per_master_box,
		       MIN(u.serial_number),MAX(u.serial_number),sb.packed_by,sb.packed_at
		FROM t_small_boxes sb
		JOIN t_production_orders po ON po.id=sb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN m_packaging_configs pc ON pc.id=sb.packaging_config_id
		JOIN t_small_box_units sbu ON sbu.small_box_id=sb.id
		JOIN t_units_tracking u ON u.id=sbu.unit_id
		WHERE sb.box_code=$1
		GROUP BY sb.id,po.production_order_number,p.product_code,p.product_name,pc.parts_per_small_box,pc.small_boxes_per_master_box
	`, c.Param("code")).Scan(
		&id, &code, &status, &productionID, &configID, &actualQty, &productionNumber,
		&productCode, &productName, &smallCapacity, &masterCapacity, &firstSerial, &lastSerial, &packedBy, &packedAt,
	)
	if err != nil {
		fail(c, http.StatusNotFound, fmt.Errorf("small box not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": id, "box_code": code, "status": status,
		"production_order_id": productionID, "production_order_number": productionNumber,
		"packaging_config_id": configID, "actual_qty": actualQty,
		"product_code": productCode, "product_name": productName,
		"small_box_capacity": smallCapacity, "master_box_capacity": masterCapacity,
		"serial_from": firstSerial, "serial_to": lastSerial,
		"packed_by": packedBy, "packed_at": packedAt,
	})
}

type smallBoxRequest struct {
	SerialGroupID int64  `json:"serial_group_id" binding:"required"`
	Idempotency   string `json:"idempotency_key" binding:"required"`
}

func (s *Server) lockSmallBox(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req smallBoxRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	key, err := uuid.Parse(req.Idempotency)
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
	var productionID, configID int64
	var groupSize int
	var status, productionNumber, productCode, productName string
	err = tx.QueryRow(c, `
		SELECT sg.production_order_id,sg.packaging_config_id,sg.group_size,sg.status,
		       po.production_order_number,p.product_code,p.product_name
		FROM t_serial_groups sg
		JOIN t_production_orders po ON po.id=sg.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		WHERE sg.id=$1 FOR UPDATE
	`, req.SerialGroupID).Scan(&productionID, &configID, &groupSize, &status, &productionNumber, &productCode, &productName)
	if err != nil || status != "READY_TO_PACK" {
		fail(c, http.StatusConflict, fmt.Errorf("serial group is not ready to pack"))
		return
	}
	rows, err := tx.Query(c, `
		SELECT id,group_position,serial_number FROM t_units_tracking
		WHERE serial_group_id=$1 AND status='PASSED_UNBOXED'
		ORDER BY group_position FOR UPDATE
	`, req.SerialGroupID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	type unit struct {
		id       int64
		position int
		serial   string
	}
	units := make([]unit, 0, groupSize)
	for rows.Next() {
		var item unit
		_ = rows.Scan(&item.id, &item.position, &item.serial)
		units = append(units, item)
	}
	rows.Close()
	if len(units) != groupSize {
		fail(c, http.StatusConflict, fmt.Errorf("serial group is incomplete"))
		return
	}
	code := fmt.Sprintf("SB-%d", time.Now().UTC().UnixNano())
	var boxID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_small_boxes
			(box_code,serial_group_id,production_order_id,packaging_config_id,actual_qty,packed_by)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
	`, code, req.SerialGroupID, productionID, configID, len(units), operator).Scan(&boxID)
	for _, item := range units {
		if err != nil {
			break
		}
		_, err = tx.Exec(c, `
			INSERT INTO t_small_box_units (small_box_id,unit_id,box_position) VALUES ($1,$2,$3)
		`, boxID, item.id, item.position)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_units_tracking SET status='PACKED',updated_at=NOW() WHERE serial_group_id=$1`, req.SerialGroupID)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_serial_groups SET status='PACKED' WHERE id=$1`, req.SerialGroupID)
	}
	if err == nil {
		payload := fmt.Sprintf(`^XA
^PW800^LL560
^FO30,25^A0N,26,26^FDMRP TRACEABILITY^FS
^FO30,58^A0N,42,42^FDSMALL BOX^FS
^FO560,28^BQN,2,6^FDLA,%s^FS
^FO30,120^GB740,2,2^FS
^FO30,145^A0N,22,22^FDPRODUCT^FS
^FO30,175^A0N,36,36^FD%s^FS
^FO30,215^A0N,24,24^FD%s^FS
^FO30,260^A0N,22,22^FDQTY: %d PCS^FS
^FO30,300^A0N,22,22^FDSERIAL FROM: %s^FS
^FO30,335^A0N,22,22^FDSERIAL TO:   %s^FS
^FO30,380^A0N,22,22^FDPO: %s^FS
^FO30,420^GB740,2,2^FS
^FO30,445^A0N,30,30^FDBOX ID: %s^FS
^FO30,495^A0N,20,20^FDPACKED: %s UTC | QC PASSED^FS
^XZ`,
			zplField(code), zplField(productCode), zplField(productName), len(units),
			zplField(units[0].serial), zplField(units[len(units)-1].serial),
			zplField(productionNumber), zplField(code), time.Now().UTC().Format("2006-01-02 15:04"))
		_, err = tx.Exec(c, `
			INSERT INTO t_print_jobs
				(idempotency_key,entity_type,entity_id,station_id,device_role,payload)
			VALUES ($1,'SMALL_BOX',$2,$3,'SMALL_BOX_PRINTER',$4)
		`, key, boxID, station, payload)
	}
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(201, gin.H{"small_box_id": boxID, "box_code": code, "quantity": len(units), "print_status": "QUEUED"})
}

func zplField(value string) string {
	return strings.NewReplacer("^", "", "~", "", "\r", " ", "\n", " ").Replace(value)
}

type masterBoxRequest struct {
	SmallBoxCodes []string `json:"small_box_codes" binding:"required,min=1"`
	Idempotency   string   `json:"idempotency_key" binding:"required"`
}

func (s *Server) lockMasterBox(c *gin.Context) {
	operator, station, ok := stationContext(c)
	if !ok {
		return
	}
	var req masterBoxRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	key, err := uuid.Parse(req.Idempotency)
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
	rows, err := tx.Query(c, `
		SELECT sb.id,sb.production_order_id,sb.packaging_config_id,sb.actual_qty,
		       pc.small_boxes_per_master_box
		FROM t_small_boxes sb
		JOIN m_packaging_configs pc ON pc.id=sb.packaging_config_id
		WHERE sb.box_code=ANY($1) AND sb.status='LOCKED'
		ORDER BY sb.id FOR UPDATE
	`, req.SmallBoxCodes)
	if err != nil {
		fail(c, 500, err)
		return
	}
	type box struct {
		id, productionID, configID int64
		qty, capacity              int
	}
	boxes := make([]box, 0, len(req.SmallBoxCodes))
	for rows.Next() {
		var item box
		_ = rows.Scan(&item.id, &item.productionID, &item.configID, &item.qty, &item.capacity)
		boxes = append(boxes, item)
	}
	rows.Close()
	if len(boxes) != len(req.SmallBoxCodes) {
		fail(c, http.StatusConflict, fmt.Errorf("one or more small boxes are unavailable"))
		return
	}
	first := boxes[0]
	total := 0
	for _, item := range boxes {
		if item.productionID != first.productionID || item.configID != first.configID {
			fail(c, http.StatusConflict, fmt.Errorf("small boxes must use the same production order and packaging"))
			return
		}
		total += item.qty
	}
	if len(boxes) > first.capacity {
		fail(c, 400, fmt.Errorf("master box accepts maximum %d small boxes", first.capacity))
		return
	}
	var productionNumber, productCode, productName, serialFrom, serialTo string
	err = tx.QueryRow(c, `
		SELECT po.production_order_number,p.product_code,p.product_name,
		       MIN(u.serial_number),MAX(u.serial_number)
		FROM t_small_boxes sb
		JOIN t_production_orders po ON po.id=sb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN m_products p ON p.id=sol.product_id
		JOIN t_small_box_units sbu ON sbu.small_box_id=sb.id
		JOIN t_units_tracking u ON u.id=sbu.unit_id
		WHERE sb.box_code=ANY($1)
		GROUP BY po.production_order_number,p.product_code,p.product_name
	`, req.SmallBoxCodes).Scan(&productionNumber, &productCode, &productName, &serialFrom, &serialTo)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("master box label data is unavailable"))
		return
	}
	packedAt := time.Now().UTC()
	code := fmt.Sprintf("MB-%d", time.Now().UTC().UnixNano())
	var masterID int64
	err = tx.QueryRow(c, `
		INSERT INTO t_master_boxes
			(master_box_code,production_order_id,packaging_config_id,actual_small_box_qty,actual_unit_qty,packed_by)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
	`, code, first.productionID, first.configID, len(boxes), total, operator).Scan(&masterID)
	for position, item := range boxes {
		if err != nil {
			break
		}
		_, err = tx.Exec(c, `
			INSERT INTO t_master_box_small_boxes (master_box_id,small_box_id,box_position) VALUES ($1,$2,$3)
		`, masterID, item.id, position+1)
	}
	if err == nil {
		_, err = tx.Exec(c, `UPDATE t_small_boxes SET status='MASTERED' WHERE id=ANY($1)`,
			func() []int64 {
				ids := make([]int64, len(boxes))
				for i := range boxes {
					ids[i] = boxes[i].id
				}
				return ids
			}())
	}
	boxStatus := "PARTIAL"
	if len(boxes) == first.capacity {
		boxStatus = "FULL"
	}
	if err == nil {
		payload := fmt.Sprintf(`^XA
^PW800^LL620
^FO30,25^A0N,26,26^FDMRP TRACEABILITY^FS
^FO30,58^A0N,42,42^FDMASTER BOX^FS
^FO560,28^BQN,2,6^FDLA,%s^FS
^FO30,120^GB740,2,2^FS
^FO30,145^A0N,22,22^FDPRODUCT^FS
^FO30,175^A0N,36,36^FD%s^FS
^FO30,215^A0N,24,24^FD%s^FS
^FO30,260^A0N,22,22^FDSMALL BOXES: %d / %d^FS
^FO30,295^A0N,22,22^FDTOTAL QTY: %d PCS^FS
^FO30,330^A0N,22,22^FDSTATUS: %s MASTER BOX^FS
^FO30,365^A0N,22,22^FDSERIAL FROM: %s^FS
^FO30,400^A0N,22,22^FDSERIAL TO:   %s^FS
^FO30,440^A0N,22,22^FDPO: %s^FS
^FO30,455^GB740,2,2^FS
^FO30,480^A0N,30,30^FDMASTER ID: %s^FS
^FO30,530^A0N,20,20^FDPACKED: %s UTC | QC PASSED^FS
^XZ`,
			zplField(code), zplField(productCode), zplField(productName), len(boxes), first.capacity, total,
			zplField(boxStatus),
			zplField(serialFrom), zplField(serialTo), zplField(productionNumber),
			zplField(code), packedAt.Format("2006-01-02 15:04"))
		_, err = tx.Exec(c, `
			INSERT INTO t_print_jobs
				(idempotency_key,entity_type,entity_id,station_id,device_role,payload)
			VALUES ($1,'MASTER_BOX',$2,$3,'MASTER_BOX_PRINTER',$4)
		`, key, masterID, station, payload)
	}
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(201, gin.H{
		"master_box_id": masterID, "master_box_code": code,
		"small_box_count": len(boxes), "small_box_codes": req.SmallBoxCodes,
		"master_box_capacity": first.capacity, "box_status": boxStatus,
		"unit_quantity": total, "production_order_number": productionNumber,
		"product_code": productCode, "product_name": productName,
		"serial_from": serialFrom, "serial_to": serialTo,
		"packed_at": packedAt, "print_status": "QUEUED",
	})
}
