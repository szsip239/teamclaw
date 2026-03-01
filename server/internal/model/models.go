package model

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// DefaultImageName is the default OpenClaw container image.
const DefaultImageName = "alpine/openclaw:latest"

// ─── Enums ─────────────────────────────────────────────

// Role represents user roles.
type Role string

const (
	RoleSystemAdmin Role = "SYSTEM_ADMIN"
	RoleDeptAdmin   Role = "DEPT_ADMIN"
	RoleUser        Role = "USER"
)

// UserStatus represents user account status.
type UserStatus string

const (
	UserStatusActive   UserStatus = "ACTIVE"
	UserStatusDisabled UserStatus = "DISABLED"
	UserStatusPending  UserStatus = "PENDING"
)

// InstanceStatus represents the runtime status of an OpenClaw instance.
type InstanceStatus string

const (
	InstanceStatusOnline   InstanceStatus = "ONLINE"
	InstanceStatusOffline  InstanceStatus = "OFFLINE"
	InstanceStatusDegraded InstanceStatus = "DEGRADED"
	InstanceStatusError    InstanceStatus = "ERROR"
)

// AgentCategory controls agent visibility scope.
type AgentCategory string

const (
	AgentCategoryDefault    AgentCategory = "DEFAULT"
	AgentCategoryDepartment AgentCategory = "DEPARTMENT"
	AgentCategoryPersonal   AgentCategory = "PERSONAL"
)

// SkillCategory controls skill visibility scope.
type SkillCategory string

const (
	SkillCategoryDefault    SkillCategory = "DEFAULT"
	SkillCategoryDepartment SkillCategory = "DEPARTMENT"
	SkillCategoryPersonal   SkillCategory = "PERSONAL"
)

// SkillSource indicates how a skill was obtained.
type SkillSource string

const (
	SkillSourceLocal   SkillSource = "LOCAL"
	SkillSourceClawHub SkillSource = "CLAWHUB"
)

// ResourceType categorizes resources.
type ResourceType string

const (
	ResourceTypeModel ResourceType = "MODEL"
	ResourceTypeTool  ResourceType = "TOOL"
)

// ResourceStatus indicates resource test state.
type ResourceStatus string

const (
	ResourceStatusActive   ResourceStatus = "ACTIVE"
	ResourceStatusUntested ResourceStatus = "UNTESTED"
	ResourceStatusError    ResourceStatus = "ERROR"
)

// ─── Base Model ────────────────────────────────────────

// BaseModel provides common fields with CUID-style IDs.
type BaseModel struct {
	ID        string         `gorm:"primaryKey;size:30" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ─── User ──────────────────────────────────────────────

type User struct {
	BaseModel
	Email        string      `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Name         string      `gorm:"size:100;not null" json:"name"`
	PasswordHash string      `gorm:"size:255;not null" json:"-"`
	Avatar       *string     `gorm:"size:500" json:"avatar"`
	Role         Role        `gorm:"size:20;default:USER;not null" json:"role"`
	DepartmentID *string     `gorm:"size:30" json:"departmentId"`
	Department   *Department `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
	Status       UserStatus  `gorm:"size:20;default:ACTIVE;not null" json:"status"`
	LastLoginAt  *time.Time  `json:"lastLoginAt"`
}

func (User) TableName() string { return "users" }

// UserResponse is the safe representation of a user (no password hash).
type UserResponse struct {
	ID             string     `json:"id"`
	Email          string     `json:"email"`
	Name           string     `json:"name"`
	Avatar         *string    `json:"avatar"`
	Role           Role       `json:"role"`
	DepartmentID   *string    `json:"departmentId"`
	DepartmentName *string    `json:"departmentName"`
	Status         UserStatus `json:"status"`
	LastLoginAt    *time.Time `json:"lastLoginAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// ToResponse converts User to UserResponse.
func (u *User) ToResponse() UserResponse {
	resp := UserResponse{
		ID:           u.ID,
		Email:        u.Email,
		Name:         u.Name,
		Avatar:       u.Avatar,
		Role:         u.Role,
		DepartmentID: u.DepartmentID,
		Status:       u.Status,
		LastLoginAt:  u.LastLoginAt,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}
	if u.Department != nil {
		resp.DepartmentName = &u.Department.Name
	}
	return resp
}

// ─── Department ────────────────────────────────────────

type Department struct {
	BaseModel
	Name        string  `gorm:"uniqueIndex;size:100;not null" json:"name"`
	Description *string `gorm:"size:500" json:"description"`
	Users       []User  `gorm:"foreignKey:DepartmentID" json:"users,omitempty"`
}

func (Department) TableName() string { return "departments" }

// DepartmentResponse is the API representation of a department.
type DepartmentResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	MemberCount int64   `json:"memberCount"`
}

