package comment

import (
	"feed-to-go/internal/auth"
	"feed-to-go/internal/services/account"
	"feed-to-go/pkg/apierror"
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
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.Content == "" {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.VideoID <= 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	authorId, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	user, err := h.accountService.FindByID(c.Request.Context(), authorId)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	comment := &Comment{
		Username: user.Username,
		VideoID:  req.VideoID,
		AuthorID: authorId,
		Content:  req.Content,
	}
	if err := h.service.Publish(c.Request.Context(), comment); err != nil {
		apierror.From(c, err, apierror.CommentNotFound)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "comment published successfully"})

}

func (h *CommentHandler) DeleteComment(c *gin.Context) {
	var req DeleteCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	accountID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	if req.CommentID <= 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if err := h.service.Delete(c.Request.Context(), req.CommentID, accountID); err != nil {
		apierror.From(c, err, apierror.CommentNotFound)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "comment deleted successfully"})
}

func (h *CommentHandler) GetAllComments(c *gin.Context) {
	var req GetAllCommentsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.VideoID == 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	comments, err := h.service.GetAll(c.Request.Context(), req.VideoID)
	if err != nil {
		apierror.From(c, err, apierror.CommentNotFound)
		return
	}
	if comments == nil {
		comments = []Comment{}
	}

	c.JSON(http.StatusOK, comments)
}
