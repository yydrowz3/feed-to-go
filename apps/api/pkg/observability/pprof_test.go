package observability

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewPprofMux(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rr := httptest.NewRecorder()

	NewPprofMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status code %d, got %d", http.StatusOK, rr.Code)
	}
}

func TestNewPprofServerWithDisabled(t *testing.T) {
	t.Parallel()

	pprofServer, err := NewPprofServer("api", false, "localhost:6060")

	if err != nil {
		t.Fatalf("Failed to create pprof server: %v", err)
	}

	if pprofServer != nil {
		t.Fatalf("Expected nil pprof server when disabled, got non-nil")
	}
}

func TestPprofServerCloseWithDisabledServer(t *testing.T) {
	t.Parallel()

	pprofServer, err := NewPprofServer("api", false, "localhost:6060")
	if err != nil {
		t.Fatalf("Failed to create pprof server: %v", err)
	}
	if err := pprofServer.Close(); err != nil {
		t.Fatalf("Expected no error when closing disabled pprof server, got: %v", err)
	}
}
