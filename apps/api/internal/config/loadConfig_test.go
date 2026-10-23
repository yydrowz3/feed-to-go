package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRedisTLSFromEnvironment(t *testing.T) {
	for _, value := range []string{"", "false", "true"} {
		t.Run("REDIS_TLS="+value, func(t *testing.T) {
			t.Setenv("REDIS_TLS", value)
			cfg := DefaultLocalConfig()
			if cfg.Redis.TLS != (value == "true") {
				t.Fatalf("Redis.TLS = %v for REDIS_TLS=%q", cfg.Redis.TLS, value)
			}
		})
	}
}

func TestRabbitMQFromEnvironment(t *testing.T) {
	t.Setenv("AMQP_URL", "amqps://user:test@localhost/tenant")
	t.Setenv("AMQP_TLS", "true")
	t.Setenv("AMQP_VHOST", "tenant")
	cfg := DefaultLocalConfig()
	if cfg.RabbitMQ.URL != "amqps://user:test@localhost/tenant" || !cfg.RabbitMQ.TLS || cfg.RabbitMQ.VHost != "tenant" {
		t.Fatal("RabbitMQ URI, TLS, or vhost environment configuration was lost")
	}
}

func TestWebURLFromEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name  string
		value string
		want  string
	}{
		{"empty uses localhost", "", "http://localhost:5173"},
		{"whitespace uses localhost", "  \t", "http://localhost:5173"},
		{"custom local origin", "http://127.0.0.1:5173", "http://127.0.0.1:5173"},
		{"custom HTTPS origin", " https://video.example.com ", "https://video.example.com"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("WEB_URL", tc.value)
			cfg := DefaultLocalConfig()
			if cfg.Server.WebURL != tc.want {
				t.Fatalf("WebURL = %q, want %q", cfg.Server.WebURL, tc.want)
			}
		})
	}
}

func TestUnsetWebURLUsesLocalhost(t *testing.T) {
	t.Setenv("WEB_URL", "")
	if err := os.Unsetenv("WEB_URL"); err != nil {
		t.Fatal(err)
	}
	if got := DefaultLocalConfig().Server.WebURL; got != "http://localhost:5173" {
		t.Fatalf("WebURL = %q, want localhost default", got)
	}
}

func TestLoadLocalDevKeepsServerEnvironmentWithAndWithoutConfigFile(t *testing.T) {
	t.Setenv("APP_ENV", " dev ")
	t.Setenv("WEB_URL", "https://frontend.example.com")
	filename := filepath.Join(t.TempDir(), "config.yaml")
	for _, exists := range []bool{false, true} {
		if exists {
			if err := os.WriteFile(filename, []byte("observability: {}\n"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		cfg, usedDefault, err := LoadLocalDev(filename)
		if err != nil {
			t.Fatal(err)
		}
		if usedDefault == exists {
			t.Fatalf("usedDefault = %v for config file exists = %v", usedDefault, exists)
		}
		if cfg.Server.WebURL != "https://frontend.example.com" {
			t.Fatalf("configured WebURL was lost: %q", cfg.Server.WebURL)
		}
		if cfg.Server.AppEnv != "dev" {
			t.Fatalf("configured AppEnv was lost: %q", cfg.Server.AppEnv)
		}
	}
}
