package api

import (
	"encoding/json"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerWishlistRoutes covers the wishlist, the per-trip member profile and
// the coverage board (DEV_SPEC §5.4).
//
//	GET/POST         /trips/:tripId/wishlist       [viewer read / editor write]
//	PATCH/DELETE     /trips/:tripId/wishlist/:id   [author, or trip owner]
//	GET/PUT          /trips/:tripId/profile/me     [viewer]
//	GET              /trips/:tripId/coverage       [viewer]
func (s *Server) registerWishlistRoutes(trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	editor := s.TripRoleMiddleware(models.TripRoleEditor)

	trips.GET("/:tripId/wishlist", s.handleListWishlist, viewer)
	trips.POST("/:tripId/wishlist", s.handleCreateWish, editor)
	trips.PATCH("/:tripId/wishlist/:id", s.handleUpdateWish, editor)
	trips.DELETE("/:tripId/wishlist/:id", s.handleDeleteWish, editor)

	trips.GET("/:tripId/profile/me", s.handleGetProfile, viewer)
	trips.PUT("/:tripId/profile/me", s.handleSaveProfile, viewer)

	trips.GET("/:tripId/coverage", s.handleCoverage, viewer)
}

func (s *Server) handleListWishlist(c echo.Context) error {
	items, err := s.wishlists.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "อ่าน wishlist ไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": items})
}

type wishRequest struct {
	Kind  string   `json:"kind" validate:"omitempty,oneof=must nice avoid"`
	Text  string   `json:"text" validate:"required,max=500"`
	Tags  []string `json:"tags" validate:"omitempty,max=8,dive,max=40"`
	POIID string   `json:"poi_id" validate:"omitempty,uuid4"`
}

func (s *Server) handleCreateWish(c echo.Context) error {
	var req wishRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	order, _ := s.wishlists.NextSortOrder(ctx, tripID, userID)
	wish := &models.WishlistItem{
		TripID: tripID, MemberID: userID,
		Kind: orDefaultString(req.Kind, models.WishNice),
		Text: req.Text, SortOrder: order,
		Coverage: models.CoverageUncovered,
	}
	if raw, err := json.Marshal(orEmpty(req.Tags)); err == nil {
		wish.Tags = datatypes.JSON(raw)
	}
	if req.POIID != "" {
		id := req.POIID
		wish.POIID = &id
	}

	if err := s.wishlists.Create(ctx, wish); err != nil {
		return request.Internal(c, "บันทึก wishlist ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionWishlistAdded,
		EventType:  events.TypeWishlistChanged,
		TargetType: "wishlist", TargetID: wish.ID,
	})
	return request.Created(c, wish)
}

// handleUpdateWish enforces the M3 rule: you edit your own wishes, and the trip
// owner may tidy up anyone's.
func (s *Server) handleUpdateWish(c echo.Context) error {
	var req wishRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wish, err := s.wishlists.Get(ctx, tripID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ wishlist")
	}
	if !s.canEditWish(c, wish) {
		return request.Forbidden(c, "แก้ไขได้เฉพาะรายการของตัวเอง")
	}

	wish.Text = req.Text
	if req.Kind != "" {
		wish.Kind = req.Kind
	}
	if req.Tags != nil {
		if raw, err := json.Marshal(req.Tags); err == nil {
			wish.Tags = datatypes.JSON(raw)
		}
	}
	if req.POIID != "" {
		id := req.POIID
		wish.POIID = &id
	}

	if err := s.wishlists.Update(ctx, wish); err != nil {
		return request.Internal(c, "บันทึก wishlist ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionWishlistUpdated,
		EventType:  events.TypeWishlistChanged,
		TargetType: "wishlist", TargetID: wish.ID,
	})
	return request.OK(c, wish)
}

func (s *Server) handleDeleteWish(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wish, err := s.wishlists.Get(ctx, tripID, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ wishlist")
	}
	if !s.canEditWish(c, wish) {
		return request.Forbidden(c, "ลบได้เฉพาะรายการของตัวเอง")
	}

	if err := s.wishlists.Delete(ctx, tripID, wish.ID); err != nil {
		return request.Internal(c, "ลบ wishlist ไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionWishlistRemoved,
		EventType:  events.TypeWishlistChanged,
		TargetType: "wishlist", TargetID: wish.ID,
	})
	return request.NoContent(c)
}

func (s *Server) canEditWish(c echo.Context, w *models.WishlistItem) bool {
	return w.MemberID == request.UserID(c) || request.TripRole(c) == models.TripRoleOwner
}

func (s *Server) handleGetProfile(c echo.Context) error {
	profile, err := s.profiles.Get(c.Request().Context(), request.TripID(c), request.UserID(c))
	if err != nil {
		return request.Internal(c, "อ่านโปรไฟล์ไม่สำเร็จ")
	}
	return request.OK(c, profile)
}

