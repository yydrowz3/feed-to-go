package social

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/apierror"
	"net/http"

	"github.com/gin-gonic/gin"
)

type SocialHandler struct {
	service *SocialService
}

func NewSocialHandler(service *SocialService) *SocialHandler {
	return &SocialHandler{service: service}
}

func (h *SocialHandler) Follow(c *gin.Context) {
	var req FollowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.FollowingID <= 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	FollowerID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}

	social := &Social{
		FollowerID:  FollowerID,
		FollowingID: req.FollowingID,
	}
	if err := h.service.Follow(c.Request.Context(), social); err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "followed"})
}

func (h *SocialHandler) Unfollow(c *gin.Context) {
	var req UnfollowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	if req.FollowingID <= 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	FollowerID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	social := &Social{
		FollowerID:  FollowerID,
		FollowingID: req.FollowingID,
	}
	if err := h.service.Unfollow(c.Request.Context(), social); err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "unfollowed"})
}

func (h *SocialHandler) GetAllFollowers(c *gin.Context) {
	var req GetAllFollowersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	FollowingID := req.FollowingID
	if FollowingID == 0 {
		accountID, err := auth.GetAccountID(c)
		if err != nil {
			apierror.Write(c, apierror.AuthRequired)
			return
		}
		FollowingID = accountID
	}
	followers, err := h.service.GetAllFollowers(c.Request.Context(), FollowingID)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}

	if followers == nil {
		followers = []*account.Account{}
	}

	followerCount, _ := h.service.CountFollowers(c.Request.Context(), FollowingID)

	c.JSON(http.StatusOK, GetAllFollowersResponse{Followers: followers, FollowerCount: followerCount})
}

func (h *SocialHandler) GetAllFollowings(c *gin.Context) {
	var req GetAllFollowingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	followerID := req.FollowerID
	if followerID == 0 {
		accountID, err := auth.GetAccountID(c)
		if err != nil {
			apierror.Write(c, apierror.AuthRequired)
			return
		}
		followerID = accountID
	}

	followings, err := h.service.GetAllFollowings(c.Request.Context(), followerID)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	if followings == nil {
		followings = []*account.Account{}
	}
	followingCount, _ := h.service.CountFollowings(c.Request.Context(), followerID)

	c.JSON(http.StatusOK, GetAllFollowingsResponse{Followings: followings, FollowingsCount: followingCount})
}

func (h *SocialHandler) GetCounts(c *gin.Context) {
	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	followerCount, _ := h.service.CountFollowers(c.Request.Context(), accountID)
	followingCount, _ := h.service.CountFollowings(c.Request.Context(), accountID)

	c.JSON(http.StatusOK, SocialCounts{FollowerCount: followerCount, FollowingCount: followingCount})
}

func (h *SocialHandler) GetProfile(accountService *account.AccountService, videoRepository *video.VideoRepository, socialRepository *SocialRepository) func(c *gin.Context) {
	return func(c *gin.Context) {
		var req account.GetProfileRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			apierror.Write(c, apierror.ValidationFailed)
			return
		}
		if req.AccountID == 0 {
			apierror.Write(c, apierror.ValidationFailed)
			return
		}
		acc, err := accountService.FindByID(c.Request.Context(), req.AccountID)
		if err != nil {
			apierror.From(c, err, apierror.AccountNotFound)
			return
		}

		videoCount, _ := videoRepository.CountByAuthor(c.Request.Context(), req.AccountID)
		totalLikes, _ := videoRepository.TotalLikesByAuthor(c.Request.Context(), req.AccountID)
		followerCount, _ := socialRepository.CountFollowers(c.Request.Context(), req.AccountID)
		followingCount, _ := socialRepository.CountFollowings(c.Request.Context(), req.AccountID)

		c.JSON(http.StatusOK, account.GetProfileResponse{
			Account:    account.FindByIDResponse{ID: acc.ID, Username: acc.Username, AvatarURL: acc.AvatarURL, Bio: acc.Bio},
			VideoCount: videoCount, TotalLikes: totalLikes,
			FollowerCount: followerCount, FollowingCount: followingCount,
		})
	}
}
