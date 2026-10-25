package account

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// An in-memory database/sql transport exercises the real handler, service and
// PostgreSQL repository without accessing the configured remote database.
type loginConnector struct {
	account                 Account
	queryError, updateError error
	insertGuard             sync.Mutex
	inserted                bool
	uniqueInsert            bool
}
type loginConn struct{ fixture *loginConnector }
type loginRows struct {
	values  []driver.Value
	read    bool
	columns []string
}
type loginTx struct{}

func (loginTx) Commit() error   { return nil }
func (loginTx) Rollback() error { return nil }

type loginDriver struct{}

func (d loginDriver) Open(string) (driver.Conn, error) { return nil, errors.New("use connector") }
func (c *loginConnector) Connect(context.Context) (driver.Conn, error) {
	return &loginConn{fixture: c}, nil
}
func (c *loginConnector) Driver() driver.Driver { return loginDriver{} }
func (c *loginConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (c *loginConn) Close() error              { return nil }
func (c *loginConn) Begin() (driver.Tx, error) { return loginTx{}, nil }
func (c *loginConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if c.fixture.uniqueInsert && strings.HasPrefix(query, "INSERT") {
		c.fixture.insertGuard.Lock()
		defer c.fixture.insertGuard.Unlock()
		if c.fixture.inserted {
			return nil, &pgconn.PgError{Code: "23505"}
		}
		c.fixture.inserted = true
		return &loginRows{values: []driver.Value{int64(1)}, columns: []string{"id"}}, nil
	}
	if c.fixture.queryError != nil {
		return nil, c.fixture.queryError
	}
	a := c.fixture.account
	if len(args) == 0 || args[0].Value != a.Username {
		return &loginRows{}, nil
	}
	return &loginRows{values: []driver.Value{int64(a.ID), a.Username, a.Password, a.Token, a.RefreshToken}}, nil
}
func (c *loginConn) ExecContext(context.Context, string, []driver.NamedValue) (driver.Result, error) {
	if c.fixture.updateError != nil {
		return nil, c.fixture.updateError
	}
	return driver.RowsAffected(1), nil
}
func (r *loginRows) Columns() []string {
	if r.columns != nil {
		return r.columns
	}
	return []string{"id", "username", "password", "token", "refresh_token"}
}
func (r *loginRows) Close() error { return nil }
func (r *loginRows) Next(values []driver.Value) error {
	if r.read || r.values == nil {
		return io.EOF
	}
	copy(values, r.values)
	r.read = true
	return nil
}

func TestLoginHTTPContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("JWT_SECRET", "dedicated-unit-test-signing-key")
	hash, err := bcrypt.GenerateFromPassword([]byte("CorrectTestPassword"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, username, password string
		queryError, updateError  error
		status                   int
		message                  string
	}{
		{name: "success", username: "qatester", password: "CorrectTestPassword", status: http.StatusOK},
		{name: "wrong password", username: "qatester", password: "WrongPassword", status: http.StatusUnauthorized, message: "invalid username or password"},
		{name: "unknown username", username: "missing", password: "CorrectTestPassword", status: http.StatusUnauthorized, message: "invalid username or password"},
		{name: "lookup outage", username: "qatester", password: "CorrectTestPassword", queryError: errors.New("private database detail"), status: http.StatusInternalServerError, message: "internal server error"},
		{name: "session persistence outage", username: "qatester", password: "CorrectTestPassword", updateError: errors.New("private database detail"), status: http.StatusInternalServerError, message: "internal server error"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sqlDB := sql.OpenDB(&loginConnector{account: Account{ID: 41, Username: "qatester", Password: string(hash)}, queryError: tc.queryError, updateError: tc.updateError})
			defer sqlDB.Close()
			db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{DisableAutomaticPing: true, SkipDefaultTransaction: true, Logger: logger.Default.LogMode(logger.Silent)})
			if err != nil {
				t.Fatal(err)
			}
			handler := NewAccountHandler(NewAccountService(NewAccountRepository(db), nil))
			router := gin.New()
			router.POST("/account/login", handler.Login)
			body, _ := json.Marshal(map[string]string{"username": tc.username, "password": tc.password})
			req := httptest.NewRequest(http.MethodPost, "/account/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != tc.status {
				t.Fatalf("status=%d, want=%d", response.Code, tc.status)
			}
			var data map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			if tc.status == http.StatusOK {
				access, accessOK := data["token"].(string)
				refresh, refreshOK := data["refresh_token"].(string)
				if data["account_id"] != float64(41) || data["username"] != "qatester" || !accessOK || access == "" || !refreshOK || refresh == "" {
					t.Fatal("missing successful login identity or credentials")
				}
			} else if data["code"] != map[int]string{401: "INVALID_CREDENTIALS", 500: "INTERNAL_ERROR"}[tc.status] || data["error"] != tc.message || data["token"] != nil || data["refresh_token"] != nil {
				t.Fatal("error response exposed details or created a session")
			}
		})
	}
}
