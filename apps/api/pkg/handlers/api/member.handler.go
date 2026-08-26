package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/str"
)

// Members and invites (A2.2 / A2.3).
func (s *Server) registerMemberRoutes(g *echo.Group) {
	g.GET("/:tripId/members", s.handleListMembers, s.TripRoleMiddleware(models.TripRoleViewer))
	// Trip-scoped member profiles (A3.1). Everyone reads the roster's profiles;
	// each member writes only their own, so the guard is editor + "me" routes.
	g.GET("/:tripId/profile/me", s.handleMyTripProfile, s.TripRoleMiddleware(models.TripRoleViewer))
	g.PUT("/:tripId/profile/me", s.handleSaveTripProfile, s.TripRoleMiddleware(models.TripRoleEditor))
	g.GET("/:tripId/profiles", s.handleListTripProfiles, s.TripRoleMiddleware(models.TripRoleViewer))
	// Owner-only, per the API contract in DEV_SPEC §7: an editor who could mint
	// invite links could widen the set of people with write access to someone
	// else's trip without asking them.
	g.POST("/:tripId/invites", s.handleCreateInvite, s.TripRoleMiddleware(models.TripRoleOwner))
	g.PATCH("/:tripId/members/:userId", s.handleUpdateMemberRole, s.TripRoleMiddleware(models.TripRoleOwner))
	g.DELETE("/:tripId/members/:userId", s.handleRemoveMember, s.TripRoleMiddleware(models.TripRoleOwner))
}

// registerInviteRoutes is mounted outside the trip group: accepting an invite
// is the one trip action taken by someone who is not yet a member.
func (s *Server) registerInviteRoutes(g *echo.Group) {
	g.POST("/invites/:token/join", s.handleJoinTrip, s.JwtMiddleware)
	g.GET("/invites/:token", s.handleInvitePreview)
}

func (s *Server) handleListMembers(c echo.Context) error {
	roster, err := s.loadMembers(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, roster.dtos())
}

type createInviteRequest struct {
	Role string `json:"role" validate:"omitempty,oneof=editor viewer"`
}

