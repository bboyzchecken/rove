package api

import (
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Where points came from, and who followed the plans that earned them
// (M23 — A23.1 / A23.2).
//
// Points redeem for money off at a published rate (A12.10), so the balance is
// not a score any more — it is something with a price. That makes the ledger a
// thing the owner has to be able to audit line by line, not a number rendered
// once on a profile card. Everything here is scoped to the caller and has no
// id in the path: there is no "somebody else's ledger" to ask for.
func (s *Server) registerPointsRoutes(me *echo.Group) {
	me.GET("/points", s.handleMyPoints)
	me.GET("/audience", s.handleMyAudience)
}

/* ---------------------------------------------------------- ledger (A23.1) */

// pointsEntryDTO is one line of "where did my points come from".
//
// The stored row carries a trip id and nothing else readable, so the id is
// resolved to that trip's title here. A ledger that answers "why do I have
// 1,240 points?" with a UUID has not answered it.
type pointsEntryDTO struct {
	ID     string  `json:"id"`
	Delta  int     `json:"delta"`
	Reason string  `json:"reason"`
	Note   string  `json:"note"`
	TripID *string `json:"trip_id"`
	// Empty when the trip is gone. The row stays either way: deleting a trip
	// does not un-earn what it paid.
	TripTitle  string `json:"trip_title"`
	OccurredAt string `json:"occurred_at"`
}

type pointsLedgerDTO struct {
	Balance int `json:"balance"`
	// Everything ever awarded, ignoring what has since been spent — the same
	// figure the public creator page shows (W11.2).
	Earned  int              `json:"earned"`
	Entries []pointsEntryDTO `json:"entries"`
	// Opaque, and empty when this was the last page.
	NextCursor string `json:"next_cursor"`
}

// pointsPageSize is a page of the ledger, not the whole history. Thirty rows
// used to be the ceiling on the entire endpoint, which is why a busy account
// could only ever see its last few weeks.
const pointsPageSize = 30

func (s *Server) handleMyPoints(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	cursor, err := parsePointsCursor(c.QueryParam("cursor"))
	if err != nil {
		return request.BadRequest(c, "ตำแหน่งของหน้าไม่ถูกต้อง")
	}

	rows, hasMore, err := s.points.ListPage(ctx, userID, cursor, pointsPageSize)
	if err != nil {
		return request.Internal(c, "โหลดประวัติแต้มไม่สำเร็จ")
	}

	balance, _ := s.points.Balance(ctx, userID)
	earned, _ := s.points.Earned(ctx, userID)

	out := pointsLedgerDTO{
		Balance: balance,
		Earned:  earned,
		Entries: s.pointsEntryDTOs(ctx, rows),
	}
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		out.NextCursor = formatPointsCursor(models.PointsCursor{
			OccurredAt: last.OccurredAt,
			ID:         last.ID,
		})
	}

	return c.JSON(http.StatusOK, out)
}

// pointsEntryDTOs resolves every trip on the page in one query rather than one
// per row: a page is thirty rows and they cluster on a handful of trips.
func (s *Server) pointsEntryDTOs(ctx contextT, rows []models.UserPoints) []pointsEntryDTO {
	ids := make([]string, 0, len(rows))
	seen := make(map[string]bool, len(rows))
	for _, row := range rows {
		if row.TripID == nil || seen[*row.TripID] {
			continue
		}
		seen[*row.TripID] = true
		ids = append(ids, *row.TripID)
	}
	titles, _ := s.trips.TitlesByIDs(ctx, ids)

	out := make([]pointsEntryDTO, 0, len(rows))
	for _, row := range rows {
		dto := pointsEntryDTO{
			ID:         row.ID,
			Delta:      row.Delta,
			Reason:     row.Reason,
			Note:       row.Note,
			TripID:     row.TripID,
			OccurredAt: row.OccurredAt.UTC().Format(time.RFC3339),
		}
		if row.TripID != nil {
			dto.TripTitle = titles[*row.TripID]
		}
		out = append(out, dto)
	}
	return out
}

