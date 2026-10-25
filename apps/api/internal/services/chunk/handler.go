package chunk

import (
	"crypto/md5"
	"errors"
	"feed-to-go/internal/auth"
	"feed-to-go/internal/util"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type ChunkUploadHandler struct {
	cache *cache.Client
}

func NewChunkUploadHandler(cache *cache.Client) *ChunkUploadHandler {
	return &ChunkUploadHandler{cache: cache}
}

func (h *ChunkUploadHandler) InitChunkUpload(c *gin.Context) {
	if h.cache == nil {
		apierror.Write(c, apierror.UploadServiceUnavailable)
		return
	}

	var req InitChunkUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}

	const maxSize = 200 << 20
	if req.FileSize > maxSize {
		apierror.Write(c, apierror.FileTooLarge)
		return
	}
	if req.TotalChunks != int((req.FileSize-1)/req.ChunkSize+1) {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	// Check for existing session (resume)
	hashKey := h.hashKey(accountID, req.FileHash)
	existingID, err := h.cache.GetBytes(c.Request.Context(), hashKey)
	if err != nil && !errors.Is(err, redis.Nil) {
		apierror.From(c, apierror.Wrap(apierror.UploadServiceUnavailable, err), apierror.UploadSessionNotFound)
		return
	}
	if err == nil && len(existingID) > 0 {
		session, sessErr := h.getSession(c, string(existingID))
		if sessErr == nil {
			// Refresh TTL on resume
			if session.AccountID != accountID {
				apierror.Write(c, apierror.Forbidden)
				return
			}
			if err := h.cache.SetBytes(c.Request.Context(), hashKey, existingID, sessionTTL); err != nil {
				apierror.From(c, apierror.Wrap(apierror.UploadServiceUnavailable, err), apierror.UploadSessionNotFound)
				return
			}
			if err := h.saveSession(c, session); err != nil {
				apierror.From(c, err, apierror.UploadSessionNotFound)
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"upload_id":       session.UploadID,
				"uploaded_chunks": session.UploadedChunks(),
			})
			return
		}
		if !errors.Is(sessErr, apierror.UploadSessionNotFound) {
			apierror.From(c, sessErr, apierror.UploadSessionNotFound)
			return
		}
	}
	id, err := util.RandHex(16)
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	uploadID := id + fmt.Sprintf("%d", time.Now().UnixNano())
	session := &ChunkUploadSession{
		UploadID:     uploadID,
		AccountID:    accountID,
		Filename:     req.Filename,
		FileSize:     req.FileSize,
		ChunkSize:    req.ChunkSize,
		TotalChunks:  req.TotalChunks,
		FileHash:     req.FileHash,
		UploadedBits: make([]bool, req.TotalChunks),
	}

	if err := h.saveSession(c, session); err != nil {
		apierror.From(c, apierror.Wrap(apierror.UploadServiceUnavailable, err), apierror.UploadSessionNotFound)
		return
	}

	if err := h.cache.SetBytes(c.Request.Context(), hashKey, []byte(uploadID), sessionTTL); err != nil {
		apierror.From(c, apierror.Wrap(apierror.UploadServiceUnavailable, err), apierror.UploadSessionNotFound)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_id":       uploadID,
		"uploaded_chunks": []int{},
	})
}

func (h *ChunkUploadHandler) UploadChunk(c *gin.Context) {
	if h.cache == nil {
		apierror.Write(c, apierror.UploadServiceUnavailable)
		return
	}

	var req UploadChunkRequest
	if err := c.ShouldBind(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	session, err := h.getSession(c, req.UploadID)
	if err != nil {
		apierror.From(c, err, apierror.UploadSessionNotFound)
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	if session.AccountID != accountID {
		apierror.Write(c, apierror.Forbidden)
		return
	}
	if req.ChunkIndex < 0 || req.ChunkIndex >= session.TotalChunks {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	if session.UploadedBits[req.ChunkIndex] {
		c.JSON(http.StatusOK, gin.H{"chunk_index": req.ChunkIndex})
		return
	}
	f, err := c.FormFile("file")
	if err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	chunkFile, err := f.Open()
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	defer chunkFile.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, chunkFile); err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	actualHash := fmt.Sprintf("%x", hash.Sum(nil))
	if actualHash != req.ChunkHash {
		apierror.Write(c, apierror.UploadHashMismatch, gin.H{"expected": req.ChunkHash, "actual": actualHash})
		return
	}

	tmpDir := filepath.Join(".run", "uploads", "tmp", req.UploadID)
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}

	chunkPath := filepath.Join(tmpDir, fmt.Sprintf("%d", req.ChunkIndex))
	if _, seekErr := chunkFile.Seek(0, io.SeekStart); seekErr != nil {
		apierror.From(c, seekErr, apierror.InternalError)
		return
	}
	dst, err := os.Create(chunkPath)
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, chunkFile); err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}

	session.UploadedBits[req.ChunkIndex] = true // 只保存到 cache 中
	if err := h.saveSession(c, session); err != nil {
		apierror.From(c, apierror.Wrap(apierror.UploadServiceUnavailable, err), apierror.UploadSessionNotFound)
		return
	}

	c.JSON(http.StatusOK, gin.H{"chunk_index": req.ChunkIndex})
}