func (s *Server) handleCreateInvite(c echo.Context) error {
	var req createInviteRequest
	_ = c.Bind(&req)
	if req.Role == "" {
		req.Role = models.TripRoleEditor
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	invite := &models.Invite{
		TripID:    tripID,
		Token:     str.RandomToken(32),
		Role:      req.Role,
		CreatedBy: request.UserID(c),
		// A week is long enough to be pasted into a chat and acted on, short
		// enough that an old screenshot stops working.
		ExpiresAt: time.Now().UTC().Add(7 * 24 * time.Hour),
	}
	if err := s.invites.Create(ctx, invite); err != nil {
		return request.Internal(c, "สร้างลิงก์เชิญไม่สำเร็จ")
	}

	return c.JSON(http.StatusCreated, inviteDTO{
		Token:     invite.Token,
		URL:       s.cfg.WebBaseURL + "/invite/" + invite.Token,
		ExpiresAt: invite.ExpiresAt.Format(time.RFC3339),
		Role:      invite.Role,
	})
}

// handleInvitePreview lets the landing page show what is being joined before
// asking anyone to sign in. It deliberately reveals only the title.
func (s *Server) handleInvitePreview(c echo.Context) error {
	ctx := c.Request().Context()

	invite, err := s.invites.GetByToken(ctx, c.Param("token"))
	if err != nil {
		return request.NotFound(c, "ลิงก์เชิญนี้ใช้ไม่ได้แล้ว")
	}
	if invite.RevokedAt != nil || time.Now().After(invite.ExpiresAt) {
		return request.NotFound(c, "ลิงก์เชิญหมดอายุแล้ว")
	}

	trip, err := s.trips.GetByID(ctx, invite.TripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	return c.JSON(http.StatusOK, map[string]any{
		"trip_id":    trip.ID,
		"title":      trip.Title,
		"role":       invite.Role,
		"expires_at": invite.ExpiresAt.Format(time.RFC3339),
	})
}

func (s *Server) handleJoinTrip(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	invite, err := s.invites.GetByToken(ctx, c.Param("token"))
	if err != nil {
		return request.NotFound(c, "ลิงก์เชิญนี้ใช้ไม่ได้แล้ว")
	}
	if invite.RevokedAt != nil || time.Now().After(invite.ExpiresAt) {
		return request.NotFound(c, "ลิงก์เชิญหมดอายุแล้ว")
	}

	// Already in? Say so cheerfully and send them to the room.
	if _, err := s.members.Get(ctx, invite.TripID, userID); err == nil {
		return c.JSON(http.StatusOK, map[string]string{"tripId": invite.TripID})
	}

	if err := s.members.Add(ctx, &models.TripMember{
		TripID: invite.TripID,
		UserID: userID,
		Role:   invite.Role,
	}); err != nil {
		return request.Internal(c, "เข้าร่วมทริปไม่สำเร็จ")
	}
	_ = s.invites.MarkUsed(ctx, invite.ID)

	name := "เพื่อนใหม่"
	if user, err := s.users.GetByID(ctx, userID); err == nil {
		if user.DisplayName != "" {
			name = user.DisplayName
		}
		// The referral pays out on the first trip joined, not on sign-up: an
		// account that never joins anything is not worth points (§6.5).
		if user.ReferredBy != nil && *user.ReferredBy != "" {
			_ = s.points.Add(ctx, &models.UserPoints{
				UserID: *user.ReferredBy,
				Delta:  domain.PointsPerReferral,
				Reason: models.PointsReasonReferral,
				Note:   name + " เข้าร่วมทริปแรก",
				TripID: &invite.TripID,
			})
		}
	}

	_ = s.collab.Log(ctx, &models.Activity{
		TripID: invite.TripID,
		UserID: userID,
		Text:   name + " เข้าร่วมทริป",
	})
	_ = s.hub.Publish(ctx, invite.TripID, events.Event{
		Type:       events.TypeMemberJoined,
		TargetType: "member",
		TargetID:   userID,
		ActorID:    userID,
		TS:         time.Now().UTC(),
	})

	// The party size follows the room: someone joining is someone travelling.
	if trip, err := s.trips.GetByID(ctx, invite.TripID); err == nil {
		if members, err := s.members.ListByTrip(ctx, invite.TripID); err == nil && len(members) > trip.PartySize {
			trip.PartySize = len(members)
			_ = s.trips.Update(ctx, trip)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"tripId": invite.TripID})
}

/* ----------------------------------------------- member profiles (A3.1) -- */

type memberProfileDTO struct {
	UserID        string   `json:"user_id"`
	VisitedBefore bool     `json:"visited_before"`
	Pace          string   `json:"pace"`
	WalkLevel     int      `json:"walk_level"`
	CanDrive      bool     `json:"can_drive"`
	HasIDP        bool     `json:"has_idp"`
	BudgetMinTHB  int      `json:"budget_min_thb"`
	BudgetMaxTHB  int      `json:"budget_max_thb"`
	Dietary       []string `json:"dietary"`
	Notes         string   `json:"notes"`
	// False when this is the default the API synthesised — the tab uses it to
	// nudge "ยังไม่ได้บอกสไตล์เที่ยวของคุณ".
	Filled bool `json:"filled"`
}

func toMemberProfileDTO(p models.MemberProfile, filled bool) memberProfileDTO {
	dietary := jsonStrings(toJSONRaw(p.Dietary))
	if dietary == nil {
		dietary = []string{}
	}
	return memberProfileDTO{
		UserID:        p.UserID,
		VisitedBefore: p.VisitedBefore,
		Pace:          p.Pace,
		WalkLevel:     p.WalkLevel,
		CanDrive:      p.CanDrive,
		HasIDP:        p.HasIDP,
		BudgetMinTHB:  p.BudgetMinTHB,
		BudgetMaxTHB:  p.BudgetMaxTHB,
		Dietary:       dietary,
		Notes:         p.Notes,
		Filled:        filled,
	}
}

// defaultMemberProfile is what "no row yet" looks like — the form opens with
// sane middles instead of zeros.
func defaultMemberProfile(userID string) models.MemberProfile {
	return models.MemberProfile{
		UserID:    userID,
		Pace:      models.PaceBalanced,
		WalkLevel: 2,
	}
}

func (s *Server) handleMyTripProfile(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	profile, err := s.members.GetProfile(ctx, request.TripID(c), userID)
	if err != nil {
		fallback := defaultMemberProfile(userID)
		return c.JSON(http.StatusOK, toMemberProfileDTO(fallback, false))
	}
	return c.JSON(http.StatusOK, toMemberProfileDTO(*profile, true))
}

type saveProfileRequest struct {
	VisitedBefore bool     `json:"visited_before"`
	Pace          string   `json:"pace" validate:"omitempty,oneof=relaxed balanced packed"`
	WalkLevel     int      `json:"walk_level" validate:"omitempty,min=1,max=3"`
	CanDrive      bool     `json:"can_drive"`
	HasIDP        bool     `json:"has_idp"`
	BudgetMinTHB  int      `json:"budget_min_thb"`
	BudgetMaxTHB  int      `json:"budget_max_thb"`
	Dietary       []string `json:"dietary"`
	Notes         string   `json:"notes"`
}

func (s *Server) handleSaveTripProfile(c echo.Context) error {
	var req saveProfileRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.BudgetMinTHB < 0 || req.BudgetMaxTHB < 0 {
		return request.BadRequest(c, "งบติดลบไม่ได้")
	}
	if req.BudgetMaxTHB > 0 && req.BudgetMinTHB > req.BudgetMaxTHB {
		return request.BadRequest(c, "งบต่ำสุดต้องไม่เกินงบสูงสุด")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	profile := &models.MemberProfile{
		TripID:        tripID,
		UserID:        request.UserID(c),
		VisitedBefore: req.VisitedBefore,
		Pace:          orDefault(req.Pace, models.PaceBalanced),
		WalkLevel:     req.WalkLevel,
		CanDrive:      req.CanDrive,
		HasIDP:        req.HasIDP,
		BudgetMinTHB:  req.BudgetMinTHB,
		BudgetMaxTHB:  req.BudgetMaxTHB,
		Dietary:       jsonArray(req.Dietary),
		Notes:         req.Notes,
	}
	if profile.WalkLevel == 0 {
		profile.WalkLevel = 2
	}
	if err := s.members.UpsertProfile(ctx, profile); err != nil {
		return request.Internal(c, "บันทึกโปรไฟล์ไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypeMemberJoined, "profile", profile.UserID)
	return c.JSON(http.StatusOK, toMemberProfileDTO(*profile, true))
}

func (s *Server) handleListTripProfiles(c echo.Context) error {
	profiles, err := s.members.ListProfiles(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดโปรไฟล์ไม่สำเร็จ")
	}
	out := make([]memberProfileDTO, 0, len(profiles))
	for _, p := range profiles {
		out = append(out, toMemberProfileDTO(p, true))
	}
	return c.JSON(http.StatusOK, out)
}

type updateRoleRequest struct {
	Role string `json:"role" validate:"required,oneof=owner editor viewer"`
}

func (s *Server) handleUpdateMemberRole(c echo.Context) error {
	var req updateRoleRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	targetID := c.Param("userId")

	if err := s.members.UpdateRole(ctx, tripID, targetID, req.Role); err != nil {
		return request.Internal(c, "เปลี่ยนสิทธิ์ไม่สำเร็จ")
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	for _, m := range roster.members {
		if m.UserID == targetID {
			return c.JSON(http.StatusOK, toMemberDTO(m, roster.users[targetID], roster.hasWishlist[targetID]))
		}
	}
	return request.NotFound(c, "ไม่พบสมาชิกคนนี้")
}

func (s *Server) handleRemoveMember(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	targetID := c.Param("userId")

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	// Removing the owner would leave a room nobody can administer.
	if trip.OwnerID == targetID {
		return request.BadRequest(c, "เอาเจ้าของทริปออกไม่ได้ — โอนสิทธิ์ก่อน")
	}

	if err := s.members.Remove(ctx, tripID, targetID); err != nil {
		return request.Internal(c, "เอาสมาชิกออกไม่สำเร็จ")
	}
	// Their availability should stop counting towards the overlap immediately.
	_ = s.dates.ClearMember(ctx, tripID, targetID)

	return c.NoContent(http.StatusNoContent)
}
