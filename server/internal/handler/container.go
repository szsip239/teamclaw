package handler

import (
	"context"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	dockersvc "github.com/szsip239/teamclaw/server/internal/service/docker"
	"gorm.io/gorm"
)

// ContainerHandler handles Docker container lifecycle endpoints for instances.
type ContainerHandler struct {
	db     *gorm.DB
	docker *dockersvc.Manager
}

// NewContainerHandler creates a new ContainerHandler.
// Returns nil docker manager if Docker is unavailable (non-fatal for startup).
func NewContainerHandler(db *gorm.DB) *ContainerHandler {
	mgr, err := dockersvc.New()
	if err != nil {
		// Docker unavailable (e.g., socket not mounted); endpoints will return 503
		return &ContainerHandler{db: db, docker: nil}
	}
	return &ContainerHandler{db: db, docker: mgr}
}

// dockerReady returns false and writes a 503 if Docker is not available.
func (h *ContainerHandler) dockerReady(c *gin.Context) bool {
	if h.docker == nil {
		response.ServiceUnavailable(c, "Docker is not available on this host")
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if !h.docker.IsAvailable(ctx) {
		response.ServiceUnavailable(c, "Docker daemon is not reachable")
		return false
	}
	return true
}

// loadInstance fetches the instance by ID, returning false if not found.
func (h *ContainerHandler) loadInstance(c *gin.Context, id string) (model.Instance, bool) {
	var inst model.Instance
	if err := h.db.First(&inst, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return inst, false
	}
	return inst, true
}

// ─── Handlers ──────────────────────────────────────────

// Start handles POST /api/v1/instances/:id/container
// Pulls the image (if needed), creates and starts a container, updates instance.
func (h *ContainerHandler) Start(c *gin.Context) {
	if !h.dockerReady(c) {
		return
	}

	id := c.Param("id")
	inst, ok := h.loadInstance(c, id)
	if !ok {
		return
	}

	if inst.ContainerID != nil {
		response.BadRequest(c, "container is already running — stop it first")
		return
	}

	ctx := c.Request.Context()

	// Pull image (no-op if already local)
	if err := h.docker.PullImage(ctx, inst.ImageName, nil); err != nil {
		response.InternalError(c, "failed to pull image: "+err.Error())
		return
	}

	cfg := dockersvc.ParseContainerConfig(inst.DockerConfig)

	containerID, containerName, err := h.docker.StartContainer(ctx, inst.ID, inst.ImageName, cfg)
	if err != nil {
		response.InternalError(c, "failed to start container: "+err.Error())
		return
	}

	now := time.Now()
	h.db.Model(&inst).Updates(map[string]interface{}{
		"container_id":      containerID,
		"container_name":    containerName,
		"status":            model.InstanceStatusOnline,
		"last_health_check": now,
	})

	// Log who started it
	_ = middleware.GetUserID(c)

	info, _ := h.docker.InspectContainer(ctx, containerID)
	response.OK(c, gin.H{
		"containerId":   containerID,
		"containerName": containerName,
		"status":        model.InstanceStatusOnline,
		"info":          info,
	})
}

// Stop handles DELETE /api/v1/instances/:id/container
// Stops and removes the container, updates instance status.
func (h *ContainerHandler) Stop(c *gin.Context) {
	if !h.dockerReady(c) {
		return
	}

	id := c.Param("id")
	inst, ok := h.loadInstance(c, id)
	if !ok {
		return
	}

	if inst.ContainerID == nil {
		response.BadRequest(c, "no container is running for this instance")
		return
	}

	ctx := c.Request.Context()

	if err := h.docker.StopContainer(ctx, *inst.ContainerID, true); err != nil {
		response.InternalError(c, "failed to stop container: "+err.Error())
		return
	}

	h.db.Model(&inst).Updates(map[string]interface{}{
		"container_id":   nil,
		"container_name": nil,
		"status":         model.InstanceStatusOffline,
	})

	response.OK(c, nil)
}

// Restart handles POST /api/v1/instances/:id/container/restart
// Stops the existing container and starts a fresh one.
func (h *ContainerHandler) Restart(c *gin.Context) {
	if !h.dockerReady(c) {
		return
	}

	id := c.Param("id")
	inst, ok := h.loadInstance(c, id)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	// Stop existing if any
	if inst.ContainerID != nil {
		if err := h.docker.StopContainer(ctx, *inst.ContainerID, true); err != nil {
			response.InternalError(c, "failed to stop existing container: "+err.Error())
			return
		}
		h.db.Model(&inst).Updates(map[string]interface{}{
			"container_id":   nil,
			"container_name": nil,
		})
		inst.ContainerID = nil
		inst.ContainerName = nil
	}

	cfg := dockersvc.ParseContainerConfig(inst.DockerConfig)
	containerID, containerName, err := h.docker.StartContainer(ctx, inst.ID, inst.ImageName, cfg)
	if err != nil {
		response.InternalError(c, "failed to start container: "+err.Error())
		h.db.Model(&inst).Update("status", model.InstanceStatusError)
		return
	}

	now := time.Now()
	h.db.Model(&inst).Updates(map[string]interface{}{
		"container_id":      containerID,
		"container_name":    containerName,
		"status":            model.InstanceStatusOnline,
		"last_health_check": now,
	})

	info, _ := h.docker.InspectContainer(ctx, containerID)
	response.OK(c, gin.H{
		"containerId":   containerID,
		"containerName": containerName,
		"status":        model.InstanceStatusOnline,
		"info":          info,
	})
}

// Status handles GET /api/v1/instances/:id/container/status
// Returns live container status from Docker daemon.
func (h *ContainerHandler) Status(c *gin.Context) {
	if !h.dockerReady(c) {
		return
	}

	id := c.Param("id")
	inst, ok := h.loadInstance(c, id)
	if !ok {
		return
	}

	if inst.ContainerID == nil {
		response.OK(c, gin.H{"running": false, "status": "no container"})
		return
	}

	ctx := c.Request.Context()
	info, err := h.docker.InspectContainer(ctx, *inst.ContainerID)
	if err != nil {
		// Container may have been removed externally
		h.db.Model(&inst).Updates(map[string]interface{}{
			"container_id":   nil,
			"container_name": nil,
			"status":         model.InstanceStatusOffline,
		})
		response.OK(c, gin.H{"running": false, "status": "container not found"})
		return
	}

	running := info.State == "running"
	// Sync DB status if drifted
	targetStatus := model.InstanceStatusOffline
	if running {
		targetStatus = model.InstanceStatusOnline
	}
	if inst.Status != targetStatus {
		h.db.Model(&inst).Update("status", targetStatus)
	}

	response.OK(c, gin.H{"running": running, "info": info})
}

// Logs handles GET /api/v1/instances/:id/container/logs
// Query param: ?tail=100 (default 100, max 1000)
func (h *ContainerHandler) Logs(c *gin.Context) {
	if !h.dockerReady(c) {
		return
	}

	id := c.Param("id")
	inst, ok := h.loadInstance(c, id)
	if !ok {
		return
	}

	if inst.ContainerID == nil {
		response.BadRequest(c, "no container is running for this instance")
		return
	}

	tail := 100
	if t, err := strconv.Atoi(c.DefaultQuery("tail", "100")); err == nil && t > 0 && t <= 1000 {
		tail = t
	}

	ctx := c.Request.Context()
	logs, err := h.docker.Logs(ctx, *inst.ContainerID, tail)
	if err != nil {
		response.InternalError(c, "failed to fetch logs: "+err.Error())
		return
	}

	response.OK(c, gin.H{"logs": logs, "containerId": *inst.ContainerID})
}
