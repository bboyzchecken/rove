package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Admin (M13 — A13.1 / A13.2).
//
// Deliberately small: the numbers someone actually needs to answer "is this
// working and what is it costing us", plus enough POI editing to fix a bad row
// without a deploy.
func (s *Server) registerAdminRoutes(g *echo.Group) {
	g.GET("/stats", s.handleAdminStats)
	g.GET("/poi", s.handleAdminSearchPOI)
	g.POST("/poi", s.handleAdminUpsertPOI)
	g.PATCH("/poi/:poiId", s.handleAdminUpsertPOI)
	g.GET("/characters", s.handleAdminCharacters)
	g.POST("/characters", s.handleAdminUpsertCharacter)
	// Campaign codes — the founding discount and anything like it (W26.4).
	g.POST("/discount-codes", s.handleAdminIssueDiscountCode)
	// The partner economy's ops screens (A12.11 / A12.12).
	s.registerPayoutRoutes(g)
}

type adminStatsDTO struct {
	Users      int64 `json:"users"`
	Trips      int64 `json:"trips"`
	POIs       int64 `json:"pois"`
	Characters int64 `json:"characters"`
	// AI spend for the current UTC day, which is the window the cap uses.
	AICostTodayUSD float64 `json:"ai_cost_today_usd"`
	AICostCapUSD   float64 `json:"ai_cost_cap_usd"`
	ClicksToday    int64   `json:"clicks_today"`
	// Which third parties are stand-ins right now — NOT "is the data fake".
	// See core.Config.StubProviders for why those are two different questions.
	StubProviders bool     `json:"stub_providers"`
	Stubbed       []string `json:"stubbed"`
	Commit        string   `json:"commit"`
}

func (s *Server) handleAdminStats(c echo.Context) error {
	ctx := c.Request().Context()
	since := time.Now().UTC().Truncate(24 * time.Hour)

	users, _ := s.users.Count(ctx)
	trips, _ := s.trips.Count(ctx)
	pois, _ := s.pois.Count(ctx)
	characters, _ := s.characters.Count(ctx)
	cost, _ := s.aiJobs.CostSince(ctx, since)
	clicks, _ := s.bookings.CountClicks(ctx, since)

	return c.JSON(http.StatusOK, adminStatsDTO{
		Users:          users,
		Trips:          trips,
		POIs:           pois,
		Characters:     characters,
		AICostTodayUSD: cost,
		AICostCapUSD:   s.cfg.Anthropic.DailyCostCapUSD,
		ClicksToday:    clicks,
		StubProviders:  s.cfg.UseStubs(),
		Stubbed:        stubbedProviders(s.cfg),
		Commit:         s.cfg.Commit,
	})
}

