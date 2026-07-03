package api

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
)

func (s *Server) getPublicBranding(c *gin.Context) {
	var name string
	var wallpaper *string
	var updatedAt any
	err := s.db.QueryRow(c, `
		SELECT app_name,login_wallpaper_data_url,updated_at
		FROM m_system_branding WHERE id=1
	`).Scan(&name, &wallpaper, &updatedAt)
	if err != nil {
		c.JSON(200, gin.H{"app_name": "MRP Traceability", "login_wallpaper_data_url": nil})
		return
	}
	c.JSON(200, gin.H{"app_name": name, "login_wallpaper_data_url": wallpaper, "updated_at": updatedAt})
}

func (s *Server) updateBranding(c *gin.Context) {
	var req struct {
		AppName      string `json:"app_name" binding:"required"`
		WallpaperURL string `json:"login_wallpaper_data_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, fmt.Errorf("application name is required"))
		return
	}
	name := strings.TrimSpace(req.AppName)
	if len(name) > 100 {
		fail(c, 400, fmt.Errorf("application name must not exceed 100 characters"))
		return
	}
	wallpaper := strings.TrimSpace(req.WallpaperURL)
	if wallpaper != "" && !strings.HasPrefix(wallpaper, "data:image/jpeg;base64,") &&
		!strings.HasPrefix(wallpaper, "data:image/png;base64,") &&
		!strings.HasPrefix(wallpaper, "data:image/webp;base64,") {
		fail(c, 400, fmt.Errorf("wallpaper must be JPEG, PNG, or WebP"))
		return
	}
	if len(wallpaper) > 7*1024*1024 {
		fail(c, 413, fmt.Errorf("wallpaper exceeds the 5 MB limit"))
		return
	}
	userID, _ := c.Get("auth_user_id")
	var value any
	if wallpaper != "" {
		value = wallpaper
	}
	_, err := s.db.Exec(c, `
		INSERT INTO m_system_branding(id,app_name,login_wallpaper_data_url,updated_by_user_id,updated_at)
		VALUES(1,$1,$2,$3,NOW())
		ON CONFLICT(id) DO UPDATE SET
			app_name=EXCLUDED.app_name,
			login_wallpaper_data_url=EXCLUDED.login_wallpaper_data_url,
			updated_by_user_id=EXCLUDED.updated_by_user_id,
			updated_at=NOW()
	`, name, value, userID)
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"app_name": name, "login_wallpaper_data_url": value})
}
