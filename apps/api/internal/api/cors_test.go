package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"feed-to-go/internal/config"

	"github.com/gin-gonic/gin"
)

func TestCORSPreflightStopsBeforeAuthentication(t *testing.T) {
	r := gin.New()
	r.Use(corsMiddleware("http://localhost:5173", "prod"))
	called := false
	r.Use(func(c *gin.Context) {
		called = true
		c.AbortWithStatus(http.StatusUnauthorized)
	})
	r.POST("/account/logout", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, path := range []string{"/account/logout", "/video/chunk/upload", "/static/video.mp4"} {
		req := httptest.NewRequest(http.MethodOptions, path, nil)
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent || called || rec.Body.Len() != 0 {
			t.Fatalf("preflight %s: status=%d, downstream called=%v, body=%q", path, rec.Code, called, rec.Body.String())
		}
		for header, want := range map[string]string{
			"Access-Control-Allow-Origin":  "http://localhost:5173",
			"Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
			"Access-Control-Max-Age":       "600",
			"Vary":                         "Origin",
		} {
			if got := rec.Header().Get(header); got != want {
				t.Errorf("%s = %q, want %q", header, got, want)
			}
		}
		if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
			t.Errorf("unexpected credentials header: %q", got)
		}
	}
}

func TestCORSErrorResponsesKeepOriginHeader(t *testing.T) {
	for _, status := range []int{401, 403, 404, 429, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			r := gin.New()
			r.Use(corsMiddleware("http://localhost:5173", "prod"))
			if status != http.StatusNotFound {
				r.POST("/test", func(c *gin.Context) {
					c.AbortWithStatusJSON(status, gin.H{"error": "request failed"})
				})
			}
			req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader("{}"))
			req.Header.Set("Origin", "http://localhost:5173")
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			if rec.Code != status || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
				t.Fatalf("status=%d, CORS origin=%q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
			}
		})
	}
}

func TestCORSOriginMatchingUsesConfiguredWebURL(t *testing.T) {
	t.Setenv("APP_ENV", "prod")
	t.Setenv("WEB_URL", "https://frontend.example.com")
	cfg := config.DefaultLocalConfig()
	r := gin.New()
	r.Use(corsMiddleware(cfg.Server.WebURL, cfg.Server.AppEnv))
	called := false
	r.GET("/healthz", func(c *gin.Context) { called = true; c.Status(http.StatusOK) })
	for _, origin := range []string{
		"https://frontend.example.com", "", "http://localhost:5173", "http://127.0.0.1:5173",
		"https://frontend.example.com.evil.test", "https://frontend.example.com:8443", "null",
	} {
		called = false
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		allowed := origin == "" || origin == cfg.Server.WebURL
		if allowed {
			if rec.Code != http.StatusOK || !called || rec.Header().Get("Access-Control-Allow-Origin") != origin {
				t.Errorf("allowed origin %q: status=%d, called=%v, CORS origin=%q", origin, rec.Code, called, rec.Header().Get("Access-Control-Allow-Origin"))
			}
		} else if rec.Code != http.StatusForbidden || called || rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("rejected origin %q: status=%d, called=%v, CORS origin=%q", origin, rec.Code, called, rec.Header().Get("Access-Control-Allow-Origin"))
		}
		if rec.Header().Get("Vary") != "Origin" {
			t.Errorf("missing Vary: Origin for origin %q", origin)
		}
	}
}

func TestCORSAppEnvironmentPolicy(t *testing.T) {
	for _, tc := range []struct {
		env      string
		allowAll bool
	}{
		{"dev", true}, {" dev ", true}, {"", false}, {"prod", false},
		{"production", false}, {"staging", false}, {"development", false}, {"DEV", false},
	} {
		t.Run("APP_ENV="+tc.env, func(t *testing.T) {
			t.Setenv("APP_ENV", tc.env)
			t.Setenv("WEB_URL", "https://frontend.example.com")
			cfg := config.DefaultLocalConfig()
			r := gin.New()
			r.Use(corsMiddleware(cfg.Server.WebURL, cfg.Server.AppEnv))
			called := false
			r.Use(func(c *gin.Context) {
				called = true
				c.AbortWithStatus(http.StatusUnauthorized)
			})
			for _, origin := range []string{"https://frontend.example.com", "http://localhost:5173", "http://127.0.0.1:4173", "https://other.example.com", "https://frontend.example.com.evil.test", "null", ""} {
				for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodOptions} {
					called = false
					req := httptest.NewRequest(method, "/protected", nil)
					if origin != "" {
						req.Header.Set("Origin", origin)
					}
					if method == http.MethodOptions {
						req.Header.Set("Access-Control-Request-Method", http.MethodPost)
						req.Header.Set("Access-Control-Request-Headers", "authorization,content-type,range")
					}
					rec := httptest.NewRecorder()
					r.ServeHTTP(rec, req)
					wantStatus, wantOrigin, wantCalled := http.StatusUnauthorized, "", true
					if origin != "" {
						if !tc.allowAll && origin != "https://frontend.example.com" {
							wantStatus, wantCalled = http.StatusForbidden, false
						} else {
							wantOrigin = origin
							if tc.allowAll {
								wantOrigin = "*"
							}
							if method == http.MethodOptions {
								wantStatus, wantCalled = http.StatusNoContent, false
								if rec.Header().Get("Access-Control-Allow-Headers") != "Authorization, Content-Type, Range" {
									t.Errorf("preflight lost supported headers: %q", rec.Header())
								}
							}
						}
					}
					if rec.Code != wantStatus || rec.Header().Get("Access-Control-Allow-Origin") != wantOrigin || called != wantCalled {
						t.Errorf("%s origin=%q: status=%d, CORS=%q, downstream=%v; want %d, %q, %v", method, origin, rec.Code, rec.Header().Get("Access-Control-Allow-Origin"), called, wantStatus, wantOrigin, wantCalled)
					}
					if rec.Header().Get("Access-Control-Allow-Credentials") != "" {
						t.Error("unexpected cross-origin cookie credentials")
					}
				}
			}
		})
	}
}

func TestCORSStaticMediaAndRangeRequests(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "video.mp4"), []byte("0123456789"), 0600); err != nil {
		t.Fatal(err)
	}
	r := gin.New()
	r.Use(corsMiddleware("http://localhost:5173", "prod"))
	r.Static("/static", directory)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		req := httptest.NewRequest(method, "/static/video.mp4", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		if method == http.MethodGet {
			req.Header.Set("Range", "bytes=0-3")
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
			t.Fatalf("missing CORS header on static %s", method)
		}
		if method == http.MethodGet && (rec.Code != http.StatusPartialContent || rec.Body.String() != "0123") {
			t.Fatalf("range request: status=%d, body=%q", rec.Code, rec.Body.String())
		}
		if method == http.MethodHead && (rec.Code != http.StatusOK || rec.Body.Len() != 0) {
			t.Fatalf("HEAD request: status=%d, body=%q", rec.Code, rec.Body.String())
		}
	}
}
