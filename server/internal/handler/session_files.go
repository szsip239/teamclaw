package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	dockersvc "github.com/szsip239/teamclaw/server/internal/service/docker"
)

const sessionFileMaxSize = 50 * 1024 * 1024 // 50MB

// SessionFilesHandler handles session file management endpoints.
type SessionFilesHandler struct {
	db     *gorm.DB
	docker *dockersvc.Manager
}

// NewSessionFilesHandler creates a SessionFilesHandler.
// If Docker is unavailable, the docker field is nil and endpoints return 503.
func NewSessionFilesHandler(db *gorm.DB) *SessionFilesHandler {
	mgr, _ := dockersvc.New() // nil on error; handled per-request
	return &SessionFilesHandler{db: db, docker: mgr}
}

// ── Path helpers ──────────────────────────────────────────────────────────────

func sessionInputPath(agentID, sessionID string) string {
	return fmt.Sprintf("/home/node/.openclaw/workspace/tc-sessions/%s/%s/input", agentID, sessionID)
}

func sessionOutputPath(agentID, sessionID string) string {
	return fmt.Sprintf("/home/node/.openclaw/workspace/tc-sessions/%s/%s/output", agentID, sessionID)
}

func resolveSessionPath(agentID, sessionID, zone string, rel ...string) string {
	var base string
	if zone == "output" {
		base = sessionOutputPath(agentID, sessionID)
	} else {
		base = sessionInputPath(agentID, sessionID)
	}
	if len(rel) > 0 && rel[0] != "" {
		return base + "/" + strings.TrimPrefix(rel[0], "/")
	}
	return base
}

func isPathSafe(p string) bool {
	return p == "" || (!strings.Contains(p, "..") && !strings.Contains(p, "\x00") && !strings.HasPrefix(p, "/"))
}

// ── Session/Instance lookup helpers ──────────────────────────────────────────

type sfContext struct {
	session     model.ChatSession
	containerID string
}

func (h *SessionFilesHandler) resolve(c *gin.Context) (*sfContext, bool) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var session model.ChatSession
	if err := h.db.First(&session, "id = ?", id).Error; err != nil {
		response.NotFound(c, "session not found")
		return nil, false
	}
	if session.UserID != userID {
		response.Forbidden(c, "no access to this session")
		return nil, false
	}

	var inst model.Instance
	if err := h.db.Select("id, container_id").First(&inst, "id = ?", session.InstanceID).Error; err != nil {
		response.NotFound(c, "instance not found")
		return nil, false
	}
	if inst.ContainerID == nil {
		response.BadRequest(c, "instance has no container")
		return nil, false
	}
	if h.docker == nil {
		response.ServiceUnavailable(c, "Docker is not available")
		return nil, false
	}

	return &sfContext{session: session, containerID: *inst.ContainerID}, true
}

// ── List ──────────────────────────────────────────────────────────────────────

// List handles GET /api/v1/chat/sessions/:id/files?zone=input|output&dir=
func (h *SessionFilesHandler) List(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	zone := c.DefaultQuery("zone", "input")
	if zone != "input" && zone != "output" {
		response.BadRequest(c, "invalid zone parameter")
		return
	}
	dir := c.Query("dir")
	if !isPathSafe(dir) {
		response.BadRequest(c, "invalid directory path")
		return
	}

	dirPath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, zone, dir)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	entries, err := h.docker.ListContainerDir(reqCtx, ctx.containerID, dirPath)
	if err != nil {
		// Directory doesn't exist yet — return empty
		c.JSON(http.StatusOK, gin.H{"files": []any{}, "zone": zone, "dir": dir})
		return
	}

	c.JSON(http.StatusOK, gin.H{"files": entries, "zone": zone, "dir": dir})
}

// ── Upload ────────────────────────────────────────────────────────────────────

// Upload handles POST /api/v1/chat/sessions/:id/files/upload
func (h *SessionFilesHandler) Upload(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	if err := c.Request.ParseMultipartForm(sessionFileMaxSize + 1024); err != nil {
		response.BadRequest(c, "failed to parse multipart form: "+err.Error())
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.BadRequest(c, "missing file field")
		return
	}
	defer file.Close()

	if header.Size > sessionFileMaxSize {
		response.BadRequest(c, "file size exceeds 50MB limit")
		return
	}

	fileName := header.Filename
	if fileName == "" || strings.Contains(fileName, "..") || strings.Contains(fileName, "/") || strings.Contains(fileName, "\x00") {
		response.BadRequest(c, "invalid filename")
		return
	}

	dir := c.Request.FormValue("dir")
	if !isPathSafe(dir) {
		response.BadRequest(c, "invalid directory path")
		return
	}

	targetDir := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, "input", dir)

	content := make([]byte, header.Size)
	if _, err := file.Read(content); err != nil {
		response.InternalError(c, "failed to read file: "+err.Error())
		return
	}

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	if err := h.docker.EnsureContainerDir(reqCtx, ctx.containerID, targetDir); err != nil {
		response.InternalError(c, "failed to create target directory: "+err.Error())
		return
	}

	if err := h.docker.UploadFileToContainer(reqCtx, ctx.containerID, targetDir, fileName, content); err != nil {
		response.InternalError(c, "upload failed: "+err.Error())
		return
	}

	filePath := fileName
	if dir != "" {
		filePath = dir + "/" + fileName
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"file": gin.H{
			"name": fileName,
			"path": filePath,
			"type": "file",
			"size": header.Size,
		},
	})
}

// ── Download ──────────────────────────────────────────────────────────────────