// ToResponse converts Department to DepartmentResponse.
func (d *Department) ToResponse(memberCount int64) DepartmentResponse {
	return DepartmentResponse{
		ID:          d.ID,
		Name:        d.Name,
		Description: d.Description,
		MemberCount: memberCount,
	}
}

// ─── RefreshToken ──────────────────────────────────────

type RefreshToken struct {
	BaseModel
	UserID            string    `gorm:"index;size:30;not null" json:"userId"`
	User              User      `gorm:"foreignKey:UserID" json:"-"`
	TokenHash         string    `gorm:"uniqueIndex;size:255;not null" json:"-"`
	DeviceFingerprint *string   `gorm:"size:255" json:"-"`
	ExpiresAt         time.Time `json:"expiresAt"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

// ─── AuditLog ──────────────────────────────────────────

type AuditLog struct {
	ID         string    `gorm:"primaryKey;size:30" json:"id"`
	UserID     string    `gorm:"index;size:30;not null" json:"userId"`
	User       User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Action     string    `gorm:"index;size:50;not null" json:"action"`
	Resource   string    `gorm:"size:50;not null" json:"resource"`
	ResourceID *string   `gorm:"size:30" json:"resourceId"`
	Details    *string   `gorm:"type:jsonb" json:"details"`
	IPAddress  string    `gorm:"size:50;not null" json:"ipAddress"`
	UserAgent  *string   `gorm:"size:500" json:"userAgent"`
	Result     string    `gorm:"size:20;not null" json:"result"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
}

func (AuditLog) TableName() string { return "audit_logs" }

// ─── Instance ──────────────────────────────────────────

type Instance struct {
	BaseModel
	Name            string         `gorm:"uniqueIndex;size:100;not null" json:"name"`
	Description     *string        `gorm:"size:500" json:"description"`
	GatewayURL      string         `gorm:"size:500;not null" json:"gatewayUrl"`
	GatewayToken    string         `gorm:"size:2000;not null" json:"-"` // AES encrypted
	ContainerID     *string        `gorm:"size:100" json:"containerId"`
	ContainerName   *string        `gorm:"size:100" json:"containerName"`
	ImageName       string         `gorm:"size:200;default:alpine/openclaw:latest" json:"imageName"`
	DockerConfig    *string        `gorm:"type:jsonb" json:"dockerConfig"`
	Status          InstanceStatus `gorm:"index;size:20;default:OFFLINE;not null" json:"status"`
	LastHealthCheck *time.Time     `json:"lastHealthCheck"`
	HealthData      *string        `gorm:"type:jsonb" json:"healthData"`
	Version         *string        `gorm:"size:50" json:"version"`
	CreatedByID     string         `gorm:"index;size:30;not null" json:"createdById"`
	CreatedBy       User           `gorm:"foreignKey:CreatedByID" json:"createdBy,omitempty"`
}

func (Instance) TableName() string { return "instances" }

