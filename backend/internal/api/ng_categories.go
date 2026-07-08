package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type ngCategoryRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
	IsActive    bool   `json:"is_active"`
}

func (s *Server) listNGCategories(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT n.id,n.category_code,n.category_name,COALESCE(n.description,''),n.sort_order,n.is_active,
		       n.created_at,n.updated_at,COALESCE(cu.full_name,'System'),COALESCE(uu.full_name,cu.full_name,'System')
		FROM m_ng_categories n
		LEFT JOIN m_users cu ON cu.id=n.created_by_user_id
		LEFT JOIN m_users uu ON uu.id=n.updated_by_user_id
		WHERE ($1 OR n.is_active)
		ORDER BY n.sort_order,n.category_name
	`, c.Query("include_inactive") == "true")
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, name, description, createdBy, updatedBy string
		var sortOrder int
		var active bool
		var createdAt, updatedAt any
		if err = rows.Scan(&id, &code, &name, &description, &sortOrder, &active, &createdAt, &updatedAt, &createdBy, &updatedBy); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "code": code, "name": name, "description": description,
			"sort_order": sortOrder, "is_active": active,
			"created_at": createdAt, "updated_at": updatedAt, "created_by": createdBy, "updated_by": updatedBy,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) createNGCategory(c *gin.Context) {
	var req ngCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	name := strings.TrimSpace(req.Name)
	if code == "" {
		code = normalizeNGCategoryCode(name)
	}
	sortOrder := req.SortOrder
	if sortOrder <= 0 {
		sortOrder = 100
	}
	userID, _ := c.Get("auth_user_id")
	var id int64
	err := s.db.QueryRow(c, `
		INSERT INTO m_ng_categories (category_code,category_name,description,sort_order,created_by_user_id,updated_by_user_id)
		VALUES ($1,$2,NULLIF($3,''),$4,$5,$5) RETURNING id
	`, code, name, strings.TrimSpace(req.Description), sortOrder, userID).Scan(&id)
	if err != nil {
		fail(c, http.StatusConflict, fmt.Errorf("NG category code already exists or data is invalid"))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (s *Server) updateNGCategory(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req ngCategoryRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	name := strings.TrimSpace(req.Name)
	if code == "" {
		code = normalizeNGCategoryCode(name)
	}
	sortOrder := req.SortOrder
	if sortOrder <= 0 {
		sortOrder = 100
	}
	userID, _ := c.Get("auth_user_id")
	tag, err := s.db.Exec(c, `
		UPDATE m_ng_categories
		SET category_code=$2,category_name=$3,description=NULLIF($4,''),sort_order=$5,is_active=$6,
		    updated_by_user_id=$7,updated_at=NOW()
		WHERE id=$1
	`, id, code, name, strings.TrimSpace(req.Description), sortOrder, req.IsActive, userID)
	if err != nil || tag.RowsAffected() != 1 {
		fail(c, 404, fmt.Errorf("NG category not found"))
		return
	}
	c.JSON(200, gin.H{"id": id})
}

func normalizeNGCategoryCode(name string) string {
	code := strings.ToUpper(strings.TrimSpace(name))
	replacer := strings.NewReplacer("/", " ", "-", " ", ".", " ", ",", " ", "(", " ", ")", " ")
	code = replacer.Replace(code)
	parts := strings.Fields(code)
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "_")
}
