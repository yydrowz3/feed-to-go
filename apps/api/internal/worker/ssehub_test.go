package worker

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestStopStreamsReleasesSSEHandler(t *testing.T) {
	h := NewSSEHub(nil)
	r := gin.New()
	r.GET("/stream", func(c *gin.Context) { c.Set("accountID", uint(1)); h.SSEHandler(c) })
	done := make(chan struct{})
	go func() { r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/stream", nil)); close(done) }()
	eventually(t, func() bool { h.mu.RLock(); defer h.mu.RUnlock(); return len(h.clients[1]) == 1 })
	h.StopStreams()
	h.StopStreams()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SSE prevented shutdown")
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	if len(h.clients) != 0 {
		t.Fatal("SSE subscription leaked")
	}
}
