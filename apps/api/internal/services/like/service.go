package like

import (
	"context"
	"errors"
	"feed-to-go/internal/services/video"
	"feed-to-go/internal/util"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"
	"time"

	"gorm.io/gorm"
)

type LikeService struct {
	repo         *LikeRepository
	VideoRepo    *video.VideoRepository
	cache        *cache.Client
	likeMQ       *mq.LikeMQ
	popularityMQ *mq.PopularityMQ
}

func NewLikeService(repo *LikeRepository, videoRepo *video.VideoRepository, cache *cache.Client, likeMQ *mq.LikeMQ, popularityMQ *mq.PopularityMQ) *LikeService {
	return &LikeService{repo: repo, VideoRepo: videoRepo, cache: cache, likeMQ: likeMQ, popularityMQ: popularityMQ}
}

func (s *LikeService) Like(ctx context.Context, like *Like) error {
	if like == nil {
		return apierror.ValidationFailed
	}
	if like.VideoID == 0 || like.AccountID == 0 {
		return apierror.ValidationFailed
	}

	if s.VideoRepo != nil {
		ok, err := s.VideoRepo.IsExist(ctx, like.VideoID)
		if err != nil {
			return err
		}
		if !ok {
			return apierror.VideoNotFound
		}
	}

	isLiked, err := s.repo.IsLiked(ctx, like.VideoID, like.AccountID)
	if err != nil {
		return err
	}
	if isLiked {
		return apierror.AlreadyLiked
	}

	like.CreatedAt = time.Now()
	likeEnqueued := false
	popularityEnqueued := false
	if s.likeMQ != nil {
		// db update
		if err := s.likeMQ.Like(ctx, like.AccountID, like.VideoID); err == nil {
			likeEnqueued = true
		}
	}
	if s.popularityMQ != nil {
		// redis Update
		if err := s.popularityMQ.Update(ctx, like.VideoID, 1); err == nil {
			popularityEnqueued = true
		}
	}
	if likeEnqueued && popularityEnqueued {
		return nil
	}

	// Fallback: direct db write when like MQ publish fails.
	if !likeEnqueued {
		err := s.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Select("id").First(&video.Video{}, like.VideoID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return apierror.VideoNotFound
				}
				return err
			}
			if err := tx.Create(like).Error; err != nil {
				if isDupKey(err) {
					return apierror.AlreadyLiked
				}
				return err
			}
			if err := tx.Model(&video.Video{}).Where("id = ?", like.VideoID).
				UpdateColumn("likes_count", gorm.Expr("likes_count + 1")).Error; err != nil {
				return err
			}
			return tx.Model(&video.Video{}).Where("id = ?", like.VideoID).
				UpdateColumn("popularity", gorm.Expr("popularity + 1")).Error
		})
		if err != nil {
			return err
		}
	}

	// Fallback: direct Redis update when popularity MQ publish fails.
	if !popularityEnqueued {
		util.UpdatePopularityCache(ctx, s.cache, like.VideoID, 1)
	}

	return nil
}

func (s *LikeService) Unlike(ctx context.Context, like *Like) error {
	if like == nil {
		return apierror.ValidationFailed
	}
	if like.VideoID == 0 || like.AccountID == 0 {
		return apierror.ValidationFailed
	}

	if s.VideoRepo != nil {
		ok, err := s.VideoRepo.IsExist(ctx, like.VideoID)
		if err != nil {
			return err
		}
		if !ok {
			return apierror.VideoNotFound
		}
	}

	isLiked, err := s.repo.IsLiked(ctx, like.VideoID, like.AccountID)
	if err != nil {
		return err
	}
	if !isLiked {
		return apierror.NotLiked
	}

	likeEnqueued := false
	popularityEnqueued := false
	if s.likeMQ != nil {
		if err := s.likeMQ.Unlike(ctx, like.AccountID, like.VideoID); err == nil {
			likeEnqueued = true
		}
	}
	if s.popularityMQ != nil {
		if err := s.popularityMQ.Update(ctx, like.VideoID, -1); err == nil {
			popularityEnqueued = true
		}
	}
	if likeEnqueued && popularityEnqueued {
		return nil
	}

	// Fallback: direct db write when like MQ publish fails.
	if !likeEnqueued {
		err := s.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			del := tx.Where("video_id = ? AND account_id = ?", like.VideoID, like.AccountID).Delete(&Like{})
			if del.Error != nil {
				return del.Error
			}
			if del.RowsAffected == 0 {
				return apierror.NotLiked
			}

			if err := tx.Model(&video.Video{}).Where("id = ?", like.VideoID).
				UpdateColumn("likes_count", gorm.Expr("GREATEST(likes_count - 1, 0)")).Error; err != nil {
				return err
			}
			return tx.Model(&video.Video{}).Where("id = ?", like.VideoID).
				UpdateColumn("popularity", gorm.Expr("GREATEST(popularity - 1, 0)")).Error
		})
		if err != nil {
			return err
		}
	}

	// Fallback: direct Redis update when popularity MQ publish fails.
	if !popularityEnqueued {
		util.UpdatePopularityCache(ctx, s.cache, like.VideoID, -1)
	}

	return nil
}

func (s *LikeService) IsLiked(ctx context.Context, videoID, accountID uint) (bool, error) {
	return s.repo.IsLiked(ctx, videoID, accountID)
}

func (s *LikeService) ListLikedVideos(ctx context.Context, accountID uint) ([]video.Video, error) {
	return s.repo.ListLikedVideos(ctx, accountID)
}
