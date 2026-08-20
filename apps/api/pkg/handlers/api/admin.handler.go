package api

import (
	"encoding/json"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

// registerAdminRoutes is the internal console (DEV_SPEC §5 / M13). The whole
// group already sits behind JwtMiddleware + IsAdmin, and admin is granted only
// through ADMIN_EMAILS at first sign-in — there is no self-service escalation.
//
//	GET    /admin/dashboard
//	GET    /admin/pois         POST /admin/pois        PATCH /admin/pois/:id
//	GET    /admin/characters   PATCH /admin/characters/:id
//	GET    /admin/partners     PUT   /admin/partners/:key
//	GET    /admin/flags
func (s *Server) registerAdminRoutes(g *echo.Group) {
	g.GET("/dashboard", s.handleAdminDashboard)

	g.GET("/pois", s.handleAdminListPOIs)
	g.POST("/pois", s.handleAdminCreatePOI)
	g.PATCH("/pois/:id", s.handleAdminUpdatePOI)

	g.GET("/characters", s.handleAdminListCharacters)
	g.PATCH("/characters/:id", s.handleAdminUpdateCharacter)

	g.GET("/partners", s.handleAdminListPartners)
	g.PUT("/partners/:key", s.handleAdminUpsertPartner)

	g.GET("/flags", s.handleAdminFlags)
}

// AdminDashboard is the "is anything happening / is anything on fire" screen.
type AdminDashboard struct {
	Users           int64   `json:"users"`
	POIs            int64   `json:"pois"`
	Characters      int64   `json:"characters"`
	TripsLast7d     int64   `json:"trips_last_7d"`
	TripsLast30d    int64   `json:"trips_last_30d"`
	AICostLast24h   float64 `json:"ai_cost_last_24h_usd"`
	AICostLast30d   float64 `json:"ai_cost_last_30d_usd"`
	ClicksLast30d   int64   `json:"booking_clicks_last_30d"`
	ConfirmsLast30d int64   `json:"booking_confirmations_last_30d"`
	PointsIssued    float64 `json:"points_issued"`
}

func (s *Server) handleAdminDashboard(c echo.Context) error {
	ctx := c.Request().Context()
	now := time.Now().UTC()
	last24h := now.Add(-24 * time.Hour)
	last7d := now.AddDate(0, 0, -7)
	last30d := now.AddDate(0, 0, -30)

	var d AdminDashboard
	d.Users, _ = s.users.Count(ctx)
	d.POIs, _ = s.pois.Count(ctx)
	d.Characters, _ = s.characters.Count(ctx)
	d.TripsLast7d, _ = s.trips.CountSince(ctx, last7d)
	d.TripsLast30d, _ = s.trips.CountSince(ctx, last30d)
	d.AICostLast24h, _ = s.aiJobs.TotalCostSince(ctx, last24h)
	d.AICostLast30d, _ = s.aiJobs.TotalCostSince(ctx, last30d)
	d.ClicksLast30d, _ = s.bookings.CountClicksSince(ctx, last30d)
	d.ConfirmsLast30d, _ = s.bookings.CountConfirmationsSince(ctx, last30d)

	// Points issued is summed from the ledger, not from the cached balances,
	// because the ledger is the source of truth (§6.5).
	var issued *float64
	_ = s.db.WithContext(ctx).Model(&models.PointsTransaction{}).
		Where("amount > 0").Select("SUM(amount)").Scan(&issued).Error
	if issued != nil {
		d.PointsIssued = *issued
	}

	return request.OK(c, d)
}

func (s *Server) handleAdminListPOIs(c echo.Context) error {
	p := request.BindPagination(c)
	pois, total, err := s.pois.List(c.Request().Context(),
		c.QueryParam("city"), c.QueryParam("category"), p.Limit, p.Offset())
	if err != nil {
		return request.Internal(c, "อ่านรายการ POI ไม่สำเร็จ")
	}
	return request.OK(c, store.NewListResult(pois, total, p))
}

type poiRequest struct {
	NameTH        string            `json:"name_th" validate:"required,max=200"`
	NameEN        string            `json:"name_en" validate:"omitempty,max=200"`
	NameJA        string            `json:"name_ja" validate:"omitempty,max=200"`
	City          string            `json:"city" validate:"omitempty,max=80"`
	Area          string            `json:"area" validate:"omitempty,max=80"`
	Category      string            `json:"category" validate:"omitempty,max=40"`
	Tags          []string          `json:"tags" validate:"omitempty,max=12,dive,max=40"`
	Lat           *float64          `json:"lat" validate:"omitempty,min=-90,max=90"`
	Lng           *float64          `json:"lng" validate:"omitempty,min=-180,max=180"`
	GooglePlaceID string            `json:"google_place_id" validate:"omitempty,max=120"`
	OpenHours     map[string]string `json:"open_hours"`
	ClosedDays    []string          `json:"closed_days" validate:"omitempty,max=7,dive,max=12"`
	AvgVisitMin   int               `json:"avg_visit_min" validate:"omitempty,min=0,max=1440"`
	AvgCostJPY    *float64          `json:"avg_cost_jpy" validate:"omitempty,min=0"`
	CostNote      string            `json:"cost_note" validate:"omitempty,max=255"`
	Tips          string            `json:"tips" validate:"omitempty,max=4000"`
	ImageURL      string            `json:"image_url" validate:"omitempty,url,max=500"`
	PartnerLinks  map[string]string `json:"partner_links"`
	IsActive      *bool             `json:"is_active"`
	QualityScore  int               `json:"quality_score" validate:"omitempty,min=0,max=100"`
}

func (s *Server) handleAdminCreatePOI(c echo.Context) error {
	var req poiRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	poi := &models.POI{Country: "JP", IsActive: true, Source: "admin"}
	applyPOI(poi, req)

	if err := s.pois.Create(c.Request().Context(), poi); err != nil {
		return request.Internal(c, "บันทึก POI ไม่สำเร็จ")
	}
	return request.Created(c, poi)
}

func (s *Server) handleAdminUpdatePOI(c echo.Context) error {
	var req poiRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	poi, err := s.pois.GetByID(ctx, c.Param("id"))
	if err != nil {
		return request.NotFound(c, "ไม่พบ POI")
	}
	applyPOI(poi, req)

	if err := s.pois.Update(ctx, poi); err != nil {
		return request.Internal(c, "บันทึก POI ไม่สำเร็จ")
	}
	return request.OK(c, poi)
}

func applyPOI(poi *models.POI, req poiRequest) {
	poi.NameTH = req.NameTH
	poi.NameEN = req.NameEN
	poi.NameJA = req.NameJA
	poi.City = req.City
	poi.Area = req.Area
	poi.Category = req.Category
	poi.Lat = req.Lat
	poi.Lng = req.Lng
	poi.AvgVisitMin = req.AvgVisitMin
	poi.AvgCostJPY = req.AvgCostJPY
	poi.CostNote = req.CostNote
	poi.Tips = req.Tips
	poi.ImageURL = req.ImageURL
	poi.QualityScore = req.QualityScore
	if req.GooglePlaceID != "" {
		poi.GooglePlaceID = req.GooglePlaceID
	}
	if req.IsActive != nil {
		poi.IsActive = *req.IsActive
	}
	if req.Tags != nil {
		poi.Tags = mustJSON(req.Tags)
	}
	if req.OpenHours != nil {
		poi.OpenHours = mustJSON(req.OpenHours)
	}
	if req.ClosedDays != nil {
		poi.ClosedDays = mustJSON(req.ClosedDays)
	}
	if req.PartnerLinks != nil {
		poi.PartnerLinks = mustJSON(req.PartnerLinks)
	}
}

func (s *Server) handleAdminListCharacters(c echo.Context) error {
	characters, err := s.characters.List(c.Request().Context(), false)
	if err != nil {
		return request.Internal(c, "อ่านตัวละครไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": characters})
}

type characterRequest struct {
	Name     string `json:"name" validate:"required,max=60"`
	Emoji    string `json:"emoji" validate:"required,max=16"`
	ImageURL string `json:"image_url" validate:"omitempty,url,max=500"`
	IsActive *bool  `json:"is_active"`
}

func (s *Server) handleAdminUpdateCharacter(c echo.Context) error {
	var req characterRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	id := int16(atoiDefault(c.Param("id"), 0))
	if id == 0 {
		return request.BadRequest(c, "id ไม่ถูกต้อง")
	}

	ctx := c.Request().Context()
	character, err := s.characters.GetByID(ctx, id)
	if err != nil {
		return request.NotFound(c, "ไม่พบตัวละคร")
	}

	character.Name = req.Name
	character.Emoji = req.Emoji
	character.ImageURL = req.ImageURL
	if req.IsActive != nil {
		character.IsActive = *req.IsActive
	}

	if err := s.characters.Update(ctx, character); err != nil {
		return request.Internal(c, "บันทึกตัวละครไม่สำเร็จ")
	}
	return request.OK(c, character)
}

func (s *Server) handleAdminListPartners(c echo.Context) error {
	partners, err := s.bookings.ListPartners(c.Request().Context())
	if err != nil {
		return request.Internal(c, "อ่านพาร์ทเนอร์ไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": partners})
}

type partnerRequest struct {
	Name             string   `json:"name" validate:"required,max=80"`
	ItemTypes        []string `json:"item_types" validate:"omitempty,max=10,dive,max=20"`
	DeeplinkTemplate string   `json:"deeplink_template" validate:"required,max=1000"`
	SubIDParam       string   `json:"subid_param" validate:"omitempty,max=40"`
	Enabled          *bool    `json:"enabled"`
	Priority         int      `json:"priority" validate:"omitempty,min=0,max=100"`
	Notes            string   `json:"notes" validate:"omitempty,max=500"`
}

// handleAdminUpsertPartner is why partner rows live in the DB: commission terms
// and URL formats change without a deploy (M12 risk note).
func (s *Server) handleAdminUpsertPartner(c echo.Context) error {
	var req partnerRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	partner := &models.AffiliatePartner{
		Key:              c.Param("key"),
		Name:             req.Name,
		DeeplinkTemplate: req.DeeplinkTemplate,
		SubIDParam:       req.SubIDParam,
		Enabled:          true,
		Priority:         req.Priority,
		Notes:            req.Notes,
		ItemTypes:        mustJSON(orEmpty(req.ItemTypes)),
	}
	if req.Enabled != nil {
		partner.Enabled = *req.Enabled
	}

	if err := s.bookings.UpsertPartner(c.Request().Context(), partner); err != nil {
		return request.Internal(c, "บันทึกพาร์ทเนอร์ไม่สำเร็จ")
	}
	return request.OK(c, partner)
}

// handleAdminFlags reports what this deployment can actually do, which is the
// first thing to check when a feature "does not work" on the server.
func (s *Server) handleAdminFlags(c echo.Context) error {
	return request.OK(c, map[string]any{
		"ai_configured":     s.cfg.Anthropic.ApiKey != "",
		"maps_configured":   s.places.Configured(),
		"line_configured":   s.cfg.Line.LoginChannelID != "",
		"google_configured": s.cfg.Google.OAuthClientID != "",
		"email_configured":  s.email.Configured(),
		"pdf_configured":    s.cfg.GotenbergURL != "",
		"fx_configured":     s.cfg.FX.ApiURL != "",
		"ai_daily_cap_usd":  s.cfg.Anthropic.DailyCostCapUSD,
		"points_earn_rate":  s.cfg.Points.EarnRatePct,
		"environment":       s.cfg.Environment,
		"commit":            s.cfg.Commit,
	})
}

// mustJSON marshals a value that cannot realistically fail (maps and slices of
// strings), returning an empty JSON document if it somehow does.
func mustJSON(v any) datatypes.JSON {
	raw, err := json.Marshal(v)
	if err != nil {
		return datatypes.JSON("null")
	}
	return datatypes.JSON(raw)
}