type profileRequest struct {
	VisitedBefore bool     `json:"visited_before"`
	Pace          string   `json:"pace" validate:"omitempty,oneof=chill normal packed"`
	WalkLevel     int      `json:"walk_level" validate:"omitempty,min=1,max=5"`
	CanDrive      bool     `json:"can_drive"`
	HasIDP        bool     `json:"has_idp"`
	BudgetMin     *float64 `json:"budget_min" validate:"omitempty,min=0"`
	BudgetMax     *float64 `json:"budget_max" validate:"omitempty,min=0"`
	Dietary       []string `json:"dietary" validate:"omitempty,max=10,dive,max=40"`
	TravelingWith []string `json:"traveling_with" validate:"omitempty,max=10,dive,max=40"`
	Notes         string   `json:"notes" validate:"omitempty,max=2000"`
}

// handleSaveProfile writes only the caller's own profile — the route is
// /profile/me and there is deliberately no way to write someone else's.
func (s *Server) handleSaveProfile(c echo.Context) error {
	var req profileRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.BudgetMin != nil && req.BudgetMax != nil && *req.BudgetMax < *req.BudgetMin {
		return request.BadRequest(c, "งบสูงสุดต้องไม่น้อยกว่างบต่ำสุด")
	}

	profile := &models.MemberProfile{
		TripID:        request.TripID(c),
		UserID:        request.UserID(c),
		VisitedBefore: req.VisitedBefore,
		Pace:          orDefaultString(req.Pace, models.PaceNormal),
		WalkLevel:     orDefault(req.WalkLevel, 3),
		CanDrive:      req.CanDrive,
		HasIDP:        req.HasIDP,
		BudgetMin:     req.BudgetMin,
		BudgetMax:     req.BudgetMax,
		Notes:         req.Notes,
	}
	if raw, err := json.Marshal(orEmpty(req.Dietary)); err == nil {
		profile.Dietary = datatypes.JSON(raw)
	}
	if raw, err := json.Marshal(orEmpty(req.TravelingWith)); err == nil {
		profile.TravelingWith = datatypes.JSON(raw)
	}

	if err := s.profiles.Upsert(c.Request().Context(), profile); err != nil {
		return request.Internal(c, "บันทึกโปรไฟล์ไม่สำเร็จ")
	}

	s.emit(c, profile.TripID, emitOpts{
		Action:     models.ActionWishlistUpdated,
		EventType:  events.TypeWishlistChanged,
		TargetType: "profile", TargetID: profile.UserID,
	})
	return request.OK(c, profile)
}

// CoverageView is one row of the Coverage Board (W3.3).
type CoverageView struct {
	WishlistItemID string   `json:"wishlist_item_id"`
	MemberID       string   `json:"member_id"`
	Kind           string   `json:"kind"`
	Text           string   `json:"text"`
	Status         string   `json:"status"`
	Note           string   `json:"note"`
	ItemIDs        []string `json:"item_ids"`
}

// handleCoverage recomputes live rather than reading the stored column, so the
// board is never stale after a manual item edit. The stored column is the
// cached copy for list views; this is the authoritative answer (A3.4/A3.5).
func (s *Server) handleCoverage(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wishes, err := s.wishlists.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "อ่าน wishlist ไม่สำเร็จ")
	}

	planID := c.QueryParam("plan_id")
	if planID == "" {
		if p, err := s.activePlan(ctx, tripID); err == nil {
			planID = p.ID
		}
	}

	var items []models.Item
	if planID != "" {
		items, _ = s.plans.Items(ctx, planID)
	}

	wishInputs := make([]domain.WishInput, 0, len(wishes))
	byID := make(map[string]models.WishlistItem, len(wishes))
	for _, w := range wishes {
		byID[w.ID] = w
		wi := domain.WishInput{ID: w.ID, Kind: w.Kind, Text: w.Text}
		if len(w.Tags) > 0 {
			_ = json.Unmarshal(w.Tags, &wi.Tags)
		}
		if w.POIID != nil {
			wi.POIID = *w.POIID
		}
		wishInputs = append(wishInputs, wi)
	}

	itemInputs := make([]domain.PlanItemInput, 0, len(items))
	for _, it := range items {
		pi := domain.PlanItemInput{ID: it.ID, Title: it.Title}
		if it.POIID != nil {
			pi.POIID = *it.POIID
		}
		itemInputs = append(itemInputs, pi)
	}

	results := domain.ComputeCoverage(wishInputs, itemInputs)
	stats := domain.SummarizeCoverage(wishInputs, results)

	views := make([]CoverageView, 0, len(results))
	for _, r := range results {
		w := byID[r.WishlistItemID]
		views = append(views, CoverageView{
			WishlistItemID: r.WishlistItemID,
			MemberID:       w.MemberID,
			Kind:           w.Kind,
			Text:           w.Text,
			Status:         string(r.Status),
			Note:           r.Note,
			ItemIDs:        orEmpty(r.CoveredByItemID),
		})
	}

	return request.OK(c, map[string]any{
		"plan_id": planID,
		"items":   views,
		"stats":   stats,
	})
}

func orEmpty(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
