package social

import (
	"context"
	"feed-to-go/internal/services/account"
	"feed-to-go/pkg/apierror"

	"gorm.io/gorm"
)

type SocialRepository struct {
	db *gorm.DB
}

func NewSocialRepository(db *gorm.DB) *SocialRepository {
	return &SocialRepository{db: db}
}

func (r *SocialRepository) Follow(ctx context.Context, social *Social) error {
	err := r.db.WithContext(ctx).Create(social).Error
	if apierror.IsDuplicate(err) {
		return apierror.AlreadyFollowed
	}
	return err
}

func (r *SocialRepository) Unfollow(ctx context.Context, social *Social) error {
	result := r.db.WithContext(ctx).Where("follower_id = ? AND following_id = ?", social.FollowerID, social.FollowingID).Delete(&Social{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return apierror.NotFollowing
	}
	return nil
}

func (r *SocialRepository) GetAllFollowers(ctx context.Context, FollowingID uint) ([]*account.Account, error) {
	var relations []Social
	if err := r.db.WithContext(ctx).
		Model(&Social{}).Where("following_id = ?", FollowingID).Limit(200).Find(&relations).Error; err != nil {
		return nil, err
	}
	followerIDs := make([]uint, 0, len(relations))
	for _, rel := range relations {
		followerIDs = append(followerIDs, rel.FollowerID)
	}
	if len(followerIDs) == 0 {
		return []*account.Account{}, nil
	}

	var followers []*account.Account
	if err := r.db.WithContext(ctx).Model(&account.Account{}).Where("id IN ?", followerIDs).Find(&followers).Error; err != nil {
		return nil, err
	}

	return followers, nil
}

func (r *SocialRepository) GetAllFollowings(ctx context.Context, FollowerID uint) ([]*account.Account, error) {
	var relations []Social
	if err := r.db.WithContext(ctx).
		Model(&Social{}).
		Where("follower_id = ?", FollowerID).
		Limit(200).
		Find(&relations).Error; err != nil {
		return nil, err
	}

	followingIDs := make([]uint, 0, len(relations))
	for _, rel := range relations {
		followingIDs = append(followingIDs, rel.FollowingID)
	}
	if len(followingIDs) == 0 {
		return []*account.Account{}, nil
	}

	var followings []*account.Account
	if err := r.db.WithContext(ctx).
		Model(&account.Account{}).
		Where("id IN ?", followingIDs).
		Find(&followings).Error; err != nil {
		return nil, err
	}

	return followings, nil
}

func (r *SocialRepository) IsFollowed(ctx context.Context, social *Social) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&Social{}).Where("follower_id = ? AND following_id = ?", social.FollowerID, social.FollowingID).Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

func (r *SocialRepository) CountFollowers(ctx context.Context, followingID uint) (int64, error) {
	var count int64

	if err := r.db.WithContext(ctx).Model(&Social{}).Where("following_id = ?", followingID).Count(&count).Error; err != nil {
		return 0, err
	}

	return count, nil
}

func (r *SocialRepository) CountFollowings(ctx context.Context, followerID uint) (int64, error) {
	var count int64

	if err := r.db.WithContext(ctx).Model(&Social{}).Where("follower_id = ?", followerID).Count(&count).Error; err != nil {
		return 0, err
	}

	return count, nil
}
