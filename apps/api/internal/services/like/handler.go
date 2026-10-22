package like

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/video"
	"feed-to-go/internal/util"
	"net/http"

	"github.com/gin-gonic/gin"
)

type LikeHandler struct {
	service *LikeService
}

func NewLikeHandler(service *LikeService) *LikeHandler {
	return &LikeHandler{service: service}
}

func (lh *LikeHandler) Like(c *gin.Context) {
	var req LikeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.VideoID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "video_id is required"})
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	like := &Like{
		VideoID:   req.VideoID,
		AccountID: accountID,
	}
	if err := lh.service.Like(c.Request.Context(), like); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "like success"})
}

func (lh *LikeHandler) Unlike(c *gin.Context) {
	var req LikeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.VideoID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "video_id is required"})
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	like := &Like{
		VideoID:   req.VideoID,
		AccountID: accountID,
	}
	if err := lh.service.Unlike(c.Request.Context(), like); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "unlike success"})

}

func (lh *LikeHandler) IsLiked(c *gin.Context) {
	var req LikeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.VideoID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "video_id is required"})
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	isLiked, err := lh.service.IsLiked(c.Request.Context(), req.VideoID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"is_liked": isLiked})

}

func (lh *LikeHandler) ListMyLikedVideos(c *gin.Context) {
	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	videos, err := lh.service.ListLikedVideos(c.Request.Context(), accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if videos == nil {
		videos = []video.Video{}
	}

	c.JSON(http.StatusOK, videos)
}
