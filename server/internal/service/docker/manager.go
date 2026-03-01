package docker

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const dockerSock = "/var/run/docker.sock"

// ContainerConfig is the optional per-instance Docker run configuration
// stored as JSONB in Instance.DockerConfig.
type ContainerConfig struct {
	Env           []string          `json:"env"`
	Ports         map[string]string `json:"ports"`         // "8080/tcp": "18080"
	Volumes       []string          `json:"volumes"`       // "/host:/container"
	NetworkMode   string            `json:"networkMode"`   // "bridge" | "host" | ...
	MemoryMB      int64             `json:"memoryMb"`      // 0 = unlimited
	CPUShares     int64             `json:"cpuShares"`     // 0 = default
	RestartPolicy string            `json:"restartPolicy"` // "no" | "always" | "on-failure"
	Labels        map[string]string `json:"labels"`
	ExtraHosts    []string          `json:"extraHosts"` // ["hostname:ip"]
}

// ContainerInfo describes a running/stopped container.
type ContainerInfo struct {
	ContainerID   string    `json:"containerId"`
	ContainerName string    `json:"containerName"`
	Image         string    `json:"image"`
	Status        string    `json:"status"`
	State         string    `json:"state"`
	StartedAt     time.Time `json:"startedAt"`
	Ports         []Port    `json:"ports"`
}

// Port describes a port binding.
type Port struct {
	PrivatePort uint16 `json:"privatePort"`
	PublicPort  uint16 `json:"publicPort"`
	Type        string `json:"type"`
}

// Manager wraps Docker daemon REST API operations via Unix socket.
type Manager struct {
	client *http.Client
}

// New creates a Manager using the local Docker socket.
func New() (*Manager, error) {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", dockerSock)
		},
	}
	c := &http.Client{Transport: transport}

	// Quick availability check
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := doRequest[map[string]any](ctx, c, http.MethodGet, "/_ping", nil); err != nil {
		return nil, fmt.Errorf("docker: socket unavailable: %w", err)
	}
	return &Manager{client: c}, nil
}

// IsAvailable returns true if the Docker daemon is reachable.
func (m *Manager) IsAvailable(ctx context.Context) bool {
	_, err := doRequest[map[string]any](ctx, m.client, http.MethodGet, "/_ping", nil)
	return err == nil
}

// PullImage pulls the given image if it is not already present locally.
func (m *Manager) PullImage(ctx context.Context, imageName string, _ io.Writer) error {
	// Check local first
	_, err := doRequest[map[string]any](ctx, m.client, http.MethodGet, "/images/"+urlEncode(imageName)+"/json", nil)
	if err == nil {
		return nil // already present
	}

	// POST /images/create?fromImage=<name>
	resp, err := doRaw(ctx, m.client, http.MethodPost, "/images/create?fromImage="+urlEncode(imageName), nil)
	if err != nil {
		return fmt.Errorf("docker: pull %s: %w", imageName, err)
	}
	defer resp.Body.Close()
	// Drain pull progress stream
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("docker: pull %s returned HTTP %d", imageName, resp.StatusCode)
	}
	return nil
}

