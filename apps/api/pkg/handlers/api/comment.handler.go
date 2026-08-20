package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Comments, votes and the activity feed (M9 — A9.1, A2.4).
func (s *Server) registerCollaborationRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/comments", s.handleListComments, view)
	g.POST("/:tripId/comments", s.handleCreateComment, edit)
	g.PATCH("/:tripId/comments/:commentId", s.handleUpdateComment, edit)
	g.DELETE("/:tripId/comments/:commentId", s.handleDeleteComment, edit)

	g.GET("/:tripId/votes", s.handleListVotes, view)
	g.POST("/:tripId/votes", s.handleVote, edit)

	g.GET("/:tripId/activity", s.handleActivity, view)
}

func (s *Server) handleListComments(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	targetType := c.QueryParam("target_type")
	targetID := c.QueryParam("target_id")

	var (
		comments []models.Comment
		err      error
	)
	if targetType == "" || targetID == "" {
		// No target means "everything in this room", which is what the
		// Discussion tab's unread badge needs.
		comments, err = s.collab.ListTripComments(ctx, tripID)
	} else {
		comments, err = s.collab.ListComments(ctx, tripID, targetType, targetID)
	}
	if err != nil {
		return request.Internal(c, "โหลดคอมเมนต์ไม่สำเร็จ")
	}

	out := make([]commentDTO, 0, len(comments))
	for _, comment := range comments {
		out = append(out, toCommentDTO(comment))
	}
	return c.JSON(http.StatusOK, out)
}

type commentRequest struct {
	TargetType string `json:"target_type" validate:"required,oneof=trip day item wish"`
	TargetID   string `json:"target_id" validate:"required"`
	Body       string `json:"body" validate:"required"`
}

func (s *Server) handleCreateComment(c echo.Context) error {
	var req commentRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	comment := &models.Comment{
		TripID:     tripID,
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		UserID:     request.UserID(c),
		Body:       req.Body,
	}
	if err := s.collab.CreateComment(ctx, comment); err != nil {
		return request.Internal(c, "ส่งคอมเมนต์ไม่สำเร็จ")
	}

	s.track(c, tripID, "คอมเมนต์ในแพลน", events.TypeCommentCreated, req.TargetType, req.TargetID)
	return c.JSON(http.StatusCreated, toCommentDTO(*comment))
}

type updateCommentRequest struct {
	Body     *string `json:"body"`
	Resolved *bool   `json:"resolved"`
}

func (s *Server) handleUpdateComment(c echo.Context) error {
	var req updateCommentRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	comment, err := s.collab.GetComment(ctx, tripID, c.Param("commentId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคอมเมนต์นี้")
	}

	// Anyone in the room may mark a thread settled — that is a group decision.
	// Editing the words is only for the person who wrote them.
	if req.Body != nil {
		if comment.UserID != request.UserID(c) {
			return request.Forbidden(c, "แก้ข้อความของคนอื่นไม่ได้")
		}
		comment.Body = *req.Body
	}
	if req.Resolved != nil {
		comment.Resolved = *req.Resolved
	}

	if err := s.collab.UpdateComment(ctx, comment); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toCommentDTO(*comment))
}

func (s *Server) handleDeleteComment(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	comment, err := s.collab.GetComment(ctx, tripID, c.Param("commentId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคอมเมนต์นี้")
	}
	if comment.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบคอมเมนต์ของคนอื่นไม่ได้")
	}

	if err := s.collab.DeleteComment(ctx, tripID, comment.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

/* ----------------------------------------------------------------- votes -- */

func (s *Server) handleListVotes(c echo.Context) error {
	votes, err := s.collab.ListVotes(
		c.Request().Context(),
		request.TripID(c),
		c.QueryParam("target_type"),
		c.QueryParam("target_id"),
	)
	if err != nil {
		return request.Internal(c, "โหลดโหวตไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toVoteDTOs(votes))
}

type voteRequest struct {
	TargetType string `json:"target_type" validate:"required"`
	TargetID   string `json:"target_id" validate:"required"`
	Value      int    `json:"value"`
}

func (s *Server) handleVote(c echo.Context) error {
	var req voteRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Value != 1 && req.Value != -1 {
		return request.BadRequest(c, "ค่าโหวตต้องเป็น 1 หรือ -1")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	err := s.collab.SetVote(ctx, &models.Vote{
		TripID:     tripID,
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		UserID:     request.UserID(c),
		Value:      req.Value,
	})
	if err != nil {
		return request.Internal(c, "โหวตไม่สำเร็จ")
	}

	votes, err := s.collab.ListVotes(ctx, tripID, req.TargetType, req.TargetID)
	if err != nil {
		return request.Internal(c, "โหลดโหวตไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toVoteDTOs(votes))
}

func toVoteDTOs(votes []models.Vote) []voteDTO {
	out := make([]voteDTO, 0, len(votes))
	for _, v := range votes {
		out = append(out, voteDTO{
			TargetType: v.TargetType,
			TargetID:   v.TargetID,
			UserID:     v.UserID,
			Value:      v.Value,
		})
	}
	return out
}

/* -------------------------------------------------------------- activity -- */

// handleActivity is keyset-paginated: the feed grows at the top while someone
// is scrolling it, and an offset would show them the same row twice.
func (s *Server) handleActivity(c echo.Context) error {
	entries, err := s.collab.ListActivity(
		c.Request().Context(),
		request.TripID(c),
		c.QueryParam("cursor"),
		30,
	)
	if err != nil {
		return request.Internal(c, "โหลดความเคลื่อนไหวไม่สำเร็จ")
	}

	out := make([]activityDTO, 0, len(entries))
	for _, entry := range entries {
		out = append(out, toActivityDTO(entry))
	}
	return c.JSON(http.StatusOK, out)
}
