package api

import (
	"time"

	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/services/chunk"
	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/feed"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/message"
	"feed-to-go/internal/services/social"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/ratelimit"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func buildRouter(db *gorm.DB, cache *cache.Client, runtime *Runtime, webURL, appEnv string) (*gin.Engine, error) {
	r := gin.Default()
	r.Use(corsMiddleware(webURL, appEnv))
	if err := r.SetTrustedProxies(nil); err != nil {
		return nil, err
	}
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.Static("/static", "./.run/uploads")

	// rate_limit
	loginLimiter := ratelimit.Limit(cache, "account_login", 10, time.Minute, ratelimit.KeyByIP)
	registerLimiter := ratelimit.Limit(cache, "account_register", 5, time.Hour, ratelimit.KeyByIP)

	likeLimiter := ratelimit.Limit(cache, "like_write", 30, time.Minute, ratelimit.KeyByAccount)
	commentLimiter := ratelimit.Limit(cache, "comment_write", 10, time.Minute, ratelimit.KeyByAccount)
	socialLimiter := ratelimit.Limit(cache, "social_write", 20, time.Minute, ratelimit.KeyByAccount)

	// account
	accountRepository := account.NewAccountRepository(db)
	accountService := account.NewAccountService(accountRepository, cache)
	accountHandler := account.NewAccountHandler(accountService)
	accountGroup := r.Group("/account")
	{
		accountGroup.POST("/register", registerLimiter, accountHandler.CreateAccount)
		accountGroup.POST("/login", loginLimiter, accountHandler.Login)
		accountGroup.POST("/changePassword", accountHandler.ChangePassword)
		accountGroup.POST("/findByID", accountHandler.FindByID)
		accountGroup.POST("/findByUsername", accountHandler.FindByUsername)
		accountGroup.POST("/refresh", accountHandler.Refresh)
	}
	protectedAccountGroup := accountGroup.Group("")
	protectedAccountGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedAccountGroup.POST("/logout", accountHandler.Logout)
		protectedAccountGroup.POST("/rename", accountHandler.Rename)
		protectedAccountGroup.POST("/uploadAvatar", accountHandler.UploadAvatar)
		protectedAccountGroup.POST("/updateProfile", accountHandler.UpdateProfile)
	}

	// video
	videoRepository := video.NewVideoRepository(db)
	popularityMQ := runtime.popularityMQ
	videoService := video.NewVideoService(videoRepository, cache, popularityMQ)
	videoHandler := video.NewVideoHandler(videoService, accountService)
	chunkHandler := chunk.NewChunkUploadHandler(cache)
	videoGroup := r.Group("/video")
	{
		videoGroup.POST("/listByAUthorID", videoHandler.ListByAuthorID)
		videoGroup.POST("/getDetail", videoHandler.GetDetail)
	}
	protectedVideoGroup := videoGroup.Group("")
	protectedVideoGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedVideoGroup.POST("/uploadVideo", videoHandler.UploadVideo)
		protectedVideoGroup.POST("/uploadCover", videoHandler.UploadCover)
		protectedVideoGroup.POST("/publish", videoHandler.PublishVideo)
		protectedVideoGroup.POST("/chunk/init", chunkHandler.InitChunkUpload)
		protectedVideoGroup.POST("/chunk/upload", chunkHandler.UploadChunk)
		protectedVideoGroup.POST("/chunk/status", chunkHandler.ChunkStatus)
		protectedVideoGroup.POST("/chunk/complete", chunkHandler.CompleteChunkUpload)
	}

	// like
	likeMQ := runtime.likeMQ
	likeRepository := like.NewLikeRepository(db)
	likeService := like.NewLikeService(likeRepository, videoRepository, cache, likeMQ, popularityMQ)
	likeHandler := like.NewLikeHandler(likeService)
	likeGroup := r.Group("/like")
	protectedLikeGroup := likeGroup.Group("")
	protectedLikeGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedLikeGroup.POST("/like", likeLimiter, likeHandler.Like)
		protectedLikeGroup.POST("/unlike", likeLimiter, likeHandler.Unlike)
		protectedLikeGroup.POST("/isLiked", likeHandler.IsLiked)
		protectedLikeGroup.POST("/listMyLikedVideos", likeHandler.ListMyLikedVideos)
	}

	// comment
	commentRepository := comment.NewCommentRepository(db)
	commentMQ := runtime.commentMQ
	commentService := comment.NewCommentService(commentRepository, videoRepository, cache, commentMQ, popularityMQ)
	commentHandler := comment.NewCommentHandler(commentService, accountService)
	commentGroup := r.Group("/comment")
	{
		commentGroup.POST("/listAll", commentHandler.GetAllComments)
	}
	protectedCommentGroup := commentGroup.Group("")
	protectedCommentGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedCommentGroup.POST("/publish", commentLimiter, commentHandler.PublishComment)
		protectedCommentGroup.POST("/delete", commentLimiter, commentHandler.DeleteComment)
	}

	// social
	socialMQ := runtime.socialMQ
	socialRepository := social.NewSocialRepository(db)
	socialService := social.NewSocialService(socialRepository, accountRepository, socialMQ, cache)
	socialHandler := social.NewSocialHandler(socialService)
	socialGroup := r.Group("/social")
	protectedSocialGroup := socialGroup.Group("")
	protectedSocialGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedSocialGroup.POST("/follow", socialLimiter, socialHandler.Follow)
		protectedSocialGroup.POST("/unfollow", socialLimiter, socialHandler.Unfollow)
		protectedSocialGroup.POST("/getAllFollowers", socialHandler.GetAllFollowers)
		protectedSocialGroup.POST("/getAllVloggers", socialHandler.GetAllFollowings)
		protectedSocialGroup.POST("/getCounts", socialHandler.GetCounts)
	}
	accountGroup.POST("/getProfile", socialHandler.GetProfile(accountService, videoRepository, socialRepository))

	// feed
	feedRepository := feed.NewFeedRepository(db)
	feedService := feed.NewFeedService(feedRepository, likeRepository, cache)
	feedHandler := feed.NewFeedHandler(feedService)
	feedGroup := r.Group("/feed")
	feedGroup.Use(auth.SoftJWTAuth(accountRepository, cache))
	{
		feedGroup.POST("/listLatest", feedHandler.ListLatest)
		feedGroup.POST("/listLikesCount", feedHandler.ListLikesCount)
		feedGroup.POST("/listByPopularity", feedHandler.ListByPopularity)
		feedGroup.POST("/listByTag", feedHandler.ListByTag)
	}
	protectedFeedGroup := feedGroup.Group("")
	protectedFeedGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedFeedGroup.POST("/listByFollowing", feedHandler.ListByFollowing)
	}

	// message
	messageRepo := message.NewRepository(db)
	messageService := message.NewService(messageRepo)
	messageHandler := message.NewHandler(messageService)
	messageGroup := r.Group("/message")
	protectedMessageGroup := messageGroup.Group("")
	protectedMessageGroup.Use(auth.JWTAuth(accountRepository, cache))
	{
		protectedMessageGroup.POST("/send", messageHandler.Send)
		protectedMessageGroup.POST("/list", messageHandler.List)
	}

	notifGroup := r.Group("/notification")
	notifGroup.Use(runtime.Hub.SSERequireAuth())
	runtime.Hub.RegisterRoutes(r, notifGroup)
	return r, nil
}
