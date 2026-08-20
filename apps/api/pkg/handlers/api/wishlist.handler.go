package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Wishlist and coverage (A3.2 / A3.4).
//
// Everyone may write their own list; only the owner may touch someone else's.
// Editing a person's wishes for them is how a group argument starts, so the
// rule is enforced here rather than left to the UI.
func (s *Server) registerWishlistRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/wishlist", s.handleListWishes, view)
	g.GET("/:tripId/coverage", s.handleCoverage, view)
	g.POST("/:tripId/wishlist", s.handleCreateWish, edit)
	g.PATCH("/:tripId/wishlist/:wishId", s.handleUpdateWish, edit)
	g.DELETE("/:tripId/wishlist/:wishId", s.handleDeleteWish, edit)
}

func (s *Server) handleListWishes(c echo.Context) error {
	wishes, err := s.wishlist.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดที่อยากไปไม่สำเร็จ")
	}
	out := make([]wishlistItemDTO, 0, len(wishes))
	for _, w := range wishes {
		out = append(out, toWishlistDTO(w))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleCoverage(c echo.Context) error {
	summary, err := s.recomputeCoverage(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "คำนวณความครอบคลุมไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toCoverageDTO(summary))
}

type wishRequest struct {
	UserID string   `json:"user_id"`
	Kind   string   `json:"kind" validate:"omitempty,oneof=must nice avoid"`
	Title  string   `json:"title"`
	Tags   []string `json:"tags"`
	Note   string   `json:"note"`
	POIID  *string  `json:"poi_id"`
	ItemID *string  `json:"item_id"`
}

func (s *Server) handleCreateWish(c echo.Context) error {
	var req wishRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Title == "" {
		return request.BadRequest(c, "ใส่ชื่อสิ่งที่อยากไปด้วย")
	}

	actor := request.UserID(c)
	owner := req.UserID
	if owner == "" {
		owner = actor
	}
	if owner != actor && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "เพิ่มที่อยากไปให้คนอื่นไม่ได้")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wish := &models.WishlistItem{
		TripID:   tripID,
		UserID:   owner,
		Kind:     orDefault(req.Kind, models.WishNice),
		Title:    req.Title,
		Tags:     jsonArray(req.Tags),
		Note:     req.Note,
		POIID:    req.POIID,
		Coverage: models.CoverageUncovered,
	}
	if err := s.wishlist.Create(ctx, wish); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	// Adding a wish can immediately be covered by something already planned.
	_, _ = s.recomputeCoverage(ctx, tripID)
	if fresh, err := s.wishlist.Get(ctx, tripID, wish.ID); err == nil {
		wish = fresh
	}

	s.track(c, tripID, "เพิ่ม \""+wish.Title+"\" ลงที่อยากไป", events.TypeWishlistChanged, "wish", wish.ID)
	return c.JSON(http.StatusCreated, toWishlistDTO(*wish))
}

func (s *Server) handleUpdateWish(c echo.Context) error {
	var req wishRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wish, err := s.wishlist.Get(ctx, tripID, c.Param("wishId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}
	if wish.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "แก้ของคนอื่นไม่ได้")
	}

	if req.Title != "" {
		wish.Title = req.Title
	}
	if req.Kind != "" {
		wish.Kind = req.Kind
	}
	if req.Tags != nil {
		wish.Tags = jsonArray(req.Tags)
	}
	if req.Note != "" {
		wish.Note = req.Note
	}
	if req.POIID != nil {
		wish.POIID = req.POIID
	}

	if err := s.wishlist.Update(ctx, wish); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "", events.TypeWishlistChanged, "wish", wish.ID)
	return c.JSON(http.StatusOK, toWishlistDTO(*wish))
}

func (s *Server) handleDeleteWish(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	wish, err := s.wishlist.Get(ctx, tripID, c.Param("wishId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}
	if wish.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบของคนอื่นไม่ได้")
	}

	if err := s.wishlist.Delete(ctx, tripID, wish.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID, "", events.TypeWishlistChanged, "wish", wish.ID)
	return c.NoContent(http.StatusNoContent)
}
