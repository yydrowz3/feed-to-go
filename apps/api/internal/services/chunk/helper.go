package chunk

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"feed-to-go/pkg/apierror"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const sessionTTL = 24 * time.Hour

var ErrChunkCacheUnavailable = apierror.UploadServiceUnavailable

func (h *ChunkUploadHandler) sessionKey(uploadID string) string {
	return h.cache.Key("chunk_upload:%s", uploadID)
}

func (h *ChunkUploadHandler) hashKey(accountID uint, fileHash string) string {
	return h.cache.Key("chunk_upload_hash:%d:%s", accountID, fileHash)
}

// 从 redis cache 中 获取 session id
func (h *ChunkUploadHandler) getSession(ctx *gin.Context, uploadID string) (*ChunkUploadSession, error) {
	if h.cache == nil {
		return nil, ErrChunkCacheUnavailable
	}
	b, err := h.cache.GetBytes(ctx.Request.Context(), h.sessionKey(uploadID))
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, apierror.UploadSessionNotFound
		}
		return nil, apierror.Wrap(apierror.UploadServiceUnavailable, err)
	}
	var s ChunkUploadSession
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, apierror.Wrap(apierror.InternalError, err)
	}
	if s.UploadID != uploadID || s.AccountID == 0 || s.TotalChunks <= 0 || len(s.UploadedBits) != s.TotalChunks || s.ChunkSize <= 0 || s.FileSize <= 0 {
		return nil, apierror.InternalError
	}

	return &s, nil
}

func (h *ChunkUploadHandler) saveSession(ctx *gin.Context, s *ChunkUploadSession) error {
	if h.cache == nil {
		return ErrChunkCacheUnavailable
	}
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}

	if err := h.cache.SetBytes(ctx.Request.Context(), h.sessionKey(s.UploadID), b, sessionTTL); err != nil {
		return apierror.Wrap(apierror.UploadServiceUnavailable, err)
	}
	return nil
}

func computeMD5(data []byte) string {
	h := md5.Sum(data)
	return hex.EncodeToString(h[:])
}
