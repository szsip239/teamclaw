package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all configuration for the application.
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	Crypto   CryptoConfig   `mapstructure:"crypto"`
	Docker   DockerConfig   `mapstructure:"docker"`
	CORS     CORSConfig     `mapstructure:"cors"`
}

type ServerConfig struct {
	Port         int           `mapstructure:"port"`
	Mode         string        `mapstructure:"mode"` // debug, release, test
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

type DatabaseConfig struct {
	URL             string `mapstructure:"url"`
	MaxOpenConns    int    `mapstructure:"max_open_conns"`
	MaxIdleConns    int    `mapstructure:"max_idle_conns"`
	ConnMaxLifetime int    `mapstructure:"conn_max_lifetime"` // seconds
}

type RedisConfig struct {
	URL string `mapstructure:"url"`
}

type JWTConfig struct {
	PrivateKey    string        `mapstructure:"private_key"`    // Base64-encoded PEM
	PublicKey     string        `mapstructure:"public_key"`     // Base64-encoded PEM
	AccessExpiry  time.Duration `mapstructure:"access_expiry"`
	RefreshExpiry time.Duration `mapstructure:"refresh_expiry"`
	Issuer        string        `mapstructure:"issuer"`
}

type CryptoConfig struct {
	EncryptionKey string `mapstructure:"encryption_key"` // 64-char hex string
}

type DockerConfig struct {
	SocketPath   string `mapstructure:"socket_path"`
	NetworkName  string `mapstructure:"network_name"`
	DefaultImage string `mapstructure:"default_image"`
	DataDir      string `mapstructure:"data_dir"`
}

type CORSConfig struct {
	AllowOrigins []string `mapstructure:"allow_origins"`
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("server.port", 3200)
	v.SetDefault("server.mode", "debug")
	v.SetDefault("server.read_timeout", 30*time.Second)
	v.SetDefault("server.write_timeout", 30*time.Second)

	v.SetDefault("database.max_open_conns", 25)
	v.SetDefault("database.max_idle_conns", 5)
	v.SetDefault("database.conn_max_lifetime", 300)

	v.SetDefault("jwt.access_expiry", 15*time.Minute)
	v.SetDefault("jwt.refresh_expiry", 7*24*time.Hour)
	v.SetDefault("jwt.issuer", "teamclaw")

	v.SetDefault("docker.socket_path", "/var/run/docker.sock")
	v.SetDefault("docker.network_name", "teamclaw-net")
	v.SetDefault("docker.default_image", "alpine/openclaw:latest")
	v.SetDefault("docker.data_dir", "/data/teamclaw")

	v.SetDefault("cors.allow_origins", []string{"http://localhost:3000", "http://localhost:3100"})

	// Env mapping
	v.SetEnvPrefix("")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Map environment variables to config keys
	envMap := map[string]string{
		"database.url":        "DATABASE_URL",
		"redis.url":           "REDIS_URL",
		"jwt.private_key":     "JWT_PRIVATE_KEY",
		"jwt.public_key":      "JWT_PUBLIC_KEY",
		"jwt.issuer":          "JWT_ISSUER",
		"crypto.encryption_key": "ENCRYPTION_KEY",
		"server.port":         "PORT",
		"server.mode":         "GIN_MODE",
		"docker.socket_path":  "DOCKER_SOCKET_PATH",
		"docker.network_name": "DOCKER_NETWORK",
		"docker.default_image": "DEFAULT_OPENCLAW_IMAGE",
		"docker.data_dir":     "TEAMCLAW_DATA_DIR",
	}

	for key, env := range envMap {
		if err := v.BindEnv(key, env); err != nil {
			return nil, fmt.Errorf("failed to bind env %s: %w", env, err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Validate required fields
	if cfg.Database.URL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWT.PrivateKey == "" || cfg.JWT.PublicKey == "" {
		return nil, fmt.Errorf("JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required")
	}
	if cfg.Crypto.EncryptionKey == "" {
		return nil, fmt.Errorf("ENCRYPTION_KEY is required")
	}

	return &cfg, nil
}
