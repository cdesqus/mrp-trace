package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (s *Server) listCustomers(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT c.id,c.customer_code,c.customer_name,c.is_active,c.created_at,c.updated_at,
		       COALESCE(cu.full_name,'System'),COALESCE(uu.full_name,cu.full_name,'System')
		FROM m_customers c
		LEFT JOIN m_users cu ON cu.id=c.created_by_user_id
		LEFT JOIN m_users uu ON uu.id=c.updated_by_user_id
		WHERE ($1 OR c.is_active)
		ORDER BY customer_name
	`, c.Query("include_inactive") == "true")
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, name, createdBy, updatedBy string
		var active bool
		var createdAt, updatedAt any
		if err = rows.Scan(&id, &code, &name, &active, &createdAt, &updatedAt, &createdBy, &updatedBy); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"id": id, "code": code, "name": name, "is_active": active,
			"created_at": createdAt, "updated_at": updatedAt, "created_by": createdBy, "updated_by": updatedBy})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type customerRequest struct {
	Code string `json:"code" binding:"required"`
	Name string `json:"name" binding:"required"`
}

func (s *Server) createCustomer(c *gin.Context) {
	var req customerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err)
		return
	}
	var id int64
	userID, _ := c.Get("auth_user_id")
	err := s.db.QueryRow(c, `
		INSERT INTO m_customers (customer_code,customer_name,created_by_user_id,updated_by_user_id)
		VALUES ($1,$2,$3,$3) RETURNING id
	`, strings.ToUpper(strings.TrimSpace(req.Code)), strings.TrimSpace(req.Name), userID).Scan(&id)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("customer code already exists or data is invalid"))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type customerUpdateRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name" binding:"required"`
	IsActive bool   `json:"is_active"`
}

func (s *Server) updateCustomer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req customerUpdateRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `
		UPDATE m_customers
		SET customer_code=COALESCE(NULLIF($2,''),customer_code),customer_name=$3,is_active=$4,
		    updated_by_user_id=$5,updated_at=NOW()
		WHERE id=$1
	`, id, strings.ToUpper(strings.TrimSpace(req.Code)), strings.TrimSpace(req.Name), req.IsActive, userID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("customer not found"))
		return
	}
	c.JSON(200, gin.H{"id": id})
}

