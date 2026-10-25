package api

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/feed"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/message"
	"feed-to-go/internal/services/social"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/ratelimit"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type outageConnector struct{}
type outageDriver struct{}

func (outageDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("private database failure")
}
func (outageConnector) Connect(context.Context) (driver.Conn, error) {
	return nil, errors.New("private database failure")
}
func (outageConnector) Driver() driver.Driver { return outageDriver{} }

func TestDatabaseOutagesNeverMasqueradeAsAuthenticationFailures(t *testing.T) {
	sqlDB := sql.OpenDB(outageConnector{})
	defer sqlDB.Close()
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{DisableAutomaticPing: true, Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	feeds := feed.NewFeedHandler(feed.NewFeedService(feed.NewFeedRepository(db), nil, nil))
	comments := comment.NewCommentHandler(nil, account.NewAccountService(account.NewAccountRepository(db), nil))
	for _, tc := range []struct {
		handler gin.HandlerFunc
		body    string
	}{{feeds.ListLatest, `{"limit":10}`}, {feeds.ListLikesCount, `{"limit":10}`}, {comments.PublishComment, `{"video_id":1,"content":"test"}`}} {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Set("accountID", uint(1))
		c.Request = httptest.NewRequest("POST", "/test", strings.NewReader(tc.body))
		c.Request.Header.Set("Content-Type", "application/json")
		tc.handler(c)
		assertErrorContract(t, rec, 500, "INTERNAL_ERROR")
	}
}

func TestFrontendBindingErrorsAndCORS(t *testing.T) {
	gin.SetMode(gin.TestMode)
	accountHandler := account.NewAccountHandler(nil)
	videoHandler := video.NewVideoHandler(nil, nil)
	likeHandler := like.NewLikeHandler(nil)
	socialHandler := social.NewSocialHandler(nil)
	commentHandler := comment.NewCommentHandler(nil, nil)
	messageHandler := message.NewHandler(nil)
	feedHandler := feed.NewFeedHandler(nil)
	for name, handler := range map[string]gin.HandlerFunc{
		"register": accountHandler.CreateAccount, "login": accountHandler.Login, "password": accountHandler.ChangePassword, "rename": accountHandler.Rename,
		"publish": videoHandler.PublishVideo, "detail": videoHandler.GetDetail, "like": likeHandler.Like, "follow": socialHandler.Follow,
		"comment": commentHandler.PublishComment, "commentDelete": commentHandler.DeleteComment, "commentList": commentHandler.GetAllComments,
		"messageSend": messageHandler.Send, "messageList": messageHandler.List, "feed": feedHandler.ListLatest, "hot": feedHandler.ListByPopularity,
	} {
		t.Run(name, func(t *testing.T) {
			r := gin.New()
			r.Use(corsMiddleware("http://localhost:5173", "prod"))
			r.Use(func(c *gin.Context) { c.Set("accountID", uint(1)); c.Next() })
			r.POST("/test", handler)
			req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(`{"broken":`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Origin", "http://localhost:5173")
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			assertErrorContract(t, rec, 400, "VALIDATION_FAILED")
			if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
				t.Fatal("missing CORS on error")
			}
		})
	}
}

func assertErrorContract(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if rec.Code != status || body["code"] != code || body["error"] != apierror.Registry[apierror.Code(code)].Description {
		t.Fatalf("invalid error contract: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAuthenticationAndRateLimitContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct{ header, code string }{{"", "AUTH_REQUIRED"}, {"Basic nope", "INVALID_TOKEN"}, {"Bearer invalid", "INVALID_TOKEN"}} {
		r := gin.New()
		r.Use(auth.JWTAuth(nil, nil))
		r.POST("/test", func(c *gin.Context) { c.Status(200) })
		req := httptest.NewRequest("POST", "/test", nil)
		req.Header.Set("Authorization", tc.header)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		assertErrorContract(t, rec, 401, tc.code)
	}
	mr := miniredis.RunT(t)
	client := cache.NewClient(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "")
	defer client.Close()
	r := gin.New()
	r.Use(ratelimit.Limit(client, "test", 1, time.Minute, ratelimit.KeyByIP))
	r.POST("/test", func(c *gin.Context) { c.Status(200) })
	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("POST", "/test", nil))
		if i == 1 {
			assertErrorContract(t, rec, 429, "RATE_LIMITED")
		}
	}
}
