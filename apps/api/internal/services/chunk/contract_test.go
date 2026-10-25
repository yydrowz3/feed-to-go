package chunk

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestSessionFaultContracts(t *testing.T) {
	mr := miniredis.RunT(t)
	client := cache.NewClient(redis.NewClient(&redis.Options{Addr: mr.Addr(), MaxRetries: -1}), "")
	defer client.Close()
	h := NewChunkUploadHandler(client)
	valid := ChunkUploadSession{UploadID: "valid", AccountID: 2, Filename: "x.mp4", FileSize: 1, ChunkSize: 1, TotalChunks: 1, FileHash: "hash", UploadedBits: []bool{false}}
	data, _ := json.Marshal(valid)
	_ = client.SetBytes(context.Background(), h.sessionKey("valid"), data, time.Minute)
	_ = client.SetBytes(context.Background(), h.sessionKey("corrupt"), []byte(`{"total_chunks":99}`), time.Minute)
	for _, tc := range []struct {
		id     string
		status int
		code   string
	}{{"missing", 404, "UPLOAD_SESSION_NOT_FOUND"}, {"valid", 403, "FORBIDDEN"}, {"corrupt", 500, "INTERNAL_ERROR"}} {
		c, rec := newJSONContext(t, "/video/chunk/status", ChunkStatusRequest{UploadID: tc.id})
		h.ChunkStatus(c)
		body := parseJSON(t, rec)
		if rec.Code != tc.status || body["code"] != tc.code || body["error"] != apierror.Registry[apierror.Code(tc.code)].Description {
			t.Fatalf("%s: %d %s", tc.id, rec.Code, rec.Body.String())
		}
	}
	mr.SetError("redis unavailable")
	c, rec := newJSONContext(t, "/video/chunk/status", ChunkStatusRequest{UploadID: "valid"})
	h.ChunkStatus(c)
	if rec.Code != 503 || parseJSON(t, rec)["code"] != "UPLOAD_SERVICE_UNAVAILABLE" {
		t.Fatalf("redis fault: %d %s", rec.Code, rec.Body.String())
	}
	nilHandler := NewChunkUploadHandler(nil)
	c, rec = newJSONContext(t, "/video/chunk/status", ChunkStatusRequest{UploadID: "valid"})
	nilHandler.ChunkStatus(c)
	if rec.Code != 503 {
		t.Fatal("nil redis must return 503")
	}
}

func TestInitSizeAndShapeContracts(t *testing.T) {
	h, cleanup := setupTestEnv(t)
	defer cleanup()
	for _, tc := range []struct {
		req    InitChunkUploadRequest
		status int
		code   string
	}{
		{InitChunkUploadRequest{Filename: "x.mp4", FileSize: 201 << 20, ChunkSize: 5 << 20, TotalChunks: 41, FileHash: "hash"}, 413, "FILE_TOO_LARGE"},
		{InitChunkUploadRequest{Filename: "x.mp4", FileSize: 1, ChunkSize: 1, TotalChunks: 2, FileHash: "hash"}, 400, "VALIDATION_FAILED"},
	} {
		c, rec := newJSONContext(t, "/video/chunk/init", tc.req)
		h.InitChunkUpload(c)
		if rec.Code != tc.status || parseJSON(t, rec)["code"] != tc.code {
			t.Fatalf("%d %s", rec.Code, rec.Body.String())
		}
	}
}
