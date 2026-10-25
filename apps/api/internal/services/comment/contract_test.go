package comment

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type commentConnector struct{ missing bool }
type commentConn struct{ missing bool }
type commentRows struct{ missing, read bool }
type commentDriver struct{}

func (commentDriver) Open(string) (driver.Conn, error) { return nil, errors.New("use connector") }
func (c commentConnector) Connect(context.Context) (driver.Conn, error) {
	return commentConn{c.missing}, nil
}
func (commentConnector) Driver() driver.Driver          { return commentDriver{} }
func (commentConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unexpected prepare") }
func (commentConn) Begin() (driver.Tx, error)           { return nil, errors.New("unexpected write") }
func (commentConn) Close() error                        { return nil }
func (c commentConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &commentRows{missing: c.missing}, nil
}
func (*commentRows) Columns() []string { return []string{"id", "author_id", "video_id"} }
func (*commentRows) Close() error      { return nil }
func (r *commentRows) Next(values []driver.Value) error {
	if r.read || r.missing {
		return io.EOF
	}
	r.read = true
	copy(values, []driver.Value{int64(1), int64(2), int64(1)})
	return nil
}

func TestDeletePermissionAndMissingContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		missing bool
		status  int
		code    string
	}{{false, 403, "FORBIDDEN"}, {true, 404, "COMMENT_NOT_FOUND"}} {
		sqlDB := sql.OpenDB(commentConnector{tc.missing})
		defer sqlDB.Close()
		db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{DisableAutomaticPing: true, Logger: logger.Default.LogMode(logger.Silent)})
		if err != nil {
			t.Fatal(err)
		}
		h := NewCommentHandler(NewCommentService(NewCommentRepository(db), nil, nil, nil, nil), nil)
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Set("accountID", uint(1))
		c.Request = httptest.NewRequest("POST", "/comment/delete", bytes.NewBufferString(`{"comment_id":1}`))
		c.Request.Header.Set("Content-Type", "application/json")
		h.DeleteComment(c)
		var result map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if rec.Code != tc.status || result["code"] != tc.code {
			t.Fatalf("%d %s", rec.Code, rec.Body.String())
		}
	}
}
