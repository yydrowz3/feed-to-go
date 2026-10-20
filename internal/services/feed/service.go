package feed

import (
	"context"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/cache"
	"time"

	"golang.org/x/sync/singleflight"

	localCache "github.com/patrickmn/go-cache"
)

type FeedService struct {
	repo         *FeedRepository
	likeRepo     *like.LikeRepository
	rediscache   *cache.Client
	localcache   *localCache.Cache
	cacheTTL     time.Duration
	requestGroup singleflight.Group
}

type CacheFeedData struct {
	PublicVideos []video.Video `json:"public_videos"`
}

func NewFeedService(repo *FeedRepository, likeRepo *like.LikeRepository, rediscache *cache.Client) *FeedService {
	return &FeedService{
		repo:       repo,
		likeRepo:   likeRepo,
		rediscache: rediscache,
		localcache: localCache.New(3*time.Second, 5*time.Second),
		cacheTTL:   24 * time.Hour,
	}
}

// GetVideoByIDs 批量获取视频信息
// 采用 L1(本地缓存) -> L2(Redis) -> L3(MySQL) 三级架构
func (f *FeedService) GetVideoByIDs(ctx context.Context, videoIDs []uint) ([]*video.Video, error) {

}

// 查询最新视频 (冷热分离 + 游标分页)
func (f *FeedService) ListLatest(ctx context.Context, limit int, latestBefore time.Time, viewerAccountID uint) (ListLatestResponse, error) {

}

func (f *FeedService) ListLatestFromDB(ctx context.Context, limit int, latestBefore time.Time, viewerAccountID uint) (ListLatestResponse, error) {

}

// 按照点赞数查询视频
func (f *FeedService) ListLikesCount(ctx context.Context, limit int, cursor *LikesCountCursor, viewerAccountID uint) (ListLikesCountResponse, error) {

}

// 按照关注列表查询视频
func (f *FeedService) ListByFollowing(ctx context.Context, limit int, latestBefore time.Time, viewerAccountID uint) (ListByFollowingResponse, error) {

}

func (f *FeedService) ListByPopularity(ctx context.Context, limit int, reqAsOf int64, offset int, viewerAccountID uint, latestPopularity int64, latestBefore time.Time, latestIDBefore uint) (ListByPopularityResponse, error) {

}

func (f *FeedService) ListByTag(ctx context.Context, tagName string, limit int, viewerAccountID uint) ([]FeedVideoItem, error) {

}
