package api

import (
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/hashutil"
)

// registerMemberRoutes covers invites and the member list (DEV_SPEC §5.3).
//
//	POST   /trips/:tripId/invites          [owner]
//	GET    /trips/:tripId/invites          [owner]
//	POST   /invites/:token/accept          [jwt]  — the invitee is not a member yet
//	GET    /invites/:token                 [none] — preview before signing in
//	GET    /trips/:tripId/members          [viewer]
//	PATCH  /trips/:tripId/members/:userId  [owner]
//	DELETE /trips/:tripId/members/:userId  [owner]
func (s *Server) registerMemberRoutes(v1, trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	owner := s.TripRoleMiddleware(models.TripRoleOwner)

	trips.POST("/:tripId/invites", s.handleCreateInvite, owner)
	trips.GET("/:tripId/invites", s.handleListInvites, owner)
	trips.DELETE("/:tripId/invites/:inviteId", s.handleRevokeInvite, owner)
	trips.GET("/:tripId/members", s.handleListMembers, viewer)
	trips.PATCH("/:tripId/members/:userId", s.handleUpdateMemberRole, owner)
	trips.DELETE("/:tripId/members/:userId", s.handleRemoveMember, owner)

	// Guessing invite tokens is the one way into a trip from outside, so this
	// endpoint gets its own tight limit.
	guard := s.RateLimit(RateLimitConfig{Key: "invite", Limit: 30, Window: time.Minute})
	v1.GET("/invites/:token", s.handlePreviewInvite, guard)
	v1.POST("/invites/:token/accept", s.handleAcceptInvite, s.JwtMiddleware, guard)
}

type createInviteRequest struct {
	Role     string `json:"role" validate:"omitempty,oneof=editor viewer"`
	MaxUses  int    `json:"max_uses" validate:"omitempty,min=1,max=50"`
	ExpireIn int    `json:"expire_in_days" validate:"omitempty,min=1,max=90"`
	Email    string `json:"email" validate:"omitempty,email"`
}

// handleCreateInvite mints a link. An invite can never grant owner: a trip has
// exactly one owner and handing that out through a URL is not a thing.
func (s *Server) handleCreateInvite(c echo.Context) error {
	var req createInviteRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	token, err := hashutil.RandomToken(24)
	if err != nil {
		return request.Internal(c, "สร้างลิงก์เชิญไม่สำเร็จ")
	}

	inv := &models.TripInvite{
		TripID:    request.TripID(c),
		Token:     token,
		Role:      orDefaultString(req.Role, models.TripRoleEditor),
		CreatedBy: request.UserID(c),
		MaxUses:   orDefault(req.MaxUses, 20),
	}
	days := orDefault(req.ExpireIn, 14)
	expires := time.Now().UTC().AddDate(0, 0, days)
	inv.ExpiresAt = &expires

	if err := s.invites.Create(c.Request().Context(), inv); err != nil {
		return request.Internal(c, "สร้างลิงก์เชิญไม่สำเร็จ")
	}

	url := strings.TrimRight(s.cfg.WebBaseURL, "/") + "/invite/" + token
	if req.Email != "" {
		s.sendInviteEmail(c, req.Email, url)
	}

	return request.Created(c, map[string]any{
		"invite":     inv,
		"invite_url": url,
	})
}

// sendInviteEmail is best effort: the link is already in the response and the
// UI copies it to the clipboard, so a mail failure must not fail the request.
func (s *Server) sendInviteEmail(c echo.Context, to, url string) {
	trip, err := s.trips.GetByID(c.Request().Context(), request.TripID(c))
	if err != nil {
		return
	}
	body := `<p>คุณถูกชวนให้ร่วมวางแผนทริป <b>` + trip.Title + `</b></p>` +
		`<p><a href="` + url + `">กดที่นี่เพื่อเข้าร่วม</a></p>`
	_ = s.email.Send(c.Request().Context(), to, "ชวนร่วมวางแผนทริป", body)
}

func (s *Server) handleListInvites(c echo.Context) error {
	invites, err := s.invites.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "อ่านลิงก์เชิญไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": invites})
}

func (s *Server) handleRevokeInvite(c echo.Context) error {
	err := s.invites.Revoke(c.Request().Context(), request.TripID(c), c.Param("inviteId"))
	if err != nil {
		return request.Internal(c, "ยกเลิกลิงก์เชิญไม่สำเร็จ")
	}
	return request.NoContent(c)
}

