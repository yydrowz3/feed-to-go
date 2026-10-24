package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm.io/gorm"
)

func TestRuntimeConstructionDoesNotStartBackgroundTasks(t *testing.T) {
	r, err := NewRuntime(&gorm.DB{}, nil, nil, "https://frontend.example", "production", false)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if r.Ready() {
		t.Fatal("router construction started background tasks")
	}
	for _, path := range []string{"/healthz", "/static/not-found.mp4"} {
		w := httptest.NewRecorder()
		r.Handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		want := http.StatusOK
		if path != "/healthz" {
			want = http.StatusNotFound
		}
		if w.Code != want {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
	for _, route := range r.Handler.Routes() {
		if route.Path == "/notification/stream" {
			return
		}
	}
	t.Fatal("SSE route lost in refactor")
}

func TestStrictRuntimeRejectsMissingPublishers(t *testing.T) {
	if _, err := NewRuntime(&gorm.DB{}, nil, nil, "https://frontend.example", "production", true); err == nil {
		t.Fatal("strict runtime silently disabled publishers")
	}
}
