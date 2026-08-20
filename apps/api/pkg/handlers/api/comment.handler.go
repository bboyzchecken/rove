package api

import (
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerCollaborationRoutes covers comments and votes (DEV_SPEC §5.9 / M9).
//
//	GET/POST /trips/:tripId/comments?target_type=&target_id=   [viewer]
//	DELETE   /comments/:id                                     [author or owner]
//	POST     /trips/:tripId/votes                              [viewer]
//	GET      /trips/:tripId/votes                              [viewer]
//
// Commenting is viewer-level on purpose: someone invited to look at a plan
// should be able to say "this day looks packed" without edit rights.
func (s *Server) registerCollaborationRoutes(v1, trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)

	trips.GET("/:tripId/comments", s.handleListComments, viewer)
	trips.POST("/:tripId/comments", s.handleCreateComment, viewer)
	trips.GET("/:tripId/votes", s.handleListVotes, viewer)
	trips.POST("/:tripId/votes", s.handleVote, viewer)

	comments := v1.Group("/comments", s.JwtMiddleware)
	comments.DELETE("/:id", s.handleDeleteComment,
		s.ResolveTrip("id", models.TripRoleViewer, s.commentTrip))
}

// CommentView carries the author inline so a thread renders in one request.
type CommentView struct {
	models.Comment
	Author models.PublicUser `json:"author"`
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
	if targetType != "" && targetID != "" {
		comments, err = s.comments.List(ctx, tripID, targetType, targetID)
	} else {
		// No target means the Discussion tab, which shows the whole trip.
		comments, err = s.comments.ListByTrip(ctx, tripID,
			c.QueryParam("cursor"), atoiDefault(c.QueryParam("limit"), 50))
	}
	if err != nil {
		return request.Internal(c, "อ่านคอมเมนต์ไม่สำเร็จ")
	}

	ids := make([]string, 0, len(comments))
	for _, cm := range comments {
		ids = append(ids, cm.UserID)
	}
	users, _ := s.users.ListByIDs(ctx, ids)
	byID := make(map[string]models.PublicUser, len(users))
	for _, u := range users {
		byID[u.ID] = u.Public()
	}

	views := make([]CommentView, 0, len(comments))
	for _, cm := range comments {
		views = append(views, CommentView{Comment: cm, Author: byID[cm.UserID]})
	}
	return request.OK(c, map[string]any{"items": views})
}

type commentRequest struct {
	TargetType string  `json:"target_type" validate:"required,oneof=trip plan day item wishlist"`
	TargetID   string  `json:"target_id" validate:"required,uuid4"`
	Body       string  `json:"body" validate:"required,max=4000"`
	ParentID   *string `json:"parent_id" validate:"omitempty,uuid4"`
}

func (s *Server) handleCreateComment(c echo.Context) error {
	var req commentRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	comment := &models.Comment{
		TripID: tripID, TargetType: req.TargetType, TargetID: req.TargetID,
		UserID: request.UserID(c), Body: req.Body,
	}
	if req.ParentID != nil {
		// Threads are one level deep: replying to a reply attaches to its
		// parent rather than growing a tree the UI cannot render.
		parent, err := s.comments.Get(ctx, tripID, *req.ParentID)
		if err != nil {
			return request.BadRequest(c, "ไม่พบคอมเมนต์ที่ตอบกลับ")
		}
		root := parent.ID
		if parent.ParentID != nil {
			root = *parent.ParentID
		}
		comment.ParentID = &root
	}

	if err := s.comments.Create(ctx, comment); err != nil {
		return request.Internal(c, "บันทึกคอมเมนต์ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionCommentCreated,
		EventType:  events.TypeCommentCreated,
		TargetType: req.TargetType, TargetID: req.TargetID,
		Meta: map[string]any{"comment_id": comment.ID},
	})

	author, _ := s.users.GetByID(ctx, comment.UserID)
	view := CommentView{Comment: *comment}
	if author != nil {
		view.Author = author.Public()
	}
	return request.Created(c, view)
}

func (s *Server) handleDeleteComment(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	comment, err := s.comments.Get(ctx, tripID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคอมเมนต์")
	}
	if comment.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบได้เฉพาะคอมเมนต์ของตัวเอง")
	}

	if err := s.comments.Delete(ctx, tripID, comment.ID); err != nil {
		return request.Internal(c, "ลบคอมเมนต์ไม่สำเร็จ")
	}
	return request.NoContent(c)
}

type voteRequest struct {
	TargetType string `json:"target_type" validate:"required,oneof=plan item poll"`
	TargetID   string `json:"target_id" validate:"required,uuid4"`
	Choice     string `json:"choice" validate:"required,max=40"`
	Reason     string `json:"reason" validate:"omitempty,max=500"`
}

// handleVote upserts, so changing your mind replaces your vote instead of
// stacking a second one.
func (s *Server) handleVote(c echo.Context) error {
	var req voteRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	vote := &models.Vote{
		TripID: request.TripID(c), TargetType: req.TargetType, TargetID: req.TargetID,
		UserID: request.UserID(c), Choice: req.Choice, Reason: req.Reason,
	}
	if err := s.votes.Upsert(c.Request().Context(), vote); err != nil {
		return request.Internal(c, "บันทึกโหวตไม่สำเร็จ")
	}

	s.emit(c, vote.TripID, emitOpts{
		EventType:  events.TypePlanUpdated,
		TargetType: req.TargetType, TargetID: req.TargetID,
	})
	return request.OK(c, vote)
}

func (s *Server) handleListVotes(c echo.Context) error {
	votes, err := s.votes.List(c.Request().Context(), request.TripID(c),
		c.QueryParam("target_type"), c.QueryParam("target_id"))
	if err != nil {
		return request.Internal(c, "อ่านโหวตไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": votes})
}
