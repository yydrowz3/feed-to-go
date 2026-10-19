package like

import (
	"context"
	"errors"
	"feed-to-go/pkg/cache"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

func isDupKey(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// 更新视频流行度缓存
func UpdatePopularityCache(ctx context.Context, cache *cache.Client, id uint, change int64) {
	if cache == nil || id == 0 || change == 0 {
		return
	}
	_ = cache.Del(context.Background(), cache.Key("video:detail:id=%d", id))
	_ = cache.Del(context.Background(), cache.Key("video:entity:%d", id))

	now := time.Now().UTC().Truncate(time.Minute)
	windowKey := cache.Key("hot:video:1m:%s", now.Format("200001011200"))
	member := strconv.FormatUint(uint64(id), 10)

	opCtx, cancel := context.WithTimeout(ctx, 1*time.Minute)
	defer cancel()

	_ = cache.ZincrBy(opCtx, windowKey, member, float64(change))
	_ = cache.Expire(opCtx, windowKey, 2*time.Hour)
}
