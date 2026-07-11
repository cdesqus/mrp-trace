package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) http.Handler {
	s := &Server{db: db}
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger())
	r.GET("/health", s.health)

	api := r.Group("/api")
	api.POST("/auth/login", s.login)
	api.GET("/public/branding", s.getPublicBranding)
	api.Use(s.requireAuth(), s.enforceRBAC(), s.auditMutations())
	api.GET("/auth/me", s.me)
	api.POST("/auth/logout", s.logout)
	api.GET("/dashboard", s.dashboard)
	api.GET("/audit-logs", s.listAuditLogs)
	api.GET("/master/customers", s.listCustomers)
	api.POST("/master/customers", s.createCustomer)
	api.PATCH("/master/customers/:id", s.updateCustomer)
	api.GET("/master/products", s.listProducts)
	api.POST("/master/products", s.createProduct)
	api.PATCH("/master/products/:id", s.updateProduct)
	api.PUT("/master/products/:id/qc-image", s.updateProductQCImage)
	api.GET("/master/packaging-configs", s.listPackagingConfigs)
	api.POST("/master/packaging-configs", s.createPackagingConfig)
	api.PATCH("/master/packaging-configs/:id/status", s.updatePackagingStatus)
	api.PATCH("/master/packaging-configs/:id", s.updatePackagingConfig)
	api.GET("/master/ng-categories", s.listNGCategories)
	api.POST("/master/ng-categories", s.createNGCategory)
	api.PATCH("/master/ng-categories/:id", s.updateNGCategory)
	api.GET("/master/trays", s.listMasterTrays)
	api.POST("/master/trays", s.createMasterTray)
	api.PATCH("/master/trays/:id", s.updateMasterTray)
	api.GET("/sales-orders", s.listSalesOrders)
	api.POST("/sales-orders", s.createSalesOrder)
	api.GET("/sales-orders/:id", s.getSalesOrder)
	api.GET("/production-orders", s.listProductionOrders)
	api.GET("/trays", s.listTrays)
	api.GET("/tray-cycles", s.listTrayCycles)
	api.POST("/trays/assign", s.assignTray)
	api.GET("/qc/trays/:code", s.getQCTray)
	api.GET("/qc/serials/:serial", s.getQCSerial)
	api.GET("/qc/rework/open", s.listOpenReworks)
	api.GET("/qc/rework/:code", s.getRework)
	api.GET("/qc/history", s.listQCHistory)
	api.GET("/qc/setup/orders", s.listQCSetupOrders)
	api.GET("/qc/v2/trays/:code/validate", s.validateQCTray)
	api.GET("/qc/v2/rework-trays/active", s.listActiveReworkTrays)
	api.POST("/qc/v2/rework-trays/:code/lock", s.lockReworkTray)
	api.DELETE("/qc/v2/rework-trays/:code/lock", s.unlockReworkTray)
	api.POST("/qc/sessions", s.createQCSession)
	api.GET("/qc/sessions/active", s.listActiveQCSessions)
	api.GET("/qc/sessions/:id", s.getQCSession)
	api.POST("/qc/sessions/:id/evaluate", s.evaluateQCSessionItem)
	api.POST("/qc/sessions/:id/finish", s.finishQCSession)
	api.GET("/qc/v2/rework/open", s.listPreLaserReworks)
	api.GET("/qc/v2/rework/staged", s.listStagedReworks)
	api.GET("/qc/v2/history", s.listPreLaserQCHistory)
	api.GET("/qc/v2/rework/:code", s.getPreLaserRework)
	api.POST("/qc/v2/rework/:code/pass", s.passPreLaserRework)
	api.POST("/qc/v2/rework/finish", s.finishReworkBatch)
	api.GET("/laser/batches", s.listLaserBatches)
	api.POST("/laser/batches", s.createLaserBatch)
	api.GET("/laser/batches/:id", s.getLaserBatch)
	api.POST("/laser/batches/:id/resend", s.resendLaserBatch)
	api.GET("/laser/ready", s.listLaserReady)
	api.POST("/laser/batches/v2", s.createPreQCFlowLaserBatch)
	api.POST("/qc/serial-groups", s.allocateSerialGroup)
	api.POST("/qc/laser-next", s.laserNext)
	api.POST("/qc/evaluate", s.evaluateQC)
	api.GET("/packing/queue", s.packingQueue)
	api.GET("/packing/small-boxes", s.listSmallBoxes)
	api.GET("/packing/small-boxes/:code", s.getSmallBox)
	api.POST("/packing/small-box", s.lockSmallBox)
	api.POST("/packing/master-box", s.lockMasterBox)
	api.GET("/finished-goods", s.listFinishedGoods)
	api.GET("/finished-goods/:code", s.getFinishedGood)
	api.GET("/delivery-orders", s.listDeliveryOrders)
	api.POST("/delivery-orders", s.createDeliveryOrder)
	api.GET("/delivery-orders/:id/detail", s.getDeliveryOrderDetail)
	api.GET("/delivery-orders/:id/available-master-boxes", s.listDeliveryAvailableMasterBoxes)
	api.POST("/delivery-orders/:id/auto-assign", s.autoAssignDeliveryMasterBoxes)
	api.POST("/delivery-orders/:id/master-boxes", s.assignMasterBox)
	api.POST("/delivery-orders/:id/ship", s.shipDeliveryOrder)
	api.GET("/delivery-orders/:id/pdf", s.deliveryOrderPDF)
	api.GET("/trace/:serial", s.traceSerial)
	settings := api.Group("/settings", s.requirePermission("settings.manage"))
	settings.GET("/users", s.listSettingsUsers)
	settings.POST("/users", s.createSettingsUser)
	settings.PATCH("/users/:id", s.updateSettingsUser)
	settings.DELETE("/users/:id", s.deleteSettingsUser)
	settings.GET("/roles", s.listSettingsRoles)
	settings.POST("/roles", s.createSettingsRole)
	settings.PATCH("/roles/:id", s.updateSettingsRole)
	settings.DELETE("/roles/:id", s.deleteSettingsRole)
	settings.PATCH("/roles/:id/permissions", s.updateRolePermissions)
	settings.GET("/permissions", s.listSettingsPermissions)
	settings.PUT("/branding", s.updateBranding)
	return r
}

func (s *Server) health(c *gin.Context) {
	if err := s.db.Ping(c); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "down"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func stationContext(c *gin.Context) (operator, station string, ok bool) {
	if user, exists := c.Get("auth_user"); exists {
		operator = user.(authUser).FullName
	}
	if operator == "" {
		operator = c.GetHeader("X-Operator-ID")
	}
	station = c.GetHeader("X-Station-ID")
	if operator == "" {
		if username, exists := c.Get("auth_username"); exists {
			operator = username.(string)
		}
	}
	if station == "" {
		station = "WEB-STATION"
	}
	if operator == "" || station == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "X-Operator-ID and X-Station-ID are required"})
		return "", "", false
	}
	return operator, station, true
}

func fail(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{"error": err.Error()})
}
