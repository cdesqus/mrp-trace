package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) listFinishedGoods(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT mb.id,mb.master_box_code,mb.actual_small_box_qty,mb.actual_unit_qty,mb.packed_at,
		       po.production_order_number,so.so_number,p.product_code,p.product_name,
		       CASE WHEN mb.status='DELIVERED' OR d.status='SHIPPED' THEN 'SHIPPED'
		            WHEN dom.master_box_id IS NOT NULL THEN 'ALLOCATED'
		            ELSE 'AVAILABLE' END,
		       d.do_number,COALESCE(contents.small_box_codes,'{}'::VARCHAR[]),
		       contents.serial_from,contents.serial_to,mb.packed_by
		FROM t_master_boxes mb
		JOIN t_production_orders po ON po.id=mb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mb.id
		LEFT JOIN t_delivery_orders d ON d.id=dom.delivery_order_id
		LEFT JOIN LATERAL (
			SELECT ARRAY_AGG(sb.box_code ORDER BY mbsb.box_position) small_box_codes,
			       MIN(u.serial_number) serial_from,MAX(u.serial_number) serial_to
			FROM t_master_box_small_boxes mbsb
			JOIN t_small_boxes sb ON sb.id=mbsb.small_box_id
			JOIN t_small_box_units sbu ON sbu.small_box_id=sb.id
			JOIN t_units_tracking u ON u.id=sbu.unit_id
			WHERE mbsb.master_box_id=mb.id
		) contents ON TRUE
		ORDER BY mb.packed_at DESC,mb.id DESC
		LIMIT 1000
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, productionOrder, soNumber, productCode, productName, status, packedBy string
		var smallBoxes, units int
		var packedAt time.Time
		var doNumber *string
		var boxCodes []string
		var serialFrom, serialTo *string
		if err = rows.Scan(&id, &code, &smallBoxes, &units, &packedAt, &productionOrder, &soNumber,
			&productCode, &productName, &status, &doNumber, &boxCodes, &serialFrom, &serialTo, &packedBy); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "master_box_code": code, "small_box_qty": smallBoxes, "unit_qty": units,
			"packed_at": packedAt, "production_order": productionOrder, "so_number": soNumber,
			"product_code": productCode, "product_name": productName, "stock_status": status,
			"delivery_order": doNumber, "small_box_codes": boxCodes,
			"serial_from": serialFrom, "serial_to": serialTo, "packed_by": packedBy,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) getFinishedGood(c *gin.Context) {
	var id int64
	var code, productionOrder, soNumber, productCode, productName, status, packedBy string
	var smallBoxes, units int
	var packedAt time.Time
	var doNumber *string
	err := s.db.QueryRow(c, `
		SELECT mb.id,mb.master_box_code,mb.actual_small_box_qty,mb.actual_unit_qty,mb.packed_at,
		       po.production_order_number,so.so_number,p.product_code,p.product_name,
		       CASE WHEN mb.status='DELIVERED' OR d.status='SHIPPED' THEN 'SHIPPED'
		            WHEN dom.master_box_id IS NOT NULL THEN 'ALLOCATED'
		            ELSE 'AVAILABLE' END,d.do_number,mb.packed_by
		FROM t_master_boxes mb
		JOIN t_production_orders po ON po.id=mb.production_order_id
		JOIN t_sales_order_lines sol ON sol.id=po.sales_order_line_id
		JOIN t_sales_orders so ON so.id=sol.sales_order_id
		JOIN m_products p ON p.id=sol.product_id
		LEFT JOIN t_delivery_order_master_boxes dom ON dom.master_box_id=mb.id
		LEFT JOIN t_delivery_orders d ON d.id=dom.delivery_order_id
		WHERE mb.master_box_code=$1
	`, c.Param("code")).Scan(&id, &code, &smallBoxes, &units, &packedAt, &productionOrder,
		&soNumber, &productCode, &productName, &status, &doNumber, &packedBy)
	if err != nil {
		fail(c, 404, fmt.Errorf("Finished Goods Master Box not found"))
		return
	}
	rows, err := s.db.Query(c, `
		SELECT sb.box_code,sb.actual_qty,sb.packed_at,MIN(u.serial_number),MAX(u.serial_number),
		       ARRAY_AGG(u.serial_number ORDER BY sbu.box_position)
		FROM t_master_box_small_boxes mbsb
		JOIN t_small_boxes sb ON sb.id=mbsb.small_box_id
		JOIN t_small_box_units sbu ON sbu.small_box_id=sb.id
		JOIN t_units_tracking u ON u.id=sbu.unit_id
		WHERE mbsb.master_box_id=$1
		GROUP BY mbsb.box_position,sb.id ORDER BY mbsb.box_position
	`, id)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	contents := make([]gin.H, 0)
	for rows.Next() {
		var boxCode, serialFrom, serialTo string
		var qty int
		var boxPackedAt time.Time
		var serials []string
		if err = rows.Scan(&boxCode, &qty, &boxPackedAt, &serialFrom, &serialTo, &serials); err != nil {
			fail(c, 500, err)
			return
		}
		contents = append(contents, gin.H{"box_code": boxCode, "qty": qty, "packed_at": boxPackedAt, "serial_from": serialFrom, "serial_to": serialTo, "serials": serials})
	}
	c.JSON(200, gin.H{
		"id": id, "master_box_code": code, "small_box_qty": smallBoxes, "unit_qty": units,
		"packed_at": packedAt, "production_order": productionOrder, "so_number": soNumber,
		"product_code": productCode, "product_name": productName, "stock_status": status,
		"delivery_order": doNumber, "small_boxes": contents, "packed_by": packedBy,
	})
}
