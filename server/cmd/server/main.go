package main

import (
	"fmt"
	"log"
	"time"

	"github.com/casbin/casbin/v2"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/szsip239/teamclaw/server/internal/config"
	"github.com/szsip239/teamclaw/server/internal/handler"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
)

func main() {
	// ── Load config ────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// ── Logger ─────────────────────────────────────────
	var logger *zap.Logger
	if cfg.Server.Mode == "release" {
		logger, _ = zap.NewProduction()
	} else {
		logger, _ = zap.NewDevelopment()
	}
	defer logger.Sync()

	// ── Database ───────────────────────────────────────
	gormCfg := &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	}
	if cfg.Server.Mode == "debug" {
		gormCfg.Logger = gormlogger.Default.LogMode(gormlogger.Info)
	}

	db, err := gorm.Open(postgres.Open(cfg.Database.URL), gormCfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.Database.ConnMaxLifetime) * time.Second)

	// Auto-migrate models
	if err := db.AutoMigrate(model.AllModels()...); err != nil {
		log.Fatalf("Failed to auto-migrate: %v", err)
	}
	logger.Info("Database migrated successfully")

	// ── Casbin ─────────────────────────────────────────
	enforcer, err := casbin.NewEnforcer("configs/rbac_model.conf", "configs/rbac_policy.csv")
	if err != nil {
		log.Fatalf("Failed to initialize Casbin: %v", err)
	}
	logger.Info("Casbin RBAC initialized")

	// ── Encryptor ──────────────────────────────────────
	enc, err := crypto.NewEncryptor(cfg.Crypto.EncryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize encryptor: %v", err)
	}

	// ── JWT Service ────────────────────────────────────
	jwtService, err := middleware.NewJWTService(&cfg.JWT)
	if err != nil {
		log.Fatalf("Failed to initialize JWT service: %v", err)
	}

	// ── Gin Router ─────────────────────────────────────
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// Global middleware
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger))
	r.Use(middleware.CORS(&cfg.CORS))

	// Health check endpoint (no auth required)
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// ── API v1 Routes ──────────────────────────────────
	v1 := r.Group("/api/v1")

	// Public routes (no auth)
	public := v1.Group("")

	// Protected routes (require JWT)
	protected := v1.Group("")
	protected.Use(middleware.JWTAuth(&cfg.JWT))
	protected.Use(middleware.AuditLog(db))

	// ── Register Handlers ──────────────────────────────
	authHandler := handler.NewAuthHandler(db, jwtService)
	authHandler.RegisterRoutes(public, protected)

	userHandler := handler.NewUserHandler(db)
	users := protected.Group("/users")
	{
		users.GET("", middleware.RequirePermission(enforcer, "users", "list"), userHandler.List)
		users.POST("", middleware.RequirePermission(enforcer, "users", "create"), userHandler.Create)
		users.PATCH("/:id", middleware.RequirePermission(enforcer, "users", "update"), userHandler.Update)
		users.DELETE("/:id", middleware.RequirePermission(enforcer, "users", "delete"), userHandler.Delete)
	}

	departmentHandler := handler.NewDepartmentHandler(db)
	departments := protected.Group("/departments")
	{
		departments.GET("", middleware.RequirePermission(enforcer, "departments", "list"), departmentHandler.List)
		departments.GET("/:id", middleware.RequirePermission(enforcer, "departments", "view"), departmentHandler.Get)
		departments.POST("", middleware.RequirePermission(enforcer, "departments", "create"), departmentHandler.Create)
		departments.PATCH("/:id", middleware.RequirePermission(enforcer, "departments", "update"), departmentHandler.Update)
		departments.DELETE("/:id", middleware.RequirePermission(enforcer, "departments", "delete"), departmentHandler.Delete)
	}

	instanceHandler := handler.NewInstanceHandler(db, enc)
	instances := protected.Group("/instances")
	{
		instances.GET("", middleware.RequirePermission(enforcer, "instances", "view"), instanceHandler.List)
		instances.GET("/:id", middleware.RequirePermission(enforcer, "instances", "view"), instanceHandler.Get)
		instances.POST("", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.Create)
		instances.PATCH("/:id", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.Update)
		instances.DELETE("/:id", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.Delete)
		instances.GET("/:id/accesses", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.ListAccesses)
		instances.POST("/:id/accesses", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.GrantAccess)
		instances.DELETE("/:id/accesses/:accessId", middleware.RequirePermission(enforcer, "instances", "manage"), instanceHandler.RevokeAccess)
	}

	agentHandler := handler.NewAgentHandler(db)
	agents := protected.Group("/agents")
	{
		agents.GET("", middleware.RequirePermission(enforcer, "agents", "view"), agentHandler.List)
		agents.GET("/:id", middleware.RequirePermission(enforcer, "agents", "view"), agentHandler.Get)
		agents.POST("", middleware.RequirePermission(enforcer, "agents", "create"), agentHandler.Create)
		agents.POST("/clone", middleware.RequirePermission(enforcer, "agents", "create"), agentHandler.Clone)
		agents.PATCH("/:id", middleware.RequirePermission(enforcer, "agents", "manage"), agentHandler.Update)
		agents.DELETE("/:id", middleware.RequirePermission(enforcer, "agents", "manage"), agentHandler.Delete)
	}

	auditHandler := handler.NewAuditLogHandler(db)
	auditLogs := protected.Group("/audit-logs")
	{
		// view_dept is the minimum permission; handler auto-scopes by role:
		// SYSTEM_ADMIN → all logs; DEPT_ADMIN → own department's logs only
		auditLogs.GET("", middleware.RequirePermission(enforcer, "audit", "view_dept"), auditHandler.List)
		auditLogs.GET("/export", middleware.RequirePermission(enforcer, "audit", "view_dept"), auditHandler.Export)
	}

	dashboardHandler := handler.NewDashboardHandler(db)
	dashboard := protected.Group("/dashboard")
	{
		dashboard.GET("/stats", middleware.RequirePermission(enforcer, "monitor", "view_basic"), dashboardHandler.Stats)
	}

	// TODO: Add remaining handlers
	// chatHandler := handler.NewChatHandler(db)
	// skillHandler := handler.NewSkillHandler(db)
	// resourceHandler := handler.NewResourceHandler(db)

	// ── Start Server ───────────────────────────────────
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	logger.Info("Starting TeamClaw API server", zap.String("addr", addr), zap.String("mode", cfg.Server.Mode))

	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
