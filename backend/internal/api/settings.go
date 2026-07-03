package api

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func (s *Server) listSettingsUsers(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT u.id,u.username,u.full_name,u.email,u.is_active,u.must_change_password,u.last_login_at,u.created_at,
		       COALESCE(ARRAY_AGG(r.role_code ORDER BY r.role_code) FILTER(WHERE r.id IS NOT NULL),'{}'::VARCHAR[])
		FROM m_users u LEFT JOIN m_user_roles ur ON ur.user_id=u.id LEFT JOIN m_roles r ON r.id=ur.role_id
		GROUP BY u.id ORDER BY u.full_name,u.username
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var username, name string
		var email *string
		var active, mustChange bool
		var lastLogin *time.Time
		var created time.Time
		var roles []string
		if err = rows.Scan(&id, &username, &name, &email, &active, &mustChange, &lastLogin, &created, &roles); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"id": id, "username": username, "full_name": name, "email": email, "is_active": active, "must_change_password": mustChange, "last_login_at": lastLogin, "created_at": created, "roles": roles})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) createSettingsUser(c *gin.Context) {
	var req struct {
		Username  string   `json:"username" binding:"required"`
		Password  string   `json:"password" binding:"required"`
		FullName  string   `json:"full_name" binding:"required"`
		Email     string   `json:"email"`
		RoleCodes []string `json:"role_codes" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Password) < 8 {
		fail(c, 400, fmt.Errorf("username, full name, password (minimum 8 characters), and role are required"))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, 500, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var id int64
	err = tx.QueryRow(c, `INSERT INTO m_users(username,password_hash,full_name,email,must_change_password) VALUES($1,$2,$3,NULLIF($4,''),TRUE) RETURNING id`,
		strings.ToLower(strings.TrimSpace(req.Username)), string(hash), strings.TrimSpace(req.FullName), strings.TrimSpace(req.Email)).Scan(&id)
	if err != nil {
		fail(c, 409, fmt.Errorf("username already exists"))
		return
	}
	tag, err := tx.Exec(c, `INSERT INTO m_user_roles(user_id,role_id) SELECT $1,id FROM m_roles WHERE role_code=ANY($2) AND is_active ON CONFLICT DO NOTHING`, id, req.RoleCodes)
	if err != nil || tag.RowsAffected() != int64(len(req.RoleCodes)) {
		fail(c, 400, fmt.Errorf("one or more roles are invalid"))
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "username": strings.ToLower(strings.TrimSpace(req.Username))})
}

func (s *Server) updateSettingsUser(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		FullName  *string  `json:"full_name"`
		Email     *string  `json:"email"`
		Password  *string  `json:"password"`
		IsActive  *bool    `json:"is_active"`
		RoleCodes []string `json:"role_codes"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	if req.FullName != nil {
		if strings.TrimSpace(*req.FullName) == "" {
			fail(c, 400, fmt.Errorf("full name is required"))
			return
		}
		_, err = tx.Exec(c, `UPDATE m_users SET full_name=$2,updated_at=NOW() WHERE id=$1`, id, strings.TrimSpace(*req.FullName))
	}
	if err == nil && req.Email != nil {
		_, err = tx.Exec(c, `UPDATE m_users SET email=NULLIF($2,''),updated_at=NOW() WHERE id=$1`, id, strings.TrimSpace(*req.Email))
	}
	if err == nil && req.Password != nil && *req.Password != "" {
		if len(*req.Password) < 8 {
			fail(c, 400, fmt.Errorf("password must contain at least 8 characters"))
			return
		}
		var hash []byte
		hash, err = bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if err == nil {
			_, err = tx.Exec(c, `UPDATE m_users SET password_hash=$2,must_change_password=TRUE,updated_at=NOW() WHERE id=$1`, id, string(hash))
		}
	}
	if err == nil && req.IsActive != nil {
		if _, err = tx.Exec(c, `UPDATE m_users SET is_active=$2,updated_at=NOW() WHERE id=$1`, id, *req.IsActive); err != nil {
			fail(c, 500, err)
			return
		}
	}
	if err == nil && req.RoleCodes != nil {
		if _, err = tx.Exec(c, `DELETE FROM m_user_roles WHERE user_id=$1`, id); err == nil {
			_, err = tx.Exec(c, `INSERT INTO m_user_roles(user_id,role_id) SELECT $1,id FROM m_roles WHERE role_code=ANY($2)`, id, req.RoleCodes)
		}
		if err != nil {
			fail(c, 400, fmt.Errorf("invalid roles"))
			return
		}
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": id, "updated": true})
}

func (s *Server) deleteSettingsUser(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	current, _ := c.Get("auth_user_id")
	if current.(int64) == id {
		fail(c, 409, fmt.Errorf("you cannot delete your own active account"))
		return
	}
	var username string
	if err = s.db.QueryRow(c, `SELECT username FROM m_users WHERE id=$1`, id).Scan(&username); err != nil {
		fail(c, 404, fmt.Errorf("user not found"))
		return
	}
	if username == "admin" {
		fail(c, 409, fmt.Errorf("bootstrap administrator cannot be deleted"))
		return
	}
	if _, err = s.db.Exec(c, `DELETE FROM m_users WHERE id=$1`, id); err != nil {
		fail(c, 409, err)
		return
	}
	c.JSON(200, gin.H{"id": id, "deleted": true})
}

func (s *Server) listSettingsRoles(c *gin.Context) {
	rows, err := s.db.Query(c, `
		SELECT r.id,r.role_code,r.role_name,r.description,r.is_system,r.is_active,
		       COUNT(DISTINCT ur.user_id),COALESCE(ARRAY_AGG(p.permission_code ORDER BY p.permission_code) FILTER(WHERE p.id IS NOT NULL),'{}'::VARCHAR[])
		FROM m_roles r LEFT JOIN m_user_roles ur ON ur.role_id=r.id
		LEFT JOIN m_role_permissions rp ON rp.role_id=r.id LEFT JOIN m_permissions p ON p.id=rp.permission_id
		GROUP BY r.id ORDER BY r.is_system DESC,r.role_name
	`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var code, name string
		var description *string
		var system, active bool
		var users int
		var permissions []string
		if err = rows.Scan(&id, &code, &name, &description, &system, &active, &users, &permissions); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{"id": id, "role_code": code, "role_name": name, "description": description, "is_system": system, "is_active": active, "user_count": users, "permissions": permissions})
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) listSettingsPermissions(c *gin.Context) {
	rows, err := s.db.Query(c, `SELECT permission_code,permission_name,module FROM m_permissions ORDER BY module,permission_code`)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var code, name, module string
		if rows.Scan(&code, &name, &module) == nil {
			items = append(items, gin.H{"permission_code": code, "permission_name": name, "module": module})
		}
	}
	c.JSON(200, gin.H{"items": items})
}

func (s *Server) updateRolePermissions(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		PermissionCodes []string `json:"permission_codes"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	if _, err = tx.Exec(c, `DELETE FROM m_role_permissions WHERE role_id=$1`, id); err == nil {
		tag, execErr := tx.Exec(c, `INSERT INTO m_role_permissions(role_id,permission_id) SELECT $1,id FROM m_permissions WHERE permission_code=ANY($2)`, id, req.PermissionCodes)
		err = execErr
		if err == nil && tag.RowsAffected() != int64(len(req.PermissionCodes)) {
			err = fmt.Errorf("one or more permissions are invalid")
		}
	}
	if err != nil {
		fail(c, 400, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"role_id": id, "permissions": req.PermissionCodes})
}

var roleCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{1,59}$`)

func (s *Server) createSettingsRole(c *gin.Context) {
	var req struct {
		RoleCode        string   `json:"role_code"`
		RoleName        string   `json:"role_name"`
		Description     string   `json:"description"`
		PermissionCodes []string `json:"permission_codes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.RoleCode))
	if !roleCodePattern.MatchString(code) || strings.TrimSpace(req.RoleName) == "" {
		fail(c, 400, fmt.Errorf("valid role code and name are required"))
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	var id int64
	err = tx.QueryRow(c, `INSERT INTO m_roles(role_code,role_name,description) VALUES($1,$2,NULLIF($3,'')) RETURNING id`, code, strings.TrimSpace(req.RoleName), strings.TrimSpace(req.Description)).Scan(&id)
	if err != nil {
		fail(c, 409, fmt.Errorf("role code already exists"))
		return
	}
	tag, err := tx.Exec(c, `INSERT INTO m_role_permissions(role_id,permission_id) SELECT $1,id FROM m_permissions WHERE permission_code=ANY($2)`, id, req.PermissionCodes)
	if err != nil || tag.RowsAffected() != int64(len(req.PermissionCodes)) {
		fail(c, 400, fmt.Errorf("one or more permissions are invalid"))
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "role_code": code})
}

func (s *Server) updateSettingsRole(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var req struct {
		RoleName        string   `json:"role_name"`
		Description     string   `json:"description"`
		IsActive        *bool    `json:"is_active"`
		PermissionCodes []string `json:"permission_codes"`
	}
	if err = c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, err)
		return
	}
	tx, err := s.db.BeginTx(c, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback(c)
	if strings.TrimSpace(req.RoleName) != "" {
		_, err = tx.Exec(c, `UPDATE m_roles SET role_name=$2,description=NULLIF($3,'') WHERE id=$1`, id, strings.TrimSpace(req.RoleName), strings.TrimSpace(req.Description))
	}
	if err == nil && req.IsActive != nil {
		_, err = tx.Exec(c, `UPDATE m_roles SET is_active=$2 WHERE id=$1`, id, *req.IsActive)
	}
	if err == nil && req.PermissionCodes != nil {
		_, err = tx.Exec(c, `DELETE FROM m_role_permissions WHERE role_id=$1`, id)
		if err == nil {
			result, execErr := tx.Exec(c, `INSERT INTO m_role_permissions(role_id,permission_id) SELECT $1,id FROM m_permissions WHERE permission_code=ANY($2)`, id, req.PermissionCodes)
			err = execErr
			if err == nil && result.RowsAffected() != int64(len(req.PermissionCodes)) {
				err = fmt.Errorf("invalid permissions")
			}
		}
	}
	if err != nil {
		fail(c, 400, err)
		return
	}
	if err = tx.Commit(c); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"id": id, "updated": true})
}

func (s *Server) deleteSettingsRole(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		fail(c, 400, err)
		return
	}
	var system bool
	var users int
	err = s.db.QueryRow(c, `SELECT is_system,(SELECT COUNT(*) FROM m_user_roles WHERE role_id=$1) FROM m_roles WHERE id=$1`, id).Scan(&system, &users)
	if err != nil {
		fail(c, 404, fmt.Errorf("role not found"))
		return
	}
	if system {
		fail(c, 409, fmt.Errorf("system roles cannot be deleted"))
		return
	}
	if users > 0 {
		fail(c, 409, fmt.Errorf("remove this role from %d users before deleting it", users))
		return
	}
	if _, err = s.db.Exec(c, `DELETE FROM m_roles WHERE id=$1`, id); err != nil {
		fail(c, 409, err)
		return
	}
	c.JSON(200, gin.H{"id": id, "deleted": true})
}