func (s *Server) listProducts(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT p.id,p.product_code,p.product_name,p.is_active,p.qc_image_data_url,
		       p.created_at,p.updated_at,COALESCE(cu.full_name,'System'),COALESCE(uu.full_name,cu.full_name,'System'),
		       pc.id,pc.config_name,pc.version,
		       pc.parts_per_small_box,pc.small_boxes_per_master_box
		FROM m_products p
		LEFT JOIN m_packaging_configs pc ON pc.product_id=p.id AND pc.is_active
		LEFT JOIN m_users cu ON cu.id=p.created_by_user_id
		LEFT JOIN m_users uu ON uu.id=p.updated_by_user_id
		WHERE ($1 OR p.is_active)
		ORDER BY p.product_name,pc.config_name,pc.version DESC
	`, c.Query("include_inactive") == "true")
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	type product struct {
		ID        int64
		Code      string
		Name      string
		IsActive  bool
		QCImage   *string
		CreatedAt any
		UpdatedAt any
		CreatedBy string
		UpdatedBy string
		Packaging []gin.H
	}
	ordered := make([]*product, 0)
	byID := map[int64]*product{}
	for rows.Next() {
		var productID int64
		var code, name string
		var active bool
		var qcImage *string
		var createdAt, updatedAt any
		var createdBy, updatedBy string
		var configID *int64
		var configName *string
		var version, parts, smallBoxes *int
		if err = rows.Scan(&productID, &code, &name, &active, &qcImage, &createdAt, &updatedAt, &createdBy, &updatedBy, &configID, &configName, &version, &parts, &smallBoxes); err != nil {
			fail(c, 500, err)
			return
		}
		item := byID[productID]
		if item == nil {
			item = &product{ID: productID, Code: code, Name: name, IsActive: active, QCImage: qcImage,
				CreatedAt: createdAt, UpdatedAt: updatedAt, CreatedBy: createdBy, UpdatedBy: updatedBy, Packaging: make([]gin.H, 0)}
			byID[productID] = item
			ordered = append(ordered, item)
		}
		if configID != nil {
			item.Packaging = append(item.Packaging, gin.H{
				"id": *configID, "name": *configName, "version": *version,
				"parts_per_small_box":        *parts,
				"small_boxes_per_master_box": *smallBoxes,
				"parts_per_master_box":       *parts * *smallBoxes,
			})
		}
	}
	items := make([]gin.H, 0, len(ordered))
	for _, item := range ordered {
		items = append(items, gin.H{
			"id": item.ID, "code": item.Code, "name": item.Name, "is_active": item.IsActive,
			"qc_image_data_url": item.QCImage, "packaging": item.Packaging,
			"created_at": item.CreatedAt, "updated_at": item.UpdatedAt, "created_by": item.CreatedBy, "updated_by": item.UpdatedBy,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type productRequest struct {
	Code string `json:"code" binding:"required"`
	Name string `json:"name" binding:"required"`
}

func (s *Server) createProduct(c *gin.Context) {
	var req productRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	var id int64
	userID, _ := c.Get("auth_user_id")
	err := s.db.QueryRow(c, `
		INSERT INTO m_products (product_code,product_name,created_by_user_id,updated_by_user_id)
		VALUES ($1,$2,$3,$3) RETURNING id
	`, strings.ToUpper(strings.TrimSpace(req.Code)), strings.TrimSpace(req.Name), userID).Scan(&id)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("product code already exists or data is invalid"))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type productUpdateRequest struct {
	Code     string `json:"code"`
	Name     string `json:"name" binding:"required"`
	IsActive bool   `json:"is_active"`
}

func (s *Server) updateProduct(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req productUpdateRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `
		UPDATE m_products
		SET product_code=COALESCE(NULLIF($2,''),product_code),product_name=$3,is_active=$4,
		    updated_by_user_id=$5,updated_at=NOW()
		WHERE id=$1
	`, id, strings.ToUpper(strings.TrimSpace(req.Code)), strings.TrimSpace(req.Name), req.IsActive, userID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("product not found"))
		return
	}
	c.JSON(200, gin.H{"id": id})
}

func (s *Server) updateProductQCImage(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		ImageDataURL string `json:"image_data_url"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	image := strings.TrimSpace(req.ImageDataURL)
	if image != "" && (!strings.HasPrefix(image, "data:image/jpeg;base64,") && !strings.HasPrefix(image, "data:image/png;base64,") && !strings.HasPrefix(image, "data:image/webp;base64,")) {
		fail(c, 400, fmt.Errorf("QC image must be JPEG, PNG, or WebP"))
		return
	}
	if len(image) > 7*1024*1024 {
		fail(c, http.StatusRequestEntityTooLarge, fmt.Errorf("QC image exceeds the 5 MB limit"))
		return
	}
	var value any
	if image != "" {
		value = image
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `UPDATE m_products SET qc_image_data_url=$2,updated_by_user_id=$3,updated_at=NOW() WHERE id=$1`, id, value, userID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("product not found"))
		return
	}
	c.JSON(200, gin.H{"id": id, "has_qc_image": image != ""})
}

func (s *Server) listPackagingConfigs(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT pc.id,pc.product_id,p.product_code,p.product_name,pc.config_name,pc.version,
		       pc.parts_per_small_box,pc.small_boxes_per_master_box,pc.is_active,pc.created_at,pc.updated_at,
		       COALESCE(cu.full_name,'System'),COALESCE(uu.full_name,cu.full_name,'System')
		FROM m_packaging_configs pc
		JOIN m_products p ON p.id=pc.product_id
		LEFT JOIN m_users cu ON cu.id=pc.created_by_user_id
		LEFT JOIN m_users uu ON uu.id=pc.updated_by_user_id
		ORDER BY p.product_name,pc.config_name,pc.version DESC
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id, productID int64
		var productCode, productName, configName string
		var version, parts, boxes int
		var active bool
		var created, updated any
		var createdBy, updatedBy string
		if err = rows.Scan(&id, &productID, &productCode, &productName, &configName, &version, &parts, &boxes, &active, &created, &updated, &createdBy, &updatedBy); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "product_id": productID, "product_code": productCode, "product_name": productName,
			"name": configName, "version": version, "parts_per_small_box": parts,
			"small_boxes_per_master_box": boxes, "parts_per_master_box": parts * boxes,
			"is_active": active, "created_at": created, "updated_at": updated, "created_by": createdBy, "updated_by": updatedBy,
		})
	}
	c.JSON(200, gin.H{"items": items})
}

