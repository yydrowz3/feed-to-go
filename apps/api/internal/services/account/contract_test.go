package account

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func contractHandler(t *testing.T, fixture *loginConnector) *AccountHandler {
	t.Helper()
	sqlDB := sql.OpenDB(fixture)
	t.Cleanup(func() { sqlDB.Close() })
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{DisableAutomaticPing: true, SkipDefaultTransaction: true, Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	return NewAccountHandler(NewAccountService(NewAccountRepository(db), nil))
}
func callContract(handler gin.HandlerFunc, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Set("accountID", uint(1))
	c.Request = httptest.NewRequest("POST", "/test", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	handler(c)
	return rec
}
func assertContract(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var result map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if rec.Code != status || result["code"] != code || result["error"] == nil {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}
func TestConcurrentRegistrationUniqueConstraint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := contractHandler(t, &loginConnector{uniqueInsert: true})
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- callContract(handler.CreateAccount, `{"username":"same-name","password":"test-password"}`)
		}()
	}
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for rec := range results {
		if rec.Code == 200 {
			successes++
		} else {
			assertContract(t, rec, 409, "USERNAME_TAKEN")
			conflicts++
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}
}
func TestRenameUniqueConstraint(t *testing.T) {
	handler := contractHandler(t, &loginConnector{updateError: &pgconn.PgError{Code: "23505"}})
	assertContract(t, callContract(handler.Rename, `{"new_username":"already-taken"}`), 409, "USERNAME_TAKEN")
}
func TestChangePasswordCredentialAndInternalFailures(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name    string
		fixture *loginConnector
		status  int
		code    string
	}{
		{"mismatch", &loginConnector{account: Account{ID: 1, Username: "user", Password: string(hash)}}, 400, "INVALID_CURRENT_PASSWORD"},
		{"missing", &loginConnector{}, 400, "INVALID_CURRENT_PASSWORD"},
		{"database", &loginConnector{queryError: errors.New("private database error")}, 500, "INTERNAL_ERROR"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := contractHandler(t, tc.fixture)
			assertContract(t, callContract(h.ChangePassword, `{"username":"user","old_password":"wrong","new_password":"new"}`), tc.status, tc.code)
		})
	}
}
func TestRequiredAccountFields(t *testing.T) {
	h := NewAccountHandler(nil)
	for _, handler := range []gin.HandlerFunc{h.CreateAccount, h.Login, h.Rename, h.ChangePassword, h.FindByID, h.Refresh} {
		assertContract(t, callContract(handler, `{}`), 400, "VALIDATION_FAILED")
	}
}
