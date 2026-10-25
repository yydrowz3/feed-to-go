package social

import (
	"context"
	"feed-to-go/internal/services/account"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"log"
)

type SocialService struct {
	repo        *SocialRepository
	accountRepo *account.AccountRepository
	socialMQ    *mq.SocialMQ
	cache       *cache.Client
}

func NewSocialService(repo *SocialRepository, accountRepo *account.AccountRepository, socialMQ *mq.SocialMQ, cache *cache.Client) *SocialService {
	return &SocialService{repo: repo, accountRepo: accountRepo, socialMQ: socialMQ, cache: cache}
}

func (s *SocialService) Follow(ctx context.Context, social *Social) error {
	_, err := s.accountRepo.FindByID(ctx, social.FollowerID)
	if err != nil {
		return err
	}
	_, err = s.accountRepo.FindByID(ctx, social.FollowingID)
	if err != nil {
		return err
	}
	if social.FollowerID == social.FollowingID {
		return apierror.SelfFollowNotAllowed
	}
	isFollowed, err := s.repo.IsFollowed(ctx, social)
	if err != nil {
		return err
	}
	if isFollowed {
		return apierror.AlreadyFollowed
	}

	// 先写 DB，确保数据持久化
	if err := s.repo.Follow(ctx, social); err != nil {
		return err
	}

	// DB 成功后，失效该用户的关注列表缓存
	s.invalidateFollowingFeedCache(context.Background(), social.FollowerID)

	// 最后发 MQ（用于通知），失败只记日志不影响业务
	if s.socialMQ != nil {
		if err := s.socialMQ.Follow(ctx, social.FollowerID, social.FollowingID); err != nil {
			logging.Sugar.Warnf("social MQ Follow 发布失败: %v", err)
		}
	}

	return nil
}

func (s *SocialService) Unfollow(ctx context.Context, social *Social) error {
	_, err := s.accountRepo.FindByID(ctx, social.FollowerID)
	if err != nil {
		return err
	}
	_, err = s.accountRepo.FindByID(ctx, social.FollowingID)
	if err != nil {
		return err
	}
	isFollowed, err := s.repo.IsFollowed(ctx, social)
	if err != nil {
		return err
	}
	if !isFollowed {
		return apierror.NotFollowing
	}

	// 先写 DB
	if err := s.repo.Unfollow(ctx, social); err != nil {
		return err
	}

	// 失效缓存
	s.invalidateFollowingFeedCache(context.Background(), social.FollowerID)

	// 最后发 MQ
	if s.socialMQ != nil {
		if err := s.socialMQ.UnFollow(ctx, social.FollowerID, social.FollowingID); err != nil {
			log.Printf("social MQ UnFollow 发布失败: %v", err)
		}
	}

	return nil
}

func (s *SocialService) invalidateFollowingFeedCache(ctx context.Context, accountID uint) {
	if s.cache == nil {
		return
	}

	pattern := s.cache.Key("feed:listByFollowing:*:accountID=%d:*", accountID)

	if err := s.cache.DelByPattern(ctx, pattern); err != nil {
		logging.Sugar.Warnf("失效 Following 缓存失败: accountID=%d, err=%v", accountID, err)
	}
}

func (s *SocialService) GetAllFollowers(ctx context.Context, FollowingID uint) ([]*account.Account, error) {
	_, err := s.accountRepo.FindByID(ctx, FollowingID)

	if err != nil {
		return nil, err
	}

	return s.repo.GetAllFollowers(ctx, FollowingID)
}

func (s *SocialService) GetAllFollowings(ctx context.Context, FollowerID uint) ([]*account.Account, error) {
	_, err := s.accountRepo.FindByID(ctx, FollowerID)

	if err != nil {
		return nil, err
	}

	return s.repo.GetAllFollowings(ctx, FollowerID)
}

func (s *SocialService) CountFollowers(ctx context.Context, followingID uint) (int64, error) {
	return s.repo.CountFollowers(ctx, followingID)
}

func (s *SocialService) CountFollowings(ctx context.Context, followerID uint) (int64, error) {
	return s.repo.CountFollowings(ctx, followerID)
}

func (s *SocialService) IsFollowed(ctx context.Context, social *Social) (bool, error) {
	_, err := s.accountRepo.FindByID(ctx, social.FollowerID)
	if err != nil {
		return false, err
	}

	_, err = s.accountRepo.FindByID(ctx, social.FollowingID)
	if err != nil {
		return false, err
	}

	return s.repo.IsFollowed(ctx, social)
}
