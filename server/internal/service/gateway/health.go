package gateway

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
)

const (
	checkInterval    = 60 * time.Second
	recoveryInterval = 120 * time.Second
	healthTimeout    = 10 * time.Second
	maxConcurrent    = 5
	failureThreshold = 3
)

// HealthChecker runs periodic liveness checks against all connected instances
// and attempts to reconnect OFFLINE/ERROR instances.
type HealthChecker struct {
	registry     *Registry
	db           *gorm.DB
	enc          *crypto.Encryptor
	logger       *zap.Logger
	failureCounts sync.Map // instanceID → *atomic.Int64
}

// NewHealthChecker creates a HealthChecker. Call Start to begin background checks.
func NewHealthChecker(registry *Registry, db *gorm.DB, enc *crypto.Encryptor, logger *zap.Logger) *HealthChecker {
	return &HealthChecker{
		registry: registry,
		db:       db,
		enc:      enc,
		logger:   logger,
	}
}

// Start launches background goroutines for health checks and recovery.
// It blocks until ctx is cancelled.
func (h *HealthChecker) Start(ctx context.Context) {
	// Run an initial pass immediately.
	h.checkAll(ctx)
	h.recoverInstances(ctx)

	checkTicker := time.NewTicker(checkInterval)
	recoveryTicker := time.NewTicker(recoveryInterval)
	defer checkTicker.Stop()
	defer recoveryTicker.Stop()

	for {
		select {
		case <-checkTicker.C:
			h.checkAll(ctx)
		case <-recoveryTicker.C:
			h.recoverInstances(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// checkAll runs health checks against all ONLINE/DEGRADED instances in batches.
func (h *HealthChecker) checkAll(ctx context.Context) {
	var instances []model.Instance
	if err := h.db.Where("status IN ?", []model.InstanceStatus{
		model.InstanceStatusOnline,
		model.InstanceStatusDegraded,
	}).Find(&instances).Error; err != nil {
		h.logger.Error("health: failed to query instances", zap.Error(err))
		return
	}

	h.runBatched(ctx, instances, func(ctx context.Context, inst model.Instance) {
		h.checkInstance(ctx, inst)
	})
}

// recoverInstances attempts to reconnect instances that are OFFLINE or in ERROR state.
func (h *HealthChecker) recoverInstances(ctx context.Context) {
	var instances []model.Instance
	if err := h.db.Where("status IN ?", []model.InstanceStatus{
		model.InstanceStatusError,
		model.InstanceStatusOffline,
	}).Find(&instances).Error; err != nil {
		h.logger.Error("health: failed to query instances for recovery", zap.Error(err))
		return
	}

	h.runBatched(ctx, instances, func(ctx context.Context, inst model.Instance) {
		h.recoverInstance(ctx, inst)
	})
}

// checkInstance runs a single health check for the given instance.
func (h *HealthChecker) checkInstance(ctx context.Context, inst model.Instance) {
	ctx, cancel := context.WithTimeout(ctx, healthTimeout)
	defer cancel()

	if !h.registry.IsConnected(inst.ID) {
		h.recordFailure(inst)
		return
	}

	// Send "health" request to the gateway.
	payload, err := h.registry.Request(ctx, inst.ID, "health", nil)
	if err != nil {
		h.logger.Warn("health: check failed",
			zap.String("instanceId", inst.ID),
			zap.String("name", inst.Name),
			zap.Error(err))
		h.recordFailure(inst)
		return
	}

	// Success — parse health data and update DB.
	var healthData map[string]any
	_ = json.Unmarshal(payload, &healthData)

	version := ""
	if v, ok := healthData["version"].(string); ok && v != "" && v != "dev" && v != "unknown" {
		version = v
	}
	if version == "" {
		version = h.registry.GetServerVersion(inst.ID)
	}

	now := time.Now()
	updates := map[string]any{
		"status":            model.InstanceStatusOnline,
		"last_health_check": now,
		"health_data":       string(payload),
	}
	if version != "" {
		updates["version"] = version
	}
	h.db.Model(&inst).Updates(updates)

	// Reset failure counter.
	h.failureCounts.Delete(inst.ID)

	h.logger.Debug("health: check passed",
		zap.String("instanceId", inst.ID),
		zap.String("name", inst.Name),
	)
}

// recoverInstance tries to (re-)establish a connection for an OFFLINE/ERROR instance.
func (h *HealthChecker) recoverInstance(ctx context.Context, inst model.Instance) {
	// If already reconnected (e.g., by the client's own reconnect logic), just check health.
	if h.registry.IsConnected(inst.ID) {
		h.checkInstance(ctx, inst)
		return
	}

	// Disconnect stale entry if any.
	if _, ok := h.registry.GetStatus(inst.ID); ok {
		h.registry.Disconnect(inst.ID)
	}

	token, err := h.enc.Decrypt(inst.GatewayToken)
	if err != nil {
		h.logger.Error("health: decrypt token failed",
			zap.String("instanceId", inst.ID), zap.Error(err))
		return
	}

	connCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if err := h.registry.Connect(connCtx, inst.ID, inst.GatewayURL, token); err != nil {
		// Still unreachable — leave status unchanged, retry next cycle.
		h.logger.Debug("health: recovery connect failed",
			zap.String("instanceId", inst.ID),
			zap.String("name", inst.Name),
			zap.Error(err))
		return
	}

	// Connection succeeded — run health check to promote to ONLINE.
	h.checkInstance(ctx, inst)
	h.logger.Info("health: recovered instance",
		zap.String("instanceId", inst.ID),
		zap.String("name", inst.Name),
	)
}

// recordFailure increments the failure counter and downgrades the instance status.
func (h *HealthChecker) recordFailure(inst model.Instance) {
	val, _ := h.failureCounts.LoadOrStore(inst.ID, new(atomic.Int64))
	counter := val.(*atomic.Int64)
	failures := counter.Add(1)

	newStatus := model.InstanceStatusDegraded
	if failures >= failureThreshold {
		newStatus = model.InstanceStatusOffline
		// Reset counter so next recovery attempt starts fresh.
		counter.Store(0)
	}

	now := time.Now()
	h.db.Model(&inst).Updates(map[string]any{
		"status":            newStatus,
		"last_health_check": now,
	})
}

// runBatched executes fn for each instance in concurrent batches of maxConcurrent.
func (h *HealthChecker) runBatched(ctx context.Context, instances []model.Instance, fn func(context.Context, model.Instance)) {
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup

	for _, inst := range instances {
		inst := inst
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			fn(ctx, inst)
		}()
	}

	wg.Wait()
}
