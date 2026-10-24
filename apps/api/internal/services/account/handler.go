package account

import (
	"errors"
	"feed-to-go/internal/util"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AccountHandler struct {
	accountService *AccountService
}

func NewAccountHandler(accountService *AccountService) *AccountHandler {
	return &AccountHandler{accountService: accountService}
}

func (h *AccountHandler) CreateAccount(c *gin.Context) {
	var req CreateAccountRequest
	if err := c.ShouldBindBodyWithJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.accountService.CreateAccount(c.Request.Context(), &Account{
		Username: req.Username,
		Password: req.Password,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "account created"})
}

func (h *AccountHandler) Rename(c *gin.Context) {
	var req RenameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	accountID, err := util.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	token, err := h.accountService.Rename(c.Request.Context(), accountID, req.NewUsername)
	if err != nil {
		if errors.Is(err, ErrNewUsernameRequired) {
			c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, ErrUsernameTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *AccountHandler) ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.accountService.ChangePassword(c.Request.Context(), req.Username, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsuccessfully password changed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "successfully password changed"})
}

func (h *AccountHandler) FindByID(c *gin.Context) {
	var req FindByIDRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if account, err := h.accountService.FindByID(c.Request.Context(), req.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else {
		c.JSON(http.StatusOK, account)
	}
}

func (h *AccountHandler) FindByUsername(c *gin.Context) {
	var req FindByUsernameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if account, err := h.accountService.FindByUsername(c.Request.Context(), req.Username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else {
		c.JSON(http.StatusOK, account)
	}
}

func (h *AccountHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	account, err := h.accountService.FindByUsername(c.Request.Context(), req.Username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		}
		return
	}
	accessToken, refreshToken, err := h.accountService.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) || errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		}
		return
	}
	c.JSON(http.StatusOK, LoginResponse{Token: accessToken, RefreshToken: refreshToken, AccountID: account.ID, Username: account.Username})
}

func (h *AccountHandler) Logout(c *gin.Context) {
	accountID, err := util.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.accountService.Logout(c.Request.Context(), accountID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "account logged out"})
}

func (h *AccountHandler) UploadAvatar(c *gin.Context) {
	accountID, err := util.GetAccountID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	f, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}
	const maxSize = 10 << 20
	if f.Size <= 0 || f.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file size"})
		return
	}
	ext := strings.ToLower(filepath.Ext(f.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .jpg/.jpeg/.png/.webp allowed"})
		return
	}
	dir := filepath.Join(".run", "uploads", "avatars", strconv.FormatUint(uint64(accountID), 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename, err := util.RandHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename = filename + ext
	absPath := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(f, absPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	urlPath := path.Join("/static", "avatars", strconv.FormatUint(uint64(accountID), 10), filename)
	avatarURL := util.BuildAbsoluteURL(c, urlPath)
	if err := h.accountService.UpdateAvatar(c.Request.Context(), accountID, avatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"avatar_url": avatarURL})
}

func (h *AccountHandler) UpdateProfile(c *gin.Context) {
	accountID, err := util.GetAccountID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.accountService.UpdateProfile(c.Request.Context(), accountID, &req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}

func (h *AccountHandler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	newToken, accountID, username, err := h.accountService.RefreshAccessToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}
	c.JSON(http.StatusOK, LoginResponse{Token: newToken, AccountID: accountID, Username: username})
}
