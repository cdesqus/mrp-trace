package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func auditModule(path string) string {
	switch {
	case strings.HasPrefix(path, "/api/master/"):
		return "Master Data"
	case strings.HasPrefix(path, "/api/sales-orders"), strings.HasPrefix(path, "/api/production-orders"),
		strings.HasPrefix(path, "/api/trays"), strings.HasPrefix(path, "/api/tray-cycles"),
		strings.HasPrefix(path, "/api/laser/"):
		return "Production"
	case strings.HasPrefix(path, "/api/qc/"):
		return "Quality Control"
	case strings.HasPrefix(path, "/api/packing/"), strings.HasPrefix(path, "/api/finished-goods"),
		strings.HasPrefix(path, "/api/delivery-orders"):
		return "Logistics & Packing"
	case strings.HasPrefix(path, "/api/trace/"):
		return "Analytics"
	case strings.HasPrefix(path, "/api/settings/"):
		return "Settings"
	default:
		return ""
	}
}

func auditEntity(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 {
		return "system"
	}
	if len(parts) >= 3 && parts[1] == "master" {
		return strings.ReplaceAll(parts[2], "-", "_")
	}
	return strings.ReplaceAll(parts[1], "-", "_")
}

func auditAction(method, path string) string {
	switch method {
	case http.MethodPost:
		if strings.Contains(path, "/finish") {
			return "FINISH"
		}
		if strings.Contains(path, "/evaluate") {
			return "EVALUATE"
		}
		if strings.Contains(path, "/assign") {
			return "ASSIGN"
		}
		if strings.Contains(path, "/resend") {
			return "RESEND"
		}
		return "CREATE"
	case http.MethodPatch, http.MethodPut:
		return "UPDATE"
	case http.MethodDelete:
		return "DELETE"
	default:
		return method
	}
}

func (s *Server) auditMutations() gin.HandlerFunc {
	return func(c *gin.Context) {
		method, path := c.Request.Method, c.Request.URL.Path
		module := auditModule(path)
		c.Next()
		if module == "" || method == http.MethodGet || method == http.MethodHead || c.Writer.Status() >= 400 {
			return
		}
		userID, exists := c.Get("auth_user_id")
		if !exists {
			return
		}
		metadata := fmt.Sprintf(`{"module":%q,"path":%q,"method":%q,"status":%d}`,
			module, path, method, c.Writer.Status())
		_, _ = s.db.Exec(c, `
			INSERT INTO t_audit_logs(user_id,action,entity_type,entity_id,metadata,ip_address)
			VALUES($1,$2,$3,NULLIF($4,''),$5::jsonb,$6)
		`, userID, auditAction(method, path), auditEntity(path), c.Param("id"), metadata, c.ClientIP())
	}
}

func (s *Server) listAuditLogs(c *gin.Context) {
	module := strings.TrimSpace(c.Query("module"))
	rows, err := s.db.Query(c, `
		SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.ip_address,a.created_at,
		       COALESCE(u.full_name,'System'),COALESCE(u.username,'system')
		FROM t_audit_logs a
		LEFT JOIN m_users u ON u.id=a.user_id
		WHERE ($1='' OR a.metadata->>'module'=$1)
		ORDER BY a.created_at DESC
		LIMIT 100
	`, module)
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer rows.Close()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var action, entityType, fullName, username string
		var entityID, ip *string
		var metadata any
		var created time.Time
		if err = rows.Scan(&id, &action, &entityType, &entityID, &metadata, &ip, &created, &fullName, &username); err != nil {
			fail(c, 500, err)
			return
		}
		items = append(items, gin.H{
			"id": id, "action": action, "entity_type": entityType, "entity_id": entityID,
			"metadata": metadata, "ip_address": ip, "created_at": created,
			"user": gin.H{"full_name": fullName, "username": username},
		})
	}
	c.JSON(200, gin.H{"items": items})
}
