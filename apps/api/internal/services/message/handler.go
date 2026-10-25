package message

import (
	"feed-to-go/internal/auth"
	"feed-to-go/pkg/apierror"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type Service struct{ repo *Repository }
type Handler struct{ service *Service }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Send(c *gin.Context) {
	fromID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	var req SendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.ToID == 0 || strings.TrimSpace(req.Content) == "" {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	m := &Message{FromID: fromID, ToID: req.ToID, Content: req.Content}
	if err := h.service.repo.Send(c.Request.Context(), m); err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *Handler) List(c *gin.Context) {
	userID, err := auth.GetAccountID(c)
	if err != nil {
		apierror.Write(c, apierror.AuthRequired)
		return
	}
	var req ListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	if req.PeerID == 0 {
		apierror.Write(c, apierror.ValidationFailed)
		return
	}
	msgs, err := h.service.repo.List(c.Request.Context(), userID, req.PeerID, 50)
	if err != nil {
		apierror.From(c, err, apierror.AccountNotFound)
		return
	}
	if msgs == nil {
		msgs = []Message{}
	}

	c.JSON(http.StatusOK, ListResponse{Messages: msgs})
}
