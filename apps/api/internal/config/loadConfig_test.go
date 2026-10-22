package config

import (
	"os"
	"path/filepath"
	"testing"
)

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

func TestLoadLocalDevKeepsWebURLWithAndWithoutConfigFile(t *testing.T) {
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
	}
}
