package video

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/util"
	"feed-to-go/pkg/apierror"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type VideoHandler struct {
	service        *VideoService
	accountService *account.AccountService
}

func NewVideoHandler(service *VideoService, accountService *account.AccountService) *VideoHandler {
	return &VideoHandler{service: service, accountService: accountService}
}

func (vh *VideoHandler) PublishVideo(c *gin.Context) {
	var req PublishVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	authorId, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	username, err := auth.GetUsername(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	video := &Video{
		AuthorID:    authorId,
		Username:    username,
		Title:       req.Title,
		Description: req.Description,
		PlayURL:     req.PlayURL,
		CoverURL:    req.CoverURL,
		CreateTime:  time.Now(),
	}
	if err := vh.service.Publish(c.Request.Context(), video); err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}

	c.JSON(http.StatusOK, video)
}

func (vh *VideoHandler) UploadVideo(c *gin.Context) {
	authorId, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	f, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}

	const maxSize = 200 << 20
	if f.Size <= 0 || f.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file size"})
		return
	}

	ext := strings.ToLower(filepath.Ext(f.Filename))
	if ext != ".mp4" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .mp4 is allowed"})
		return
	}
	date := time.Now().Format("20060102")
	relDir := filepath.Join("videos", fmt.Sprintf("%d", authorId), date)
	root := filepath.Join(".run", "uploads")
	absDir := filepath.Join(root, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename, err := util.RandHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}
	filename = filename + ext
	absPath := filepath.Join(absDir, filename)

	if err := c.SaveUploadedFile(f, absPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	urlPath := path.Join("/static", "videos", fmt.Sprintf("%d", authorId), date, filename)

	c.JSON(http.StatusOK, gin.H{
		"url":      util.BuildAbsoluteURL(c, urlPath),
		"play_url": util.BuildAbsoluteURL(c, urlPath),
	})

}

func (vh *VideoHandler) UploadCover(c *gin.Context) {
	authorId, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}

	f, err := c.FormFile("file")
	if err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	const maxSize = 10 << 20
	if f.Size <= 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if f.Size > maxSize {
		apierror.Write(c, apierror.FileTooLarge)
		return
	}

	ext := strings.ToLower(filepath.Ext(f.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		apierror.Write(c, apierror.UnsupportedFileType)
		return
	}

	date := time.Now().Format("20060102")
	relDir := filepath.Join("covers", fmt.Sprintf("%d", authorId), date)
	root := filepath.Join(".run", "uploads")
	absDir := filepath.Join(root, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}

	filename, err := util.RandHex(16)
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	filename = filename + ext
	absPath := filepath.Join(absDir, filename)

	if err := c.SaveUploadedFile(f, absPath); err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}

	urlPath := path.Join("/static", "covers", fmt.Sprintf("%d", authorId), date, filename)

	c.JSON(http.StatusOK, gin.H{
		"url":       util.BuildAbsoluteURL(c, urlPath),
		"cover_url": util.BuildAbsoluteURL(c, urlPath),
	})

}

func (vh *VideoHandler) DeleteVideo(c *gin.Context) {
	var req DeleteVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	authorId, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	if err := vh.service.Delete(c.Request.Context(), req.ID, authorId); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "video deleted"})
}

func (vh *VideoHandler) ListByAuthorID(c *gin.Context) {
	var req ListByAuthorIDRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	videos, err := vh.service.ListByAuthorID(c.Request.Context(), req.AuthorID)

	if err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}

	if videos == nil {
		videos = []Video{}
	}

	c.JSON(http.StatusOK, videos)
}

func (vh *VideoHandler) GetDetail(c *gin.Context) {
	var req GetDetailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	video, err := vh.service.GetDetail(c.Request.Context(), req.ID)
	if err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}

	c.JSON(http.StatusOK, video)
}

func (vh *VideoHandler) UpdateLikesCount(c *gin.Context) {
	var req UpdateLikesCountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := vh.service.UpdateLikesCount(c.Request.Context(), req.ID, req.LikesCount); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "likes count updated"})
}
