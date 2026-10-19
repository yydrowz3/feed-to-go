package comment

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/util"
	"net/http"

	"github.com/gin-gonic/gin"
)

type CommentHandler struct {
	service        *CommentService
	accountService *account.AccountService
}

func NewCommentHandler(service *CommentService, accountService *account.AccountService) *CommentHandler {
	return &CommentHandler{service: service, accountService: accountService}
}

func (h *CommentHandler) PublishComment(c *gin.Context) {
	var req PublishCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content is required"})
		return
	}
	if req.VideoID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "video_id is required"})
		return
	}
	authorId, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	user, err := h.accountService.FindByID(c.Request.Context(), authorId)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	comment := &Comment{
		Username: user.Username,
		VideoID:  req.VideoID,
		AuthorID: authorId,
		Content:  req.Content,
	}
	if err := h.service.Publish(c.Request.Context(), comment); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "comment published successfully"})

}

func (h *CommentHandler) DeleteComment(c *gin.Context) {
	var req DeleteCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	accountID, err := auth.GetAccountID(c)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.CommentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "comment_id is required"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), req.CommentID, accountID); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "comment deleted successfully"})
}

func (h *CommentHandler) GetAllComments(c *gin.Context) {
	var req GetAllCommentsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if req.VideoID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "video_id is required"})
		return
	}
	comments, err := h.service.GetAll(c.Request.Context(), req.VideoID)
	if err != nil {
		c.JSON(util.ClassifyHTTPStatus(err), gin.H{"error": err.Error()})
		return
	}
	if comments == nil {
		comments = []Comment{}
	}

	c.JSON(http.StatusOK, comments)
}
