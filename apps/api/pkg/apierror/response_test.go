package apierror

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

func TestRegisteredErrorResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for code, metadata := range Registry {
		t.Run(string(code), func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			Write(c, code, gin.H{"missing": 2, "code": "overwrite", "error": "private"})
			var body map[string]any
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if recorder.Code != metadata.Status || body["code"] != string(code) || body["error"] != metadata.Description || body["missing"] != float64(2) || !c.IsAborted() {
				t.Fatalf("invalid contract: %d %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestClassificationUsesTypesAndPreservesCause(t *testing.T) {
	internal := errors.New("private database details")
	for _, tc := range []struct {
		err     error
		missing Code
		want    Code
	}{
		{internal, AccountNotFound, InternalError},
		{errors.New("video not found"), VideoNotFound, InternalError},
		{fmt.Errorf("wrapped: %w", Forbidden), AccountNotFound, Forbidden},
		{gorm.ErrRecordNotFound, CommentNotFound, CommentNotFound},
		{Wrap(UploadServiceUnavailable, internal), UploadSessionNotFound, UploadServiceUnavailable},
	} {
		if got := Classify(tc.err, tc.missing); got != tc.want {
			t.Fatalf("got %v want %v", got, tc.want)
		}
	}
	wrapped := Wrap(UploadServiceUnavailable, internal)
	if !errors.Is(wrapped, internal) || !errors.Is(wrapped, UploadServiceUnavailable) {
		t.Fatal("lost typed error or cause")
	}
	if !IsDuplicate(&pgconn.PgError{Code: "23505"}) || !IsDuplicate(gorm.ErrDuplicatedKey) || IsDuplicate(errors.New("duplicate key")) {
		t.Fatal("incorrect duplicate classification")
	}
}
