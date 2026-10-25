package feed

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/util"
	"feed-to-go/pkg/apierror"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type FeedHandler struct {
	service *FeedService
}

func NewFeedHandler(service *FeedService) *FeedHandler {
	return &FeedHandler{service: service}
}

func (f *FeedHandler) ListLatest(c *gin.Context) {
	var req ListLatestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 10
	}
	var latestTime time.Time
	if req.LatestTime > 0 {
		latestTime = time.UnixMilli(req.LatestTime)
	}
	viewerAccountID, err := auth.GetAccountID(c)
	if err != nil {
		viewerAccountID = 0
	}
	feedItems, err := f.service.ListLatest(c.Request.Context(), req.Limit, latestTime, viewerAccountID)
	if err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}
	feedItems.VideoList = nonNilFeedVideoItems(feedItems.VideoList)

	c.JSON(http.StatusOK, feedItems)
}

// 按点赞排序
func (f *FeedHandler) ListLikesCount(c *gin.Context) {
	var req ListLikesCountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 10
	}

	// 游标
	var cursor *LikesCountCursor
	if req.LikesCountBefore != nil || req.IDBefore != nil {
		if req.LikesCountBefore == nil || req.IDBefore == nil {
			apierror.Write(c, apierror.ValidationFailed)
			return
		}
		likesCountBefore := *req.LikesCountBefore
		idBefore := *req.IDBefore

		if likesCountBefore < 0 {
			apierror.Write(c, apierror.ValidationFailed)
			return
		}
		if idBefore == 0 {
			if likesCountBefore != 0 {
				apierror.Write(c, apierror.ValidationFailed)
				return
			}
		} else {
			cursor = &LikesCountCursor{
				LikesCount: likesCountBefore,
				ID:         idBefore,
			}
		}
	}

	viewerAccountID, err := auth.GetAccountID(c)
	if err != nil { // 匿名访问
		viewerAccountID = 0
	}
	feedItems, err := f.service.ListLikesCount(c.Request.Context(), req.Limit, cursor, viewerAccountID)
	if err != nil {
		apierror.From(c, err, apierror.VideoNotFound)
		return
	}
	feedItems.VideoList = nonNilFeedVideoItems(feedItems.VideoList)

	c.JSON(http.StatusOK, feedItems)
}

func (f *FeedHandler) ListByFollowing(c *gin.Context) {
	var req ListByFollowingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 10
	}
	viewerAccountID, err := auth.GetAccountID(c)
	if err != nil {
		viewerAccountID = 0
	}
	var latestTime time.Time
	if req.LatestTime > 0 {
		latestTime = time.Unix(req.LatestTime, 0)
	}
	feedItems, err := f.service.ListByFollowing(c.Request.Context(), req.Limit, latestTime, viewerAccountID)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	feedItems.VideoList = nonNilFeedVideoItems(feedItems.VideoList)

	c.JSON(http.StatusOK, feedItems)
}

// 热榜
func (f *FeedHandler) ListByPopularity(c *gin.Context) {
	var req ListByPopularityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 10
	}
	viewerAccountID, err := auth.GetAccountID(c)
	if err != nil { // 匿名
		viewerAccountID = 0
	}

	var latestPopularity int64
	var latestBefore time.Time
	var latestIDBefore uint

	if req.LatestPopularity < 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	anyCursor := !req.LatestBefore.IsZero() || req.LatestIDBefore != nil
	if anyCursor {
		if req.LatestBefore.IsZero() || req.LatestIDBefore == nil || *req.LatestIDBefore == 0 {
			apierror.Write(c, apierror.ValidationFailed)
			return
		}
		latestPopularity = req.LatestPopularity
		latestBefore = req.LatestBefore
		latestIDBefore = *req.LatestIDBefore
	}

	resp, err := f.service.ListByPopularity(c.Request.Context(), req.Limit, req.AsOf, req.Offset, viewerAccountID, latestPopularity, latestBefore, latestIDBefore)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	resp.VideoList = nonNilFeedVideoItems(resp.VideoList)

	c.JSON(http.StatusOK, resp)
}

func (h *FeedHandler) ListByTag(c *gin.Context) {
	var req struct {
		TagName string `json:"tag_name"`
		Limit   int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TagName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tag_name is required"})
		return
	}
	if req.Limit <= 0 || req.Limit > 50 {
		req.Limit = 10
	}

	viewerAccountID, _ := auth.GetAccountID(c)
	items, err := h.service.ListByTag(c.Request.Context(), req.TagName, req.Limit, viewerAccountID)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"video_list": nonNilFeedVideoItems(items)})
}