// StartContainer creates and starts a container. Returns containerID and containerName.
func (m *Manager) StartContainer(
	ctx context.Context,
	instanceID, imageName string,
	cfg *ContainerConfig,
) (containerID, containerName string, err error) {

	cName := "tc-instance-" + instanceID[:12]

	labels := map[string]string{
		"teamclaw.instance_id": instanceID,
		"teamclaw.managed":     "true",
	}
	if cfg != nil {
		for k, v := range cfg.Labels {
			labels[k] = v
		}
	}

	// Build ExposedPorts and PortBindings
	exposedPorts := map[string]struct{}{}
	portBindings := map[string][]map[string]string{}
	if cfg != nil {
		for priv, pub := range cfg.Ports {
			exposedPorts[priv] = struct{}{}
			portBindings[priv] = []map[string]string{{"HostPort": pub}}
		}
	}

	// Env
	var envVars []string
	if cfg != nil {
		envVars = cfg.Env
	}

	// Restart policy
	restartPolicyName := "no"
	if cfg != nil && cfg.RestartPolicy != "" {
		restartPolicyName = cfg.RestartPolicy
	}

	// Memory
	var memBytes int64
	var cpuShares int64
	if cfg != nil {
		memBytes = cfg.MemoryMB * 1024 * 1024
		cpuShares = cfg.CPUShares
	}

	// Network mode
	networkMode := "bridge"
	if cfg != nil && cfg.NetworkMode != "" {
		networkMode = cfg.NetworkMode
	}

	// Extra hosts
	var extraHosts []string
	if cfg != nil {
		extraHosts = cfg.ExtraHosts
	}

	// Binds (volumes)
	var binds []string
	if cfg != nil {
		binds = cfg.Volumes
	}

	createBody := map[string]any{
		"Image":        imageName,
		"Env":          envVars,
		"Labels":       labels,
		"ExposedPorts": exposedPorts,
		"HostConfig": map[string]any{
			"PortBindings":  portBindings,
			"NetworkMode":   networkMode,
			"Binds":         binds,
			"ExtraHosts":    extraHosts,
			"Memory":        memBytes,
			"CpuShares":     cpuShares,
			"RestartPolicy": map[string]any{"Name": restartPolicyName},
		},
	}

	created, err := doRequest[map[string]any](ctx, m.client, http.MethodPost,
		"/containers/create?name="+urlEncode(cName), createBody)
	if err != nil {
		return "", "", fmt.Errorf("docker: create container: %w", err)
	}

	id, _ := created["Id"].(string)
	if id == "" {
		return "", "", fmt.Errorf("docker: empty container ID in response")
	}

	// Start
	resp, err := doRaw(ctx, m.client, http.MethodPost, "/containers/"+id+"/start", nil)
	if err != nil {
		// Clean up on failure
		_, _ = doRaw(ctx, m.client, http.MethodDelete, "/containers/"+id+"?force=true", nil)
		return "", "", fmt.Errorf("docker: start container: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode != 304 {
		_, _ = doRaw(ctx, m.client, http.MethodDelete, "/containers/"+id+"?force=true", nil)
		return "", "", fmt.Errorf("docker: start returned HTTP %d", resp.StatusCode)
	}

	return id, cName, nil
}

// StopContainer gracefully stops a container then optionally removes it.
func (m *Manager) StopContainer(ctx context.Context, containerID string, remove bool) error {
	resp, err := doRaw(ctx, m.client, http.MethodPost,
		"/containers/"+containerID+"/stop?t=10", nil)
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("docker: stop container: %w", err)
	}
	if resp != nil {
		resp.Body.Close()
	}

	if remove {
		resp2, err2 := doRaw(ctx, m.client, http.MethodDelete,
			"/containers/"+containerID+"?v=false&force=false", nil)
		if err2 != nil && !isNotFound(err2) {
			return fmt.Errorf("docker: remove container: %w", err2)
		}
		if resp2 != nil {
			resp2.Body.Close()
		}
	}
	return nil
}

