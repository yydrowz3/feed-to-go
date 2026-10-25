package comment

import (
	"context"
	"errors"
	"feed-to-go/internal/services/video"
	"feed-to-go/internal/util"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"
	"log"
	"regexp"
	"strings"

	"gorm.io/gorm"
)

var mentionRegex = regexp.MustCompile(`@(\w+)`)

type CommentService struct {
	repo            *CommentRepository
	VideoRepository *video.VideoRepository
	cache           *cache.Client
	commentMQ       *mq.CommentMQ
	popularityMQ    *mq.PopularityMQ
}

func NewCommentService(repo *CommentRepository, videoRepo *video.VideoRepository, cache *cache.Client, commentMQ *mq.CommentMQ, popularityMQ *mq.PopularityMQ) *CommentService {
	return &CommentService{repo: repo, VideoRepository: videoRepo, cache: cache, commentMQ: commentMQ, popularityMQ: popularityMQ}
}

func (s *CommentService) Publish(ctx context.Context, comment *Comment) error {
	if comment == nil {
		return apierror.ValidationFailed
	}
	comment.Username = strings.TrimSpace(comment.Username)
	comment.Content = strings.TrimSpace(comment.Content)
	if comment.VideoID == 0 || comment.AuthorID == 0 {
		return apierror.ValidationFailed
	}
	if comment.Content == "" {
		return apierror.ValidationFailed
	}

	exists, err := s.VideoRepository.IsExist(ctx, comment.VideoID)
	if err != nil {
		return err
	}
	if !exists {
		return apierror.VideoNotFound
	}

	commentEnqueued := false
	popularityEnqueued := false
	if s.commentMQ != nil {
		if err := s.commentMQ.Publish(ctx, comment.Username, comment.VideoID, comment.AuthorID, comment.Content); err == nil {
			commentEnqueued = true
		}
	}
	if s.popularityMQ != nil {
		if err := s.popularityMQ.Update(ctx, comment.VideoID, 1); err == nil {
			popularityEnqueued = true
		}
	}
	if commentEnqueued && popularityEnqueued {
		s.notifyMentions(ctx, comment)
		return nil
	}

	// Fallback: direct db write when comment MQ publish fails.
	if !commentEnqueued {
		if err := s.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Select("id").First(&video.Video{}, comment.VideoID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return apierror.VideoNotFound
				}
				return err
			}
			if err := tx.Create(comment).Error; err != nil {
				return err
			}
			return tx.Model(&video.Video{}).Where("id = ?", comment.VideoID).
				UpdateColumn("popularity", gorm.Expr("popularity + 1")).Error
		}); err != nil {
			return err
		}
	}

	// Fallback: direct Redis update when popularity MQ publish fails.
	if !popularityEnqueued {
		util.UpdatePopularityCache(ctx, s.cache, comment.VideoID, 1)
	}
	s.notifyMentions(ctx, comment)
	return nil

}

func (s *CommentService) Delete(ctx context.Context, commentID uint, accountID uint) error {
	comment, err := s.repo.GetByID(ctx, commentID)
	if err != nil {
		return err
	}
	if comment == nil {
		return apierror.CommentNotFound
	}
	if comment.AuthorID != accountID {
		return apierror.Forbidden
	}
	if s.commentMQ != nil {
		if err := s.commentMQ.Delete(ctx, commentID); err == nil {
			return nil
		}
	}

	return s.repo.DeleteComment(ctx, comment)
}

func (s *CommentService) GetAll(ctx context.Context, videoID uint) ([]Comment, error) {
	exists, err := s.VideoRepository.IsExist(ctx, videoID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, apierror.VideoNotFound
	}

	return s.repo.GetAllComments(ctx, videoID)
}

func (s *CommentService) notifyMentions(ctx context.Context, comment *Comment) {
	matches := mentionRegex.FindAllStringSubmatch(comment.Content, -1)
	if len(matches) == 0 {
		return
	}
	seen := make(map[string]bool)
	for _, m := range matches {
		username := m[1]
		if seen[username] || username == comment.Username {
			continue
		}
		seen[username] = true
		var accID uint
		if err := s.repo.db.WithContext(ctx).Table("accounts").Where("username = ?", username).Select("id").Scan(&accID).Error; err != nil || accID == 0 {
			continue
		}
		notif := struct {
			RecipientID uint
			SenderID    uint
			Type        string
			TargetID    uint
			Content     string
		}{
			RecipientID: accID,
			SenderID:    comment.AuthorID,
			Type:        "mention",
			TargetID:    comment.VideoID,
			Content:     comment.Username + " mentioned you in a comment.",
		}
		if err := s.repo.db.WithContext(ctx).Table("notifications").Create(&notif).Error; err != nil {
			log.Printf("create mention notification failed: %v", err)
		}
	}
}