// handlePreviewInvite lets the invite page show what the user is joining before
// asking them to sign in. It exposes the title and who invited them, nothing
// that would make a guessed token worth having.
func (s *Server) handlePreviewInvite(c echo.Context) error {
	inv, err := s.invites.GetByToken(c.Request().Context(), c.Param("token"))
	if err != nil {
		return request.NotFound(c, "ลิงก์เชิญไม่ถูกต้อง")
	}
	if !inv.Usable(time.Now().UTC()) {
		return request.Error(c, 410, "ลิงก์เชิญหมดอายุหรือถูกใช้ครบแล้ว")
	}

	trip, err := s.trips.GetByID(c.Request().Context(), inv.TripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	memberCount, _ := s.members.CountByTrip(c.Request().Context(), inv.TripID)

	return request.OK(c, map[string]any{
		"trip_id":      trip.ID,
		"title":        trip.Title,
		"start_date":   trip.StartDate,
		"end_date":     trip.EndDate,
		"member_count": memberCount,
		"role":         inv.Role,
	})
}

func (s *Server) handleAcceptInvite(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	inv, err := s.invites.GetByToken(ctx, c.Param("token"))
	if err != nil {
		return request.NotFound(c, "ลิงก์เชิญไม่ถูกต้อง")
	}
	if !inv.Usable(time.Now().UTC()) {
		return request.Error(c, 410, "ลิงก์เชิญหมดอายุหรือถูกใช้ครบแล้ว")
	}

	// Accepting twice is a normal thing to do (people re-open the link), so it
	// returns the trip rather than an error.
	if existing, err := s.members.Get(ctx, inv.TripID, userID); err == nil {
		return request.OK(c, map[string]any{
			"trip_id": inv.TripID, "role": existing.Role, "already_member": true,
		})
	}

	member := &models.TripMember{
		TripID: inv.TripID, UserID: userID,
		Role: inv.Role, JoinedAt: time.Now().UTC(),
	}
	if err := s.members.Add(ctx, member); err != nil {
		return request.Internal(c, "เข้าร่วมทริปไม่สำเร็จ")
	}
	if err := s.invites.MarkUsed(ctx, inv.ID); err != nil {
		// The user is already in; a miscounted invite is not worth failing on.
		_ = err
	}

	s.emit(c, inv.TripID, emitOpts{
		Action:     models.ActionMemberJoined,
		EventType:  events.TypeMemberJoined,
		TargetType: "member", TargetID: userID,
	})
	return request.OK(c, map[string]any{
		"trip_id": inv.TripID, "role": inv.Role, "already_member": false,
	})
}

func (s *Server) handleListMembers(c echo.Context) error {
	members, err := s.memberViews(c, request.TripID(c))
	if err != nil {
		return request.Internal(c, "อ่านสมาชิกไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": members})
}

type updateRoleRequest struct {
	Role string `json:"role" validate:"required,oneof=editor viewer owner"`
}

// handleUpdateMemberRole also handles ownership transfer: promoting someone to
// owner demotes the current owner, because two owners is not a state this
// product has a UI for.
func (s *Server) handleUpdateMemberRole(c echo.Context) error {
	var req updateRoleRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	targetID := c.Param("userId")
	actorID := request.UserID(c)

	if targetID == actorID && req.Role != models.TripRoleOwner {
		return request.BadRequest(c, "เจ้าของทริปลดสิทธิ์ตัวเองไม่ได้ ให้โอนสิทธิ์ให้คนอื่นก่อน")
	}
	if _, err := s.members.Get(ctx, tripID, targetID); err != nil {
		return request.NotFound(c, "ไม่พบสมาชิกคนนี้ในทริป")
	}

	if req.Role == models.TripRoleOwner {
		if err := s.transferOwnership(c, tripID, actorID, targetID); err != nil {
			return request.Internal(c, "โอนสิทธิ์เจ้าของไม่สำเร็จ")
		}
	} else if err := s.members.UpdateRole(ctx, tripID, targetID, req.Role); err != nil {
		return request.Internal(c, "เปลี่ยนสิทธิ์ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionMemberRoleSet,
		EventType:  events.TypeMemberJoined,
		TargetType: "member", TargetID: targetID,
		Meta: map[string]any{"role": req.Role},
	})
	return request.OK(c, map[string]any{"user_id": targetID, "role": req.Role})
}

func (s *Server) transferOwnership(c echo.Context, tripID, fromUserID, toUserID string) error {
	ctx := c.Request().Context()
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.TripMember{}).
			Where("trip_id = ? AND user_id = ?", tripID, toUserID).
			Update("role", models.TripRoleOwner).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.TripMember{}).
			Where("trip_id = ? AND user_id = ?", tripID, fromUserID).
			Update("role", models.TripRoleEditor).Error; err != nil {
			return err
		}
		return tx.Model(&models.Trip{}).
			Where("id = ?", tripID).
			Update("owner_id", toUserID).Error
	})
}

func (s *Server) handleRemoveMember(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	targetID := c.Param("userId")

	target, err := s.members.Get(ctx, tripID, targetID)
	if err != nil {
		return request.NotFound(c, "ไม่พบสมาชิกคนนี้ในทริป")
	}
	// Removing the owner would leave a trip nobody can administer.
	if target.Role == models.TripRoleOwner {
		return request.BadRequest(c, "ลบเจ้าของทริปไม่ได้ ให้โอนสิทธิ์ก่อน")
	}

	if err := s.members.Remove(ctx, tripID, targetID); err != nil {
		return request.Internal(c, "ลบสมาชิกไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionMemberRemoved,
		EventType:  events.TypeMemberRemoved,
		TargetType: "member", TargetID: targetID,
	})
	return request.NoContent(c)
}

func orDefaultString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
