package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const sessionCookie = "mrp_session"

type authUser struct {
	ID                 int64
	Username           string
	FullName           string
	Email              *string
	MustChangePassword bool
	Roles              []string
	Permissions        []string
}

func (s *Server) login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, fmt.Errorf("username and password are required"))
		return
	}
	var user authUser
	var passwordHash string
	var active bool
	err := s.db.QueryRow(c, `SELECT id,username,password_hash,full_name,email,is_active,must_change_password FROM m_users WHERE LOWER(username)=LOWER($1)`, req.Username).
		Scan(&user.ID, &user.Username, &passwordHash, &user.FullName, &user.Email, &active, &user.MustChangePassword)
	if err != nil || !active || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)) != nil {
		fail(c, http.StatusUnauthorized, fmt.Errorf("invalid username or password"))
		return
	}
	rawToken := make([]byte, 32)
	if _, err = rand.Read(rawToken); err != nil {
		fail(c, 500, err)
		return
	}
	token := hex.EncodeToString(rawToken)
	tokenHash := sha256.Sum256([]byte(token))
	expires := time.Now().Add(12 * time.Hour)
	_, err = s.db.Exec(c, `INSERT INTO t_auth_sessions(id,user_id,token_hash,expires_at,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6)`,
		uuid.New(), user.ID, hex.EncodeToString(tokenHash[:]), expires, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		fail(c, 500, err)
		return
	}
	_, _ = s.db.Exec(c, `UPDATE m_users SET last_login_at=NOW() WHERE id=$1`, user.ID)
	http.SetCookie(c.Writer, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", MaxAge: 43200, Expires: expires, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	user.Roles, user.Permissions = s.loadUserAccess(c, user.ID)
	c.JSON(200, authResponse(user))
}

func (s *Server) logout(c *gin.Context) {
	if token, err := c.Cookie(sessionCookie); err == nil {
		hash := sha256.Sum256([]byte(token))
		_, _ = s.db.Exec(c, `UPDATE t_auth_sessions SET revoked_at=NOW() WHERE token_hash=$1`, hex.EncodeToString(hash[:]))
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	c.JSON(200, gin.H{"status": "SIGNED_OUT"})
}

func (s *Server) me(c *gin.Context) {
	value, _ := c.Get("auth_user")
	user := value.(authUser)
	c.JSON(200, authResponse(user))
}

func (s *Server) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(sessionCookie)
		if err != nil || token == "" {
			fail(c, http.StatusUnauthorized, fmt.Errorf("authentication required"))
			c.Abort()
			return
		}
		hash := sha256.Sum256([]byte(token))
		var user authUser
		var active bool
		err = s.db.QueryRow(c, `
			SELECT u.id,u.username,u.full_name,u.email,u.is_active,u.must_change_password
			FROM t_auth_sessions s JOIN m_users u ON u.id=s.user_id
			WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()
		`, hex.EncodeToString(hash[:])).Scan(&user.ID, &user.Username, &user.FullName, &user.Email, &active, &user.MustChangePassword)
		if err != nil || !active {
			fail(c, http.StatusUnauthorized, fmt.Errorf("session expired"))
			c.Abort()
			return
		}
		user.Roles, user.Permissions = s.loadUserAccess(c, user.ID)
		c.Set("auth_user", user)
		c.Set("auth_user_id", user.ID)
		c.Set("auth_username", user.Username)
		c.Next()
	}
}

func (s *Server) requirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		value, exists := c.Get("auth_user")
		if !exists {
			fail(c, http.StatusUnauthorized, fmt.Errorf("authentication required"))
			c.Abort()
			return
		}
		for _, granted := range value.(authUser).Permissions {
			if granted == permission {
				c.Next()
				return
			}
		}
		fail(c, http.StatusForbidden, fmt.Errorf("permission %s is required", permission))
		c.Abort()
	}
}

func (s *Server) enforceRBAC() gin.HandlerFunc {
	return func(c *gin.Context) {
		path, method := c.FullPath(), c.Request.Method
		permission := ""
		switch {
		case path == "/api/auth/me" || path == "/api/auth/logout":
			c.Next()
			return
		case path == "/api/dashboard":
			permission = "dashboard.view"
		case path == "/api/audit-logs":
			permission = "dashboard.view"
		case len(path) >= 12 && path[:12] == "/api/master/":
			if method == http.MethodGet {
				permission = "master.view"
			} else {
				permission = "master.manage"
			}
		case path == "/api/sales-orders" || path == "/api/sales-orders/:id":
			if method == http.MethodGet {
				permission = "sales.view"
			} else {
				permission = "sales.manage"
			}
		case path == "/api/production-orders" || path == "/api/trays" || path == "/api/tray-cycles" || path == "/api/trays/assign":
			permission = "sales.view"
		case len(path) >= 8 && path[:8] == "/api/qc/":
			if method == http.MethodGet {
				permission = "qc.view"
			} else {
				permission = "qc.operate"
			}
		case len(path) >= 11 && path[:11] == "/api/laser/":
			if method == http.MethodGet {
				permission = "laser.view"
			} else {
				permission = "laser.operate"
			}
		case len(path) >= 13 && path[:13] == "/api/packing/":
			if method == http.MethodGet {
				permission = "packing.view"
			} else {
				permission = "packing.operate"
			}
		case path == "/api/finished-goods" || path == "/api/finished-goods/:code":
			permission = "inventory.view"
		case len(path) >= 20 && path[:20] == "/api/delivery-orders":
			if method == http.MethodGet {
				permission = "delivery.view"
			} else {
				permission = "delivery.manage"
			}
		case path == "/api/trace/:serial":
			permission = "trace.view"
		}
		if permission == "" {
			c.Next()
			return
		}
		value, _ := c.Get("auth_user")
		for _, granted := range value.(authUser).Permissions {
			if granted == permission {
				c.Next()
				return
			}
		}
		fail(c, http.StatusForbidden, fmt.Errorf("permission %s is required", permission))
		c.Abort()
	}
}

func (s *Server) loadUserAccess(c *gin.Context, userID int64) ([]string, []string) {
	rows, err := s.db.Query(c, `
		SELECT DISTINCT r.role_code,p.permission_code
		FROM m_user_roles ur JOIN m_roles r ON r.id=ur.role_id AND r.is_active
		LEFT JOIN m_role_permissions rp ON rp.role_id=r.id
		LEFT JOIN m_permissions p ON p.id=rp.permission_id
		WHERE ur.user_id=$1 ORDER BY r.role_code,p.permission_code
	`, userID)
	if err != nil {
		return []string{}, []string{}
	}
	defer rows.Close()
	roleSet, permissionSet := map[string]bool{}, map[string]bool{}
	for rows.Next() {
		var role string
		var permission *string
		if rows.Scan(&role, &permission) == nil {
			roleSet[role] = true
			if permission != nil {
				permissionSet[*permission] = true
			}
		}
	}
	roles, permissions := make([]string, 0, len(roleSet)), make([]string, 0, len(permissionSet))
	for role := range roleSet {
		roles = append(roles, role)
	}
	for permission := range permissionSet {
		permissions = append(permissions, permission)
	}
	return roles, permissions
}

func authResponse(user authUser) gin.H {
	return gin.H{"id": user.ID, "username": user.Username, "full_name": user.FullName, "email": user.Email, "roles": user.Roles, "permissions": user.Permissions, "must_change_password": user.MustChangePassword}
}