// The cursor is `<rfc3339 nano>|<uuid>`, deliberately readable. It is a
// position in the caller's own ledger rather than a capability: forging one
// reaches nothing the plain endpoint would not already hand them.
const pointsCursorSep = "|"

var errBadPointsCursor = errors.New("bad points cursor")

func formatPointsCursor(cursor models.PointsCursor) string {
	return cursor.OccurredAt.UTC().Format(time.RFC3339Nano) + pointsCursorSep + cursor.ID
}

func parsePointsCursor(raw string) (*models.PointsCursor, error) {
	if raw == "" {
		return nil, nil
	}
	at, id, ok := strings.Cut(raw, pointsCursorSep)
	if !ok || id == "" {
		return nil, errBadPointsCursor
	}
	occurred, err := time.Parse(time.RFC3339Nano, at)
	if err != nil {
		return nil, errBadPointsCursor
	}
	return &models.PointsCursor{OccurredAt: occurred, ID: id}, nil
}

/* -------------------------------------------------------- audience (A23.2) */

type audienceTripDTO struct {
	TripID string `json:"trip_id"`
	Title  string `json:"title"`
	Slug   string `json:"slug"`
	Views  int    `json:"views"`
	Clones int    `json:"clones"`
	// How many of those copies actually paid out, and what they paid. The two
	// can differ: copying your own trip earns nothing, and rows written before
	// a rate changed keep whatever they were worth.
	AwardedClones int `json:"awarded_clones"`
	PointsEarned  int `json:"points_earned"`
}

type audienceDTO struct {
	TotalViews   int `json:"total_views"`
	TotalClones  int `json:"total_clones"`
	PointsEarned int `json:"points_earned"`
	PublicTrips  int `json:"public_trips"`
	// Which plan is doing the work, so a card can lead with it.
	TopTripID string            `json:"top_trip_id"`
	Trips     []audienceTripDTO `json:"trips"`
}

// handleMyAudience is the owner's view of numbers that until now existed only
// on their own public profile.
//
// `/u/[handle]` has shown views and clones since W11.2 — but only to whoever
// knows the handle, and only as a total. This is the same data, for the person
// it belongs to, per trip, joined to what each one earned.
func (s *Server) handleMyAudience(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trips, err := s.trips.ListPublicByOwner(ctx, userID)
	if err != nil {
		return request.Internal(c, "โหลดยอดคนตามรอยไม่สำเร็จ")
	}
	// One grouped query for the whole page rather than one per trip.
	byTrip, _ := s.points.EarnedByTrip(ctx, userID, models.PointsReasonClone)

	out := audienceDTO{
		PublicTrips: len(trips),
		Trips:       make([]audienceTripDTO, 0, len(trips)),
	}
	best := 0

	for _, trip := range trips {
		awarded := byTrip[trip.ID]
		row := audienceTripDTO{
			TripID:        trip.ID,
			Title:         trip.Title,
			Views:         trip.ViewCount,
			Clones:        trip.CloneCount,
			AwardedClones: awarded.Count,
			PointsEarned:  awarded.Points,
		}
		if trip.Slug != nil {
			row.Slug = *trip.Slug
		}

		out.TotalViews += row.Views
		out.TotalClones += row.Clones
		out.PointsEarned += row.PointsEarned
		// Most followed, with views as the tie-break — "copied" is what this
		// card is about, and a view is a tenth of an intention.
		if rank := row.Clones*5 + row.Views; rank > best {
			best, out.TopTripID = rank, row.TripID
		}

		out.Trips = append(out.Trips, row)
	}

	sort.SliceStable(out.Trips, func(a, b int) bool {
		if out.Trips[a].Clones != out.Trips[b].Clones {
			return out.Trips[a].Clones > out.Trips[b].Clones
		}
		return out.Trips[a].Views > out.Trips[b].Views
	})

	return c.JSON(http.StatusOK, out)
}