func (h *ChunkUploadHandler) ChunkStatus(c *gin.Context) {
	if h.cache == nil {
		apierror.Write(c, apierror.UploadServiceUnavailable)
		return
	}

	var req ChunkStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	session, err := h.getSession(c, req.UploadID)
	if err != nil {
		apierror.From(c, err, apierror.UploadSessionNotFound)
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	if session.AccountID != accountID {
		apierror.Write(c, apierror.Forbidden)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_id":       session.UploadID,
		"uploaded_chunks": session.UploadedChunks(),
		"total_chunks":    session.TotalChunks,
	})

}

func (h *ChunkUploadHandler) CompleteChunkUpload(c *gin.Context) {
	if h.cache == nil {
		apierror.Write(c, apierror.UploadServiceUnavailable)
		return
	}

	var req CompleteChunkUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}

	session, err := h.getSession(c, req.UploadID)
	if err != nil {
		apierror.From(c, err, apierror.UploadSessionNotFound)
		return
	}

	accountID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	if session.AccountID != accountID {
		apierror.Write(c, apierror.Forbidden)
		return
	}

	if !session.IsComplete() {
		missing := 0
		for _, uploaded := range session.UploadedBits {
			if !uploaded {
				missing++
				if missing > 5 {
					missing = 5
					break
				}
			}
		}
		apierror.Write(c, apierror.UploadIncomplete, gin.H{"missing": missing,
			"completed": len(session.UploadedChunks()),
			"total":     session.TotalChunks})
		return
	}

	date := time.Now().Format("20060102")
	relDir := filepath.Join("videos", fmt.Sprintf("%d", accountID), date)
	root := filepath.Join(".run", "uploads")
	absDir := filepath.Join(root, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	filename, err := util.RandHex(16)
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	finalPath := filepath.Join(absDir, filename+".mp4")

	finalFile, err := os.Create(finalPath)
	if err != nil {
		apierror.From(c, err, apierror.InternalError)
		return
	}
	defer finalFile.Close()

	tmpDir := filepath.Join(".run", "uploads", "tmp", req.UploadID)
	for i := 0; i < session.TotalChunks; i++ {
		chunkPath := filepath.Join(tmpDir, fmt.Sprintf("%d", i))
		cf, err := os.Open(chunkPath)
		if err != nil {
			finalFile.Close()
			os.Remove(finalPath)
			apierror.From(c, err, apierror.InternalError)
			return
		}
		_, err = io.Copy(finalFile, cf)
		cf.Close()
		if err != nil {
			finalFile.Close()
			os.Remove(finalPath)
			apierror.From(c, err, apierror.InternalError)
			return
		}
	}
	finalFile.Close()

	// Clean up temp chunks
	_ = os.RemoveAll(tmpDir)

	// Clean up Redis session
	_ = h.cache.Del(c.Request.Context(), h.sessionKey(req.UploadID))
	_ = h.cache.Del(c.Request.Context(), h.hashKey(accountID, session.FileHash))

	urlPath := fmt.Sprintf("/static/videos/%d/%s/%s.mp4", accountID, date, filename)
	playURL := util.BuildAbsoluteURL(c, urlPath)

	c.JSON(http.StatusOK, gin.H{
		"url":      playURL,
		"play_url": playURL,
	})

}
