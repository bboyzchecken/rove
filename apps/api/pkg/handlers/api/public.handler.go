package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// registerPublicRoutes serves plans to people who are not members
// (DEV_SPEC §5.11). Everything here is read-only and hand-assembled.
//
//	GET  /public/plans/:token          share link or public slug
//	POST /public/plans/:token/view     view counter, fire and forget
//	GET  /public/explore               browse public trips
//
// The hard rule (§4.3): expense NEVER appears in a public payload. That is not
// a setting the owner can flip — this file simply has no code path that reads
// the expense tables.
func (s *Server) registerPublicRoutes(g *echo.Group) {
	guard := s.RateLimit(RateLimitConfig{Key: "public", Limit: 120, Window: time.Minute})

	g.GET("/plans/:token", s.handlePublicPlan, guard)
	g.POST("/plans/:token/view", s.handlePublicView, guard)
	g.GET("/explore", s.handleExplore, guard)
}

// PublicPlan is the entire shape an outsider can see. Adding a field here is a
// privacy decision, which is why the struct is explicit rather than reusing
// the internal DTOs.
type PublicPlan struct {
	TripID      string         `json:"trip_id"`
	Title       string         `json:"title"`
	Slug        *string        `json:"slug"`
	Summary     string         `json:"summary"`
	Country     string         `json:"destination_country"`
	Cities      []string       `json:"destination_cities"`
	StartDate   *time.Time     `json:"start_date"`
	EndDate     *time.Time     `json:"end_date"`
	Days        int            `json:"days"`
	PartySize   int            `json:"party_size"`
	CoverImage  string         `json:"cover_image_url"`
	CloneCount  int            `json:"clone_count"`
	ViewCount   int            `json:"view_count"`
	Author      publicAuthor   `json:"author"`
	Plan        publicPlanBody `json:"plan"`
	EstimateTHB float64        `json:"estimate_thb"`
	FXRateNote  string         `json:"fx_rate_note"`
	CanClone    bool           `json:"can_clone"`
}

type publicAuthor struct {
	DisplayName string  `json:"display_name"`
	Handle      *string `json:"handle"`
	AvatarURL   string  `json:"avatar_url"`
	CharacterID *int16  `json:"character_id"`
}

type publicPlanBody struct {
	Name string      `json:"name"`
	Days []publicDay `json:"days"`
	Pros []string    `json:"pros"`
	Cons []string    `json:"cons"`
}

type publicDay struct {
	Date  string       `json:"date"`
	Title string       `json:"title"`
	Theme string       `json:"theme"`
	Items []publicItem `json:"items"`
}

// publicItem deliberately omits cost_status, booking state, notes written by
// members, and every internal id except the POI (which is public catalogue data).
type publicItem struct {
	Type      string   `json:"type"`
	Title     string   `json:"title"`
	StartTime string   `json:"start_time,omitempty"`
	EndTime   string   `json:"end_time,omitempty"`
	POIID     string   `json:"poi_id,omitempty"`
	TravelMin int      `json:"travel_min,omitempty"`
	CostJPY   *float64 `json:"cost_jpy,omitempty"`
	CostBasis string   `json:"cost_basis,omitempty"`
}

func (s *Server) handlePublicPlan(c echo.Context) error {
	ctx := c.Request().Context()

	trip, err := s.publicTrip(ctx, c.Param("token"))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริปนี้")
	}

	plan, err := s.activePlan(ctx, trip.ID)
	if err != nil {
		return request.NotFound(c, "ทริปนี้ยังไม่มีแพลน")
	}
	days, err := s.plans.Days(ctx, plan.ID)
	if err != nil {
		return request.Internal(c, "อ่านแพลนไม่สำเร็จ")
	}
	items, err := s.plans.Items(ctx, plan.ID)
	if err != nil {
		return request.Internal(c, "อ่านรายการไม่สำเร็จ")
	}

	byDay := map[string][]models.Item{}
	for _, it := range items {
		byDay[it.DayID] = append(byDay[it.DayID], it)
	}

	out := PublicPlan{
		TripID: trip.ID, Title: trip.Title, Slug: trip.Slug,
		Summary: trip.Summary, Country: trip.DestinationCountry,
		Cities:    jsonStrings(trip.DestinationCities),
		StartDate: trip.StartDate, EndDate: trip.EndDate,
		Days:       trip.Days(),
		PartySize:  trip.PartySize,
		CoverImage: trip.CoverImageURL,
		CloneCount: trip.CloneCount, ViewCount: trip.ViewCount,
		Plan: publicPlanBody{
			Name: plan.Name,
			Pros: jsonStrings(plan.Pros),
			Cons: jsonStrings(plan.Cons),
		},
		// Anyone who can see the plan can copy it — that is the whole point of
		// publishing one (DEV_SPEC §1).
		CanClone: true,
	}

	for _, d := range days {
		day := publicDay{Date: d.Date.Format("2006-01-02"), Title: d.Title, Theme: d.Theme}
		for _, it := range byDay[d.ID] {
			pi := publicItem{
				Type: it.Type, Title: it.Title,
				StartTime: it.StartTime, EndTime: it.EndTime,
				TravelMin: it.TravelMin, CostBasis: it.CostBasis,
				CostJPY: it.CostAmount,
			}
			if it.POIID != nil {
				pi.POIID = *it.POIID
			}
			day.Items = append(day.Items, pi)
		}
		out.Plan.Days = append(out.Plan.Days, day)
	}

	if author, err := s.users.GetByID(ctx, trip.OwnerID); err == nil {
		out.Author = publicAuthor{
			DisplayName: author.DisplayName, Handle: author.Handle,
			AvatarURL: author.AvatarURL, CharacterID: author.CharacterID,
		}
	}

	out.FXRateNote = fxNote(trip.FxRateAt)
	return request.OK(c, out)
}

