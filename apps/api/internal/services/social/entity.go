package social

import "feed-to-go/internal/services/account"

type Social struct {
	ID          uint `gorm:"primaryKey"`
	FollowerID  uint `gorm:"not null;index:idx_social_follower;uniqueIndex:idx_social_follower_following"`
	FollowingID uint `gorm:"not null;index:idx_social_following;uniqueIndex:idx_social_follower_following"`
}

type FollowRequest struct {
	FollowingID uint `json:"following_id"`
}

type UnfollowRequest struct {
	FollowingID uint `json:"following_id"`
}

type GetAllFollowersRequest struct {
	FollowingID uint `json:"following_id"`
}

type GetAllFollowingsRequest struct {
	FollowerID uint `json:"follower_id"`
}

type GetAllFollowersResponse struct {
	Followers     []*account.Account `json:"followers"`
	FollowerCount int64              `json:"follower_count"`
}

type GetAllFollowingsResponse struct {
	Followings      []*account.Account `json:"followings"`
	FollowingsCount int64              `json:"followings_count"`
}

type SocialCounts struct {
	FollowerCount  int64 `json:"follower_count"`
	FollowingCount int64 `json:"following_count"`
}
