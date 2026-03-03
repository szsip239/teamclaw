package docker

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// FileEntry describes a file or directory inside a container.
type FileEntry struct {
	Name string `json:"name"`
	Path string `json:"path"` // relative to the queried directory
	Type string `json:"type"` // "file" | "directory"
	Size int64  `json:"size"`
}

// ExecWithOutput creates an exec instance in the container, starts it, and returns
// the combined stdout output after stripping Docker multiplexed stream framing.
func (m *Manager) ExecWithOutput(ctx context.Context, containerID string, cmd []string) (string, error) {
	type execCreateResp struct {
		Id string `json:"Id"`
	}
	created, err := doRequest[execCreateResp](ctx, m.client, http.MethodPost,
		"/containers/"+containerID+"/exec",
		map[string]any{"Cmd": cmd, "AttachStdout": true, "AttachStderr": true})
	if err != nil {
		return "", fmt.Errorf("docker: exec create in %s: %w", containerID, err)
	}
	if created.Id == "" {
		return "", fmt.Errorf("docker: empty exec ID for container %s", containerID)
	}

	startResp, err := doRaw(ctx, m.client, http.MethodPost,
		"/exec/"+created.Id+"/start",
		map[string]any{"Detach": false, "Tty": false})
	if err != nil {
		return "", fmt.Errorf("docker: exec start %s: %w", created.Id, err)
	}
	defer startResp.Body.Close()

	if startResp.StatusCode >= 300 {
		body, _ := io.ReadAll(startResp.Body)
		return "", fmt.Errorf("docker: exec start returned HTTP %d: %s", startResp.StatusCode, string(body))
	}

	return readMuxStream(startResp.Body)
}

// readMuxStream reads a Docker multiplexed stream and returns the payload as a string.
// Frame format: [stream_type(1B)] [reserved(3B)] [payload_length(4B big-endian)] [payload...]
func readMuxStream(r io.Reader) (string, error) {
	var sb strings.Builder
	header := make([]byte, 8)
	for {
		_, err := io.ReadFull(r, header)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			break
		}
		if err != nil {
			return sb.String(), fmt.Errorf("docker: read mux header: %w", err)
		}
		frameSize := binary.BigEndian.Uint32(header[4:8])
		if frameSize == 0 {
			continue
		}
		payload := make([]byte, frameSize)
		if _, rerr := io.ReadFull(r, payload); rerr != nil {
			sb.Write(payload)
			break
		}
		sb.Write(payload)
	}
	return sb.String(), nil
}

// ListContainerDir returns all files and directories recursively under dirPath.
// Paths in the returned entries are relative to dirPath.
func (m *Manager) ListContainerDir(ctx context.Context, containerID, dirPath string) ([]FileEntry, error) {
	out, err := m.ExecWithOutput(ctx, containerID, []string{
		"find", dirPath, "-mindepth", "1",
		"-printf", "%y\t%s\t%P\n",
	})
	if err != nil {
		return nil, fmt.Errorf("docker: list dir %s in %s: %w", dirPath, containerID, err)
	}

	out = strings.TrimSpace(out)
	if out == "" {
		return []FileEntry{}, nil
	}

	var entries []FileEntry
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		ftype, sizeStr, relPath := parts[0], parts[1], parts[2]
		if relPath == "" {
			continue
		}

		var size int64
		fmt.Sscanf(sizeStr, "%d", &size)

		entryType := "file"
		if ftype == "d" {
			entryType = "directory"
		}

		name := relPath
		if idx := strings.LastIndex(relPath, "/"); idx >= 0 {
			name = relPath[idx+1:]
		}

		entries = append(entries, FileEntry{
			Name: name,
			Path: relPath, // relative to dirPath
			Type: entryType,
			Size: size,
		})
	}
	if entries == nil {
		entries = []FileEntry{}
	}
	return entries, nil
}