// publicTrip resolves a token that may be either a share token or a public
// slug, and enforces that the trip is actually shared.
func (s *Server) publicTrip(ctx context.Context, token string) (*models.Trip, error) {
	if trip, err := s.trips.GetByShareToken(ctx, token); err == nil {
		if trip.Visibility == models.VisibilityPrivate {
			return nil, errNotShared
		}
		return trip, nil
	}

	trip, err := s.trips.GetBySlug(ctx, token)
	if err != nil {
		return nil, err
	}
	// A slug only works for a fully public trip; a link-only trip is reachable
	// through its unguessable token and nothing else.
	if trip.Visibility != models.VisibilityPublic {
		return nil, errNotShared
	}
	return trip, nil
}

var errNotShared = echo.NewHTTPError(http.StatusNotFound, "ไม่พบทริปนี้")

// handlePublicView is fire-and-forget: it always answers 204 so a counter
// failure never shows up on a reader's screen.
func (s *Server) handlePublicView(c echo.Context) error {
	trip, err := s.publicTrip(c.Request().Context(), c.Param("token"))
	if err != nil {
		return request.NoContent(c)
	}
	_ = s.trips.IncrementView(c.Request().Context(), trip.ID)
	return request.NoContent(c)
}

// ExploreCard is one tile in the explore grid.
type ExploreCard struct {
	Slug       *string      `json:"slug"`
	TripID     string       `json:"trip_id"`
	Title      string       `json:"title"`
	Summary    string       `json:"summary"`
	Cities     []string     `json:"destination_cities"`
	Days       int          `json:"days"`
	StartDate  *time.Time   `json:"start_date"`
	CoverImage string       `json:"cover_image_url"`
	CloneCount int          `json:"clone_count"`
	ViewCount  int          `json:"view_count"`
	Author     publicAuthor `json:"author"`
}

// handleExplore lists public trips. Phase 1 keeps the filters simple — city and
// day count — because with a small catalogue anything more elaborate returns
// empty pages (the full filter set is Phase 2, M11).
func (s *Server) handleExplore(c echo.Context) error {
	ctx := c.Request().Context()
	p := request.BindPagination(c)

	q := s.db.WithContext(ctx).Model(&models.Trip{}).
		Where("visibility = ?", models.VisibilityPublic)

	if city := strings.ToLower(strings.TrimSpace(c.QueryParam("city"))); city != "" {
		// destination_cities is a JSON array; a LIKE over its text form is
		// enough at this catalogue size and avoids a generated column.
		q = q.Where("LOWER(CAST(destination_cities AS CHAR)) LIKE ?", "%"+city+"%")
	}
	if sort := c.QueryParam("sort"); sort == "new" {
		q = q.Order("created_at DESC")
	} else {
		q = q.Order("clone_count DESC, view_count DESC")
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return request.Internal(c, "อ่านรายการไม่สำเร็จ")
	}

	var trips []models.Trip
	if err := q.Limit(p.Limit).Offset(p.Offset()).Find(&trips).Error; err != nil {
		return request.Internal(c, "อ่านรายการไม่สำเร็จ")
	}

	ownerIDs := make([]string, 0, len(trips))
	for _, t := range trips {
		ownerIDs = append(ownerIDs, t.OwnerID)
	}
	users, _ := s.users.ListByIDs(ctx, ownerIDs)
	authors := make(map[string]publicAuthor, len(users))
	for _, u := range users {
		authors[u.ID] = publicAuthor{
			DisplayName: u.DisplayName, Handle: u.Handle,
			AvatarURL: u.AvatarURL, CharacterID: u.CharacterID,
		}
	}

	cards := make([]ExploreCard, 0, len(trips))
	for _, t := range trips {
		cards = append(cards, ExploreCard{
			Slug: t.Slug, TripID: t.ID, Title: t.Title, Summary: t.Summary,
			Cities: jsonStrings(t.DestinationCities), Days: t.Days(),
			StartDate: t.StartDate, CoverImage: t.CoverImageURL,
			CloneCount: t.CloneCount, ViewCount: t.ViewCount,
			Author: authors[t.OwnerID],
		})
	}

	return request.OK(c, map[string]any{
		"items": cards,
		"total": total,
		"page":  p.Page,
		"limit": p.Limit,
	})
}