func (s *Server) handleAdminSearchPOI(c echo.Context) error {
	pois, err := s.pois.Search(
		c.Request().Context(),
		c.QueryParam("q"),
		c.QueryParam("city"),
		c.QueryParam("area"),
		50,
	)
	if err != nil {
		return request.Internal(c, "ค้นหาไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, pois)
}

type adminPOIRequest struct {
	ID          string   `json:"id"`
	NameTH      string   `json:"name_th" validate:"required"`
	NameEN      string   `json:"name_en"`
	City        string   `json:"city"`
	Area        string   `json:"area"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
	Lat         *float64 `json:"lat"`
	Lng         *float64 `json:"lng"`
	AvgVisitMin int      `json:"avg_visit_min"`
	AvgCostJPY  *float64 `json:"avg_cost_jpy"`
	Tips        string   `json:"tips"`
	IsActive    *bool    `json:"is_active"`
}

func (s *Server) handleAdminUpsertPOI(c echo.Context) error {
	var req adminPOIRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	id := orDefault(c.Param("poiId"), req.ID)

	poi := models.POI{
		NameTH:      req.NameTH,
		NameEN:      req.NameEN,
		City:        req.City,
		Area:        req.Area,
		Category:    orDefault(req.Category, "อื่นๆ"),
		Tags:        jsonArray(req.Tags),
		Lat:         req.Lat,
		Lng:         req.Lng,
		AvgVisitMin: req.AvgVisitMin,
		AvgCostJPY:  req.AvgCostJPY,
		Tips:        req.Tips,
		Source:      "admin",
		IsActive:    true,
	}
	poi.ID = id
	if req.IsActive != nil {
		poi.IsActive = *req.IsActive
	}

	if err := s.pois.Upsert(ctx, &poi); err != nil {
		return request.Internal(c, "บันทึกสถานที่ไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toPOIDTO(poi))
}

func (s *Server) handleAdminCharacters(c echo.Context) error {
	characters, err := s.characters.List(c.Request().Context())
	if err != nil {
		return request.Internal(c, "โหลดตัวละครไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, characters)
}

func (s *Server) handleAdminUpsertCharacter(c echo.Context) error {
	var character models.Character
	if err := request.BindAndValidate(c, &character); err != nil {
		return err
	}
	if character.ID == "" {
		return request.BadRequest(c, "ต้องมี id ของตัวละคร")
	}

	if err := s.characters.Upsert(c.Request().Context(), &character); err != nil {
		return request.Internal(c, "บันทึกตัวละครไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, character)
}

/* ------------------------------------------- campaign codes (M26 — W26.4) */

type issueDiscountRequest struct {
	// Who gets it, by handle — an admin typing a UUID is an admin issuing a
	// code to the wrong person eventually.
	Handle    string  `json:"handle" validate:"required"`
	AmountTHB float64 `json:"amount_thb" validate:"required"`
	// Days until it expires. Defaults to the founding window.
	Days int `json:"days"`
}

// handleAdminIssueDiscountCode mints a campaign code without burning points.
//
// This exists so the early-adopter discount can be a *code* rather than a lower
// number on the pricing page (W26.4). The list price has to read ฿299 from the
// first day it is shown, because the first price a customer sees becomes the
// reference every later price is judged against — putting ฿199 on the page now
// means ฿299 is permanently "the price they put up", while a gift that expires
// is just a gift that expired.
//
// Separate from handleRedeemPoints, and not gated by domain.RedemptionOpen: the
// mint is closed because the *points* rate is unmeasured (see revenue.go), and
// nothing here converts points into anything. What it does is spend marketing
// budget, deliberately, on a named person.
func (s *Server) handleAdminIssueDiscountCode(c echo.Context) error {
	var req issueDiscountRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.AmountTHB <= 0 || req.AmountTHB > domain.MaxFoundingDiscountTHB {
		return request.BadRequest(c, fmt.Sprintf(
			"มูลค่าโค้ดต้องอยู่ระหว่าง ฿1 ถึง ฿%d", domain.MaxFoundingDiscountTHB))
	}

	ctx := c.Request().Context()
	user, err := s.users.GetByHandle(ctx, strings.TrimPrefix(strings.TrimSpace(req.Handle), "@"))
	if err != nil {
		return request.NotFound(c, "ไม่พบผู้ใช้นี้")
	}

	validity := domain.FoundingCodeValidity
	if req.Days > 0 {
		validity = time.Duration(req.Days) * 24 * time.Hour
	}

	code := &models.DiscountCode{
		UserID:    user.ID,
		Code:      domain.NewDiscountCode(),
		Scope:     models.DiscountScopeTripPass,
		AmountTHB: req.AmountTHB,
		// Zero points: nobody paid for this one in the points economy, and
		// recording a cost here would inflate what that economy has paid out.
		PointsSpent: 0,
		ExpiresAt:   time.Now().UTC().Add(validity),
	}
	if err := s.discounts.Create(ctx, code); err != nil {
		return request.Internal(c, "ออกโค้ดไม่สำเร็จ")
	}

	return c.JSON(http.StatusCreated, toDiscountDTO(*code))
}