// UploadFileToContainer packs content into a single-file tar and uploads it via
// PUT /containers/{id}/archive?path={targetDir}.
func (m *Manager) UploadFileToContainer(ctx context.Context, containerID, targetDir, fileName string, content []byte) error {
	tarData, err := buildSingleFileTar(fileName, content)
	if err != nil {
		return fmt.Errorf("docker: build tar for upload: %w", err)
	}

	url := "http://localhost/containers/" + containerID + "/archive?path=" + urlEncode(targetDir)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(tarData))
	if err != nil {
		return fmt.Errorf("docker: build upload request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-tar")

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("docker: upload file to container %s: %w", containerID, err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 300 {
		return fmt.Errorf("docker: upload returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// DownloadFileFromContainer downloads a single file from the container via
// GET /containers/{id}/archive?path={filePath} and returns its contents.
func (m *Manager) DownloadFileFromContainer(ctx context.Context, containerID, filePath string) ([]byte, error) {
	url := "http://localhost/containers/" + containerID + "/archive?path=" + urlEncode(filePath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("docker: build download request: %w", err)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker: download file from container %s: %w", containerID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("not found: %s", filePath)
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("docker: download returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	return extractFirstTarFile(resp.Body)
}

// RemoveContainerFile removes filePath (or directory tree) inside the container.
func (m *Manager) RemoveContainerFile(ctx context.Context, containerID, filePath string) error {
	_, err := m.ExecWithOutput(ctx, containerID, []string{"rm", "-rf", filePath})
	if err != nil {
		return fmt.Errorf("docker: remove %s in %s: %w", filePath, containerID, err)
	}
	return nil
}

// EnsureContainerDir creates dirPath (and all parents) inside the container.
func (m *Manager) EnsureContainerDir(ctx context.Context, containerID, dirPath string) error {
	_, err := m.ExecWithOutput(ctx, containerID, []string{"mkdir", "-p", dirPath})
	if err != nil {
		return fmt.Errorf("docker: mkdir -p %s in %s: %w", dirPath, containerID, err)
	}
	return nil
}

// MoveContainerPath moves src to dst inside the container using mv.
func (m *Manager) MoveContainerPath(ctx context.Context, containerID, src, dst string) error {
	_, err := m.ExecWithOutput(ctx, containerID, []string{"mv", src, dst})
	if err != nil {
		return fmt.Errorf("docker: mv %s -> %s in %s: %w", src, dst, containerID, err)
	}
	return nil
}

// DownloadDirAsArchive returns the raw tar ReadCloser for dirPath.
// The caller is responsible for closing the returned ReadCloser.
func (m *Manager) DownloadDirAsArchive(ctx context.Context, containerID, dirPath string) (io.ReadCloser, error) {
	url := "http://localhost/containers/" + containerID + "/archive?path=" + urlEncode(dirPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("docker: build archive request: %w", err)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker: download dir archive from %s: %w", containerID, err)
	}

	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()
		return nil, fmt.Errorf("not found: %s", dirPath)
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("docker: archive returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	return resp.Body, nil
}

// ReadContainerFile reads and returns the contents of filePath inside the container.
func (m *Manager) ReadContainerFile(ctx context.Context, containerID, filePath string) ([]byte, error) {
	return m.DownloadFileFromContainer(ctx, containerID, filePath)
}

// WriteContainerFile writes content as fileName into dirPath inside the container.
func (m *Manager) WriteContainerFile(ctx context.Context, containerID, dirPath, fileName string, content []byte) error {
	return m.UploadFileToContainer(ctx, containerID, dirPath, fileName, content)
}

// RestartContainer restarts the container, waiting up to 10s for graceful stop.
func (m *Manager) RestartContainer(ctx context.Context, containerID string) error {
	resp, err := doRaw(ctx, m.client, http.MethodPost,
		"/containers/"+containerID+"/restart?t=10", nil)
	if err != nil {
		return fmt.Errorf("docker: restart container %s: %w", containerID, err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("docker: restart returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// ── private helpers ──────────────────────────────────────────────────────────

// buildSingleFileTar creates an in-memory tar archive containing exactly one file.
func buildSingleFileTar(fileName string, content []byte) ([]byte, error) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	hdr := &tar.Header{
		Name:     fileName,
		Mode:     0644,
		Size:     int64(len(content)),
		ModTime:  time.Now(),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return nil, err
	}
	if _, err := tw.Write(content); err != nil {
		return nil, err
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// extractFirstTarFile reads a tar stream and returns the content of the first regular file.
func extractFirstTarFile(r io.Reader) ([]byte, error) {
	tr := tar.NewReader(r)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("docker: read tar entry: %w", err)
		}
		if hdr.Typeflag == tar.TypeReg || hdr.Typeflag == 0 {
			return io.ReadAll(tr)
		}
	}
	return nil, fmt.Errorf("docker: no regular file found in tar response")
}