// Download handles GET /api/v1/chat/sessions/:id/files/:zone/*path
func (h *SessionFilesHandler) Download(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	zone := c.Param("zone")
	if zone != "input" && zone != "output" {
		response.BadRequest(c, "invalid zone")
		return
	}

	rawPath := c.Param("path") // starts with /
	relativePath := strings.TrimPrefix(rawPath, "/")
	if relativePath == "" {
		response.BadRequest(c, "missing file path")
		return
	}
	if strings.Contains(relativePath, "..") || strings.Contains(relativePath, "\x00") {
		response.BadRequest(c, "invalid file path")
		return
	}

	filePath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, zone, relativePath)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	data, err := h.docker.DownloadFileFromContainer(reqCtx, ctx.containerID, filePath)
	if err != nil {
		response.NotFound(c, "file not found")
		return
	}

	fileName := relativePath
	if idx := strings.LastIndex(relativePath, "/"); idx >= 0 {
		fileName = relativePath[idx+1:]
	}

	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, fileName))
	c.Header("Content-Length", fmt.Sprintf("%d", len(data)))
	c.Data(http.StatusOK, "application/octet-stream", data)
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Delete handles DELETE /api/v1/chat/sessions/:id/files/input/*path
func (h *SessionFilesHandler) Delete(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	rawPath := c.Param("path")
	relativePath := strings.TrimPrefix(rawPath, "/")
	if relativePath == "" {
		response.BadRequest(c, "missing file path")
		return
	}
	if strings.Contains(relativePath, "..") || strings.Contains(relativePath, "\x00") {
		response.BadRequest(c, "invalid file path")
		return
	}

	filePath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, "input", relativePath)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if err := h.docker.RemoveContainerFile(reqCtx, ctx.containerID, filePath); err != nil {
		response.NotFound(c, "file not found")
		return
	}

	c.Status(http.StatusNoContent)
}

// ── Mkdir ─────────────────────────────────────────────────────────────────────

// Mkdir handles POST /api/v1/chat/sessions/:id/files/mkdir
func (h *SessionFilesHandler) Mkdir(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	var req struct {
		Dir string `json:"dir" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}
	if !isPathSafe(req.Dir) {
		response.BadRequest(c, "invalid directory path")
		return
	}

	dirPath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, "input", req.Dir)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if err := h.docker.EnsureContainerDir(reqCtx, ctx.containerID, dirPath); err != nil {
		response.InternalError(c, "failed to create directory: "+err.Error())
		return
	}

	response.OK(c, gin.H{"ok": true})
}

// ── Move ──────────────────────────────────────────────────────────────────────

// Move handles POST /api/v1/chat/sessions/:id/files/move
func (h *SessionFilesHandler) Move(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	var req struct {
		Source string `json:"source" binding:"required"`
		Target string `json:"target" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}
	if !isPathSafe(req.Source) || !isPathSafe(req.Target) {
		response.BadRequest(c, "invalid path")
		return
	}

	srcPath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, "input", req.Source)
	dstPath := resolveSessionPath(ctx.session.AgentID, ctx.session.ID, "input", req.Target)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if err := h.docker.MoveContainerPath(reqCtx, ctx.containerID, srcPath, dstPath); err != nil {
		response.BadRequest(c, "failed to move file: "+err.Error())
		return
	}

	response.OK(c, gin.H{"ok": true})
}

// ── DownloadAll ───────────────────────────────────────────────────────────────

// DownloadAll handles GET /api/v1/chat/sessions/:id/files/download-all
// Returns the output/ directory as a tar archive.
func (h *SessionFilesHandler) DownloadAll(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	outputDir := sessionOutputPath(ctx.session.AgentID, ctx.session.ID)

	reqCtx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	archive, err := h.docker.DownloadDirAsArchive(reqCtx, ctx.containerID, outputDir)
	if err != nil {
		// Output dir doesn't exist yet
		c.Status(http.StatusNoContent)
		return
	}
	defer archive.Close()

	c.Header("Content-Type", "application/x-tar")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="session-%s-output.tar"`, ctx.session.ID[:8]))
	c.Status(http.StatusOK)

	// Stream tar directly to client
	buf := make([]byte, 32*1024)
	for {
		n, readErr := archive.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return
			}
		}
		if readErr != nil {
			break
		}
	}
	c.Writer.Flush()
}

// ── Watch (SSE) ───────────────────────────────────────────────────────────────

// Watch handles GET /api/v1/chat/sessions/:id/files/watch
// SSE stream that emits "files-changed" events when the session directories are modified.
func (h *SessionFilesHandler) Watch(c *gin.Context) {
	ctx, ok := h.resolve(c)
	if !ok {
		return
	}

	inputDir := sessionInputPath(ctx.session.AgentID, ctx.session.ID)
	outputDir := sessionOutputPath(ctx.session.AgentID, ctx.session.ID)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		return
	}

	sendEvent := func(eventType string, data any) {
		b, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		flusher.Flush()
	}

	sendEvent("connected", map[string]string{"type": "connected"})

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	reqCtx := c.Request.Context()
	var lastMtime string

	for {
		select {
		case <-reqCtx.Done():
			return
		case <-ticker.C:
			execCtx, cancel := context.WithTimeout(reqCtx, 4*time.Second)
			mtime, err := h.docker.ExecWithOutput(execCtx, ctx.containerID, []string{
				"stat", "-c", "%Y", inputDir, outputDir,
			})
			cancel()

			if err != nil {
				// Container stopped or exec failed — close the stream
				return
			}

			mtime = strings.TrimSpace(mtime)
			if mtime != lastMtime {
				lastMtime = mtime
				sendEvent("files-changed", map[string]string{"type": "files-changed"})
			}
		}
	}
}