// InstanceResponse is the API representation of an instance (GatewayToken excluded).
type InstanceResponse struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Description     *string        `json:"description"`
	GatewayURL      string         `json:"gatewayUrl"`
	ContainerID     *string        `json:"containerId"`
	ContainerName   *string        `json:"containerName"`
	ImageName       string         `json:"imageName"`
	DockerConfig    *string        `json:"dockerConfig"`
	Status          InstanceStatus `json:"status"`
	LastHealthCheck *time.Time     `json:"lastHealthCheck"`
	HealthData      *string        `json:"healthData"`
	Version         *string        `json:"version"`
	CreatedByID     string         `json:"createdById"`
	CreatedByName   string         `json:"createdByName"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

// ToResponse converts Instance to InstanceResponse. Preload("CreatedBy") before calling.
func (i *Instance) ToResponse() InstanceResponse {
	resp := InstanceResponse{
		ID:              i.ID,
		Name:            i.Name,
		Description:     i.Description,
		GatewayURL:      i.GatewayURL,
		ContainerID:     i.ContainerID,
		ContainerName:   i.ContainerName,
		ImageName:       i.ImageName,
		DockerConfig:    i.DockerConfig,
		Status:          i.Status,
		LastHealthCheck: i.LastHealthCheck,
		HealthData:      i.HealthData,
		Version:         i.Version,
		CreatedByID:     i.CreatedByID,
		CreatedAt:       i.CreatedAt,
		UpdatedAt:       i.UpdatedAt,
	}
	if i.CreatedBy.ID != "" {
		resp.CreatedByName = i.CreatedBy.Name
	}
	return resp
}

// ─── InstanceAccess ────────────────────────────────────

type InstanceAccess struct {
	BaseModel
	DepartmentID string     `gorm:"index;size:30;not null" json:"departmentId"`
	Department   Department `gorm:"foreignKey:DepartmentID;constraint:OnDelete:CASCADE" json:"department,omitempty"`
	InstanceID   string     `gorm:"index;size:30;not null" json:"instanceId"`
	Instance     Instance   `gorm:"foreignKey:InstanceID;constraint:OnDelete:CASCADE" json:"instance,omitempty"`
	AgentIDs     *string    `gorm:"type:jsonb" json:"agentIds"` // string[] | null
	GrantedByID  string     `gorm:"size:30;not null" json:"grantedById"`
	GrantedBy    User       `gorm:"foreignKey:GrantedByID" json:"grantedBy,omitempty"`
}

func (InstanceAccess) TableName() string { return "instance_accesses" }

// InstanceAccessResponse is the API representation of an InstanceAccess record.
type InstanceAccessResponse struct {
	ID             string    `json:"id"`
	DepartmentID   string    `json:"departmentId"`
	DepartmentName string    `json:"departmentName"`
	InstanceID     string    `json:"instanceId"`
	AgentIDs       []string  `json:"agentIds"`
	GrantedByID    string    `json:"grantedById"`
	GrantedByName  string    `json:"grantedByName"`
	CreatedAt      time.Time `json:"createdAt"`
}

// ToResponse converts InstanceAccess to InstanceAccessResponse.
// Preload("Department") and Preload("GrantedBy") before calling.
func (a *InstanceAccess) ToResponse() InstanceAccessResponse {
	resp := InstanceAccessResponse{
		ID:           a.ID,
		DepartmentID: a.DepartmentID,
		InstanceID:   a.InstanceID,
		AgentIDs:     []string{},
		GrantedByID:  a.GrantedByID,
		CreatedAt:    a.CreatedAt,
	}
	if a.Department.ID != "" {
		resp.DepartmentName = a.Department.Name
	}
	if a.GrantedBy.ID != "" {
		resp.GrantedByName = a.GrantedBy.Name
	}
	if a.AgentIDs != nil && *a.AgentIDs != "" {
		_ = json.Unmarshal([]byte(*a.AgentIDs), &resp.AgentIDs)
	}
	return resp
}

// ─── ChatSession ───────────────────────────────────────

type ChatSession struct {
	BaseModel
	UserID        string     `gorm:"index;size:30;not null" json:"userId"`
	User          User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	InstanceID    string     `gorm:"size:30;not null" json:"instanceId"`
	Instance      Instance   `gorm:"foreignKey:InstanceID;constraint:OnDelete:CASCADE" json:"instance,omitempty"`
	AgentID       string     `gorm:"size:100;not null" json:"agentId"`
	SessionID     string     `gorm:"size:255;not null" json:"sessionId"`
	Title         *string    `gorm:"size:200" json:"title"`
	LastMessageAt *time.Time `json:"lastMessageAt"`
	MessageCount  int        `gorm:"default:0" json:"messageCount"`
	IsActive      bool       `gorm:"default:true" json:"isActive"`
}

func (ChatSession) TableName() string { return "chat_sessions" }

// ─── ChatMessageSnapshot ───────────────────────────────

type ChatMessageSnapshot struct {
	ID            string      `gorm:"primaryKey;size:30" json:"id"`
	ChatSessionID string      `gorm:"index;size:30;not null" json:"chatSessionId"`
	ChatSession   ChatSession `gorm:"foreignKey:ChatSessionID;constraint:OnDelete:CASCADE" json:"-"`
	BatchID       string      `gorm:"size:50;not null" json:"batchId"`
	OrderIndex    int         `json:"orderIndex"`
	Role          string      `gorm:"size:20;not null" json:"role"`
	Content       string      `gorm:"type:text;not null" json:"content"`
	ContentBlocks *string     `gorm:"type:jsonb" json:"contentBlocks"`
	Thinking      *string     `gorm:"type:text" json:"thinking"`
	ToolCalls     *string     `gorm:"type:jsonb" json:"toolCalls"`
	CreatedAt     time.Time   `json:"createdAt"`
}

func (ChatMessageSnapshot) TableName() string { return "chat_message_snapshots" }

// ─── AgentMeta ─────────────────────────────────────────

type AgentMeta struct {
	BaseModel
	InstanceID   string        `gorm:"index;size:30;not null" json:"instanceId"`
	Instance     Instance      `gorm:"foreignKey:InstanceID;constraint:OnDelete:CASCADE" json:"instance,omitempty"`
	AgentID      string        `gorm:"size:100;not null" json:"agentId"`
	Category     AgentCategory `gorm:"index;size:20;default:DEFAULT;not null" json:"category"`
	DepartmentID *string       `gorm:"index;size:30" json:"departmentId"`
	Department   *Department   `gorm:"foreignKey:DepartmentID;constraint:OnDelete:SET NULL" json:"department,omitempty"`
	OwnerID      *string       `gorm:"index;size:30" json:"ownerId"`
	Owner        *User         `gorm:"foreignKey:OwnerID;constraint:OnDelete:SET NULL" json:"owner,omitempty"`
	CreatedByID  string        `gorm:"size:30;not null" json:"createdById"`
	CreatedBy    User          `gorm:"foreignKey:CreatedByID" json:"createdBy,omitempty"`
}

func (AgentMeta) TableName() string { return "agent_metas" }

// AgentMetaResponse is the API representation of an AgentMeta record.
type AgentMetaResponse struct {
	ID             string        `json:"id"`
	InstanceID     string        `json:"instanceId"`
	InstanceName   string        `json:"instanceName"`
	AgentID        string        `json:"agentId"`
	Category       AgentCategory `json:"category"`
	DepartmentID   *string       `json:"departmentId"`
	DepartmentName *string       `json:"departmentName"`
	OwnerID        *string       `json:"ownerId"`
	OwnerName      *string       `json:"ownerName"`
	CreatedByID    string        `json:"createdById"`
	CreatedByName  string        `json:"createdByName"`
	CreatedAt      time.Time     `json:"createdAt"`
	UpdatedAt      time.Time     `json:"updatedAt"`
}

// ToResponse converts AgentMeta to AgentMetaResponse.
// Preload("Instance"), Preload("Department"), Preload("Owner"), Preload("CreatedBy") before calling.
func (a *AgentMeta) ToResponse() AgentMetaResponse {
	resp := AgentMetaResponse{
		ID:           a.ID,
		InstanceID:   a.InstanceID,
		AgentID:      a.AgentID,
		Category:     a.Category,
		DepartmentID: a.DepartmentID,
		OwnerID:      a.OwnerID,
		CreatedByID:  a.CreatedByID,
		CreatedAt:    a.CreatedAt,
		UpdatedAt:    a.UpdatedAt,
	}
	if a.Instance.ID != "" {
		resp.InstanceName = a.Instance.Name
	}
	if a.Department != nil && a.Department.ID != "" {
		resp.DepartmentName = &a.Department.Name
	}
	if a.Owner != nil && a.Owner.ID != "" {
		resp.OwnerName = &a.Owner.Name
	}
	if a.CreatedBy.ID != "" {
		resp.CreatedByName = a.CreatedBy.Name
	}
	return resp
}

// ─── Skill ─────────────────────────────────────────────

type Skill struct {
	BaseModel
	Slug        string        `gorm:"uniqueIndex;size:200;not null" json:"slug"`
	Name        string        `gorm:"size:200;not null" json:"name"`
	Description *string       `gorm:"type:text" json:"description"`
	Emoji       *string       `gorm:"size:10" json:"emoji"`
	Homepage    *string       `gorm:"size:500" json:"homepage"`
	Category    SkillCategory `gorm:"index;size:20;default:DEFAULT;not null" json:"category"`
	Source      SkillSource   `gorm:"index;size:20;default:LOCAL;not null" json:"source"`
	ClawHubSlug *string       `gorm:"size:200" json:"clawhubSlug"`
	Version     string        `gorm:"size:20;default:0.1.0;not null" json:"version"`
	CreatorID   string        `gorm:"index;size:30;not null" json:"creatorId"`
	Creator     User          `gorm:"foreignKey:CreatorID" json:"creator,omitempty"`
	Tags        *string       `gorm:"type:jsonb" json:"tags"`
	Frontmatter *string       `gorm:"type:jsonb" json:"frontmatter"`
}

func (Skill) TableName() string { return "skills" }

// ─── SkillVersion ──────────────────────────────────────

type SkillVersion struct {
	ID            string    `gorm:"primaryKey;size:30" json:"id"`
	SkillID       string    `gorm:"index;size:30;not null" json:"skillId"`
	Skill         Skill     `gorm:"foreignKey:SkillID;constraint:OnDelete:CASCADE" json:"-"`
	Version       string    `gorm:"size:20;not null" json:"version"`
	Changelog     *string   `gorm:"type:text" json:"changelog"`
	PublishedByID string    `gorm:"size:30;not null" json:"publishedById"`
	PublishedBy   User      `gorm:"foreignKey:PublishedByID" json:"publishedBy,omitempty"`
	PublishedAt   time.Time `gorm:"default:now()" json:"publishedAt"`
}

func (SkillVersion) TableName() string { return "skill_versions" }

// ─── SkillInstallation ─────────────────────────────────

type SkillInstallation struct {
	BaseModel
	SkillID          string   `gorm:"index;size:30;not null" json:"skillId"`
	Skill            Skill    `gorm:"foreignKey:SkillID;constraint:OnDelete:CASCADE" json:"skill,omitempty"`
	InstanceID       string   `gorm:"size:30;not null" json:"instanceId"`
	Instance         Instance `gorm:"foreignKey:InstanceID;constraint:OnDelete:CASCADE" json:"instance,omitempty"`
	AgentID          string   `gorm:"size:100;not null" json:"agentId"`
	InstalledVersion string   `gorm:"size:20;not null" json:"installedVersion"`
	InstallPath      string   `gorm:"size:20;not null" json:"installPath"`
	InstalledByID    string   `gorm:"size:30;not null" json:"installedById"`
	InstalledBy      User     `gorm:"foreignKey:InstalledByID" json:"installedBy,omitempty"`
}

func (SkillInstallation) TableName() string { return "skill_installations" }

// ─── Resource ──────────────────────────────────────────

type Resource struct {
	BaseModel
	Name          string         `gorm:"size:200;not null" json:"name"`
	Type          ResourceType   `gorm:"index;size:20;not null" json:"type"`
	Provider      string         `gorm:"index;size:50;not null" json:"provider"`
	Credentials   string         `gorm:"size:2000;not null" json:"-"` // AES encrypted
	Config        *string        `gorm:"type:jsonb" json:"config"`
	Status        ResourceStatus `gorm:"index;size:20;default:UNTESTED;not null" json:"status"`
	LastTestedAt  *time.Time     `json:"lastTestedAt"`
	LastTestError *string        `gorm:"size:1000" json:"lastTestError"`
	Description   *string        `gorm:"type:text" json:"description"`
	IsDefault     bool           `gorm:"default:false" json:"isDefault"`
	CreatedByID   string         `gorm:"size:30;not null" json:"createdById"`
	CreatedBy     User           `gorm:"foreignKey:CreatedByID" json:"createdBy,omitempty"`
}

func (Resource) TableName() string { return "resources" }

// ─── SystemConfig ──────────────────────────────────────

type SystemConfig struct {
	ID          string    `gorm:"primaryKey;size:30" json:"id"`
	Key         string    `gorm:"uniqueIndex;size:100;not null" json:"key"`
	Value       string    `gorm:"type:jsonb;not null" json:"value"`
	Description *string   `gorm:"size:500" json:"description"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (SystemConfig) TableName() string { return "system_configs" }

// ─── AllModels returns all models for auto-migration ───

func AllModels() []interface{} {
	return []interface{}{
		&User{},
		&Department{},
		&RefreshToken{},
		&AuditLog{},
		&Instance{},
		&InstanceAccess{},
		&ChatSession{},
		&ChatMessageSnapshot{},
		&AgentMeta{},
		&Skill{},
		&SkillVersion{},
		&SkillInstallation{},
		&Resource{},
		&SystemConfig{},
	}
}