type packagingRequest struct {
	ProductID              int64  `json:"product_id" binding:"required"`
	Name                   string `json:"name" binding:"required"`
	PartsPerSmallBox       int    `json:"parts_per_small_box" binding:"required"`
	SmallBoxesPerMasterBox int    `json:"small_boxes_per_master_box" binding:"required"`
}

func (s *Server) createPackagingConfig(c *gin.Context) {
	var req packagingRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PartsPerSmallBox <= 0 || req.SmallBoxesPerMasterBox <= 0 {
		if err == nil {
			err = fmt.Errorf("packaging capacities must be positive")
		}
		fail(c, 400, err)
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	name := strings.TrimSpace(req.Name)
	var version int
	err = tx.QueryRow(c, `
		SELECT COALESCE(MAX(version),0)+1
		FROM m_packaging_configs WHERE product_id=$1 AND config_name=$2
	`, req.ProductID, name).Scan(&version)
	if err == nil {
		_, err = tx.Exec(c, `
			UPDATE m_packaging_configs SET is_active=FALSE
			WHERE product_id=$1 AND config_name=$2 AND is_active
		`, req.ProductID, name)
	}
	var id int64
	userID, _ := c.Get("auth_user_id")
	if err == nil {
		err = tx.QueryRow(c, `
			INSERT INTO m_packaging_configs
				(product_id,config_name,version,parts_per_small_box,small_boxes_per_master_box,created_by_user_id,updated_by_user_id)
			VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id
		`, req.ProductID, name, version, req.PartsPerSmallBox, req.SmallBoxesPerMasterBox, userID).Scan(&id)
	}
	if err != nil {
		fail(c, http.StatusConflict, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "version": version})
}

type statusRequest struct {
	IsActive bool `json:"is_active"`
}

func (s *Server) updatePackagingStatus(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req statusRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `UPDATE m_packaging_configs SET is_active=$2,updated_by_user_id=$3,updated_at=NOW() WHERE id=$1`, id, req.IsActive, userID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("packaging configuration not found"))
		return
	}
	c.JSON(200, gin.H{"id": id, "is_active": req.IsActive})
}

func (s *Server) updatePackagingConfig(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req packagingRequest
	if err = c.ShouldBindJSON(&req); err != nil || req.PartsPerSmallBox <= 0 || req.SmallBoxesPerMasterBox <= 0 {
		fail(c, 400, fmt.Errorf("product, name, and positive packaging capacities are required"))
		return
	}
	tx, err := s.db.Begin(c)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var currentProductID int64
	var currentName string
	if err = tx.QueryRow(c, `SELECT product_id,config_name FROM m_packaging_configs WHERE id=$1 FOR UPDATE`, id).Scan(&currentProductID, &currentName); err != nil {
		fail(c, 404, fmt.Errorf("packaging configuration not found"))
		return
	}
	name := strings.TrimSpace(req.Name)
	var version int
	if err = tx.QueryRow(c, `SELECT COALESCE(MAX(version),0)+1 FROM m_packaging_configs WHERE product_id=$1 AND config_name=$2`, req.ProductID, name).Scan(&version); err != nil {
		fail(c, 500, err)
		return
	}
	userID, _ := c.Get("auth_user_id")
	if _, err = tx.Exec(c, `UPDATE m_packaging_configs SET is_active=FALSE,updated_by_user_id=$2,updated_at=NOW() WHERE id=$1`, id, userID); err != nil {
		fail(c, 500, err)
		return
	}
	var newID int64
	err = tx.QueryRow(c, `
		INSERT INTO m_packaging_configs(product_id,config_name,version,parts_per_small_box,small_boxes_per_master_box,created_by_user_id,updated_by_user_id)
		VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id
	`, req.ProductID, name, version, req.PartsPerSmallBox, req.SmallBoxesPerMasterBox, userID).Scan(&newID)
	if err != nil {
		fail(c, 409, fmt.Errorf("packaging configuration could not be versioned"))
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": newID, "replaces_id": id, "version": version})
}