// dockerInspectResponse mirrors the fields we need from Docker's /containers/{id}/json
type dockerInspectResponse struct {
	ID     string `json:"Id"`
	Name   string `json:"Name"`
	Config struct {
		Image  string            `json:"Image"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
	State struct {
		Status    string `json:"Status"`
		StartedAt string `json:"StartedAt"`
	} `json:"State"`
	HostConfig struct {
		PortBindings map[string][]struct {
			HostPort string `json:"HostPort"`
		} `json:"PortBindings"`
	} `json:"HostConfig"`
}

// InspectContainer returns status info for the given container.
func (m *Manager) InspectContainer(ctx context.Context, containerID string) (*ContainerInfo, error) {
	data, err := doRequest[dockerInspectResponse](ctx, m.client, http.MethodGet,
		"/containers/"+containerID+"/json", nil)
	if err != nil {
		return nil, fmt.Errorf("docker: inspect: %w", err)
	}

	startedAt, _ := time.Parse(time.RFC3339Nano, data.State.StartedAt)
	info := &ContainerInfo{
		ContainerID:   data.ID,
		ContainerName: strings.TrimPrefix(data.Name, "/"),
		Image:         data.Config.Image,
		Status:        data.State.Status,
		State:         data.State.Status,
		StartedAt:     startedAt,
		Ports:         []Port{},
	}
	for portSpec, bindings := range data.HostConfig.PortBindings {
		// portSpec example: "8080/tcp"
		parts := strings.SplitN(portSpec, "/", 2)
		proto := "tcp"
		if len(parts) == 2 {
			proto = parts[1]
		}
		var privPort uint16
		fmt.Sscanf(parts[0], "%d", &privPort)
		for _, b := range bindings {
			var pub uint16
			fmt.Sscanf(b.HostPort, "%d", &pub)
			info.Ports = append(info.Ports, Port{
				PrivatePort: privPort,
				PublicPort:  pub,
				Type:        proto,
			})
		}
	}
	return info, nil
}

// Logs returns the last `tail` lines of container stdout+stderr.
func (m *Manager) Logs(ctx context.Context, containerID string, tail int) (string, error) {
	tailStr := "all"
	if tail > 0 {
		tailStr = fmt.Sprintf("%d", tail)
	}
	path := fmt.Sprintf("/containers/%s/logs?stdout=true&stderr=true&timestamps=true&tail=%s",
		containerID, tailStr)

	resp, err := doRaw(ctx, m.client, http.MethodGet, path, nil)
	if err != nil {
		return "", fmt.Errorf("docker: logs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("docker: logs returned HTTP %d", resp.StatusCode)
	}

	// Strip Docker multiplexed stream headers (8 bytes per frame)
	var sb strings.Builder
	buf := make([]byte, 4096)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			data := buf[:n]
			i := 0
			for i < len(data) {
				if i+8 > len(data) {
					sb.Write(data[i:])
					break
				}
				frameSize := int(data[i+4])<<24 | int(data[i+5])<<16 | int(data[i+6])<<8 | int(data[i+7])
				i += 8
				end := i + frameSize
				if end > len(data) {
					end = len(data)
				}
				sb.Write(data[i:end])
				i = end
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			break
		}
	}
	return sb.String(), nil
}

// dockerListItem mirrors a single entry from GET /containers/json
type dockerListItem struct {
	ID     string   `json:"Id"`
	Names  []string `json:"Names"`
	Image  string   `json:"Image"`
	Status string   `json:"Status"`
	State  string   `json:"State"`
	Ports  []struct {
		PrivatePort uint16 `json:"PrivatePort"`
		PublicPort  uint16 `json:"PublicPort"`
		Type        string `json:"Type"`
	} `json:"Ports"`
}

// ListManagedContainers returns all containers managed by TeamClaw.
func (m *Manager) ListManagedContainers(ctx context.Context) ([]ContainerInfo, error) {
	// Use label filter: teamclaw.managed=true
	filterJSON := `{"label":["teamclaw.managed=true"]}`
	path := "/containers/json?all=true&filters=" + urlEncode(filterJSON)

	items, err := doRequest[[]dockerListItem](ctx, m.client, http.MethodGet, path, nil)
	if err != nil {
		return nil, fmt.Errorf("docker: list: %w", err)
	}

	infos := make([]ContainerInfo, 0, len(items))
	for _, c := range items {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		ports := make([]Port, 0, len(c.Ports))
		for _, p := range c.Ports {
			ports = append(ports, Port{
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
		}
		infos = append(infos, ContainerInfo{
			ContainerID:   c.ID,
			ContainerName: name,
			Image:         c.Image,
			Status:        c.Status,
			State:         c.State,
			Ports:         ports,
		})
	}
	return infos, nil
}

// ParseContainerConfig decodes an optional JSONB string from the DB.
func ParseContainerConfig(raw *string) *ContainerConfig {
	if raw == nil || *raw == "" {
		return nil
	}
	var cfg ContainerConfig
	if err := json.Unmarshal([]byte(*raw), &cfg); err != nil {
		return nil
	}
	return &cfg
}

// ── internal helpers ─────────────────────────────────────────────────────────

// doRequest sends an HTTP request to the Docker socket and decodes the JSON response into T.
func doRequest[T any](ctx context.Context, c *http.Client, method, path string, body any) (T, error) {
	var zero T
	resp, err := doRaw(ctx, c, method, path, body)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		// Parse Docker error message if possible
		var dockerErr struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(b, &dockerErr)
		if dockerErr.Message != "" {
			if isNotFoundMsg(dockerErr.Message) {
				return zero, fmt.Errorf("not found: %s", dockerErr.Message)
			}
			return zero, fmt.Errorf("docker API error (HTTP %d): %s", resp.StatusCode, dockerErr.Message)
		}
		return zero, fmt.Errorf("docker API error: HTTP %d: %s", resp.StatusCode, string(b))
	}

	if resp.ContentLength == 0 || resp.StatusCode == http.StatusNoContent {
		return zero, nil
	}

	var result T
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil && err != io.EOF {
		return zero, fmt.Errorf("docker: decode response: %w", err)
	}
	return result, nil
}

// doRaw sends a raw HTTP request to the Docker socket.
func doRaw(ctx context.Context, c *http.Client, method, path string, body any) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("docker: marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	// Docker socket requests use http://localhost as the host (ignored by transport)
	req, err := http.NewRequestWithContext(ctx, method, "http://localhost"+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("docker: build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker: request %s %s: %w", method, path, err)
	}
	return resp, nil
}

// urlEncode percent-encodes a string for use in URL query parameters.
func urlEncode(s string) string {
	var buf strings.Builder
	scanner := bufio.NewScanner(strings.NewReader(s))
	scanner.Split(bufio.ScanBytes)
	for scanner.Scan() {
		b := scanner.Bytes()[0]
		if isUnreserved(b) {
			buf.WriteByte(b)
		} else {
			fmt.Fprintf(&buf, "%%%02X", b)
		}
	}
	return buf.String()
}

func isUnreserved(b byte) bool {
	return (b >= 'A' && b <= 'Z') ||
		(b >= 'a' && b <= 'z') ||
		(b >= '0' && b <= '9') ||
		b == '-' || b == '_' || b == '.' || b == '~'
}

// isNotFound checks for Docker "not found" style error messages.
func isNotFound(err error) bool {
	return err != nil && isNotFoundMsg(err.Error())
}

func isNotFoundMsg(msg string) bool {
	return strings.Contains(msg, "No such container") ||
		strings.Contains(msg, "not found")
}
