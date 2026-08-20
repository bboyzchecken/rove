package api

import (
	"context"
	"encoding/json"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Shared plumbing every trip handler needs: hydrating a member list, logging an
// activity line, publishing an event, and recomputing coverage after the plan
// changes. Kept here so no handler grows a private copy that drifts.

/* --------------------------------------------------------------- members -- */

type memberSet struct {
	members []models.TripMember
	users   map[string]models.User
	// Who has at least one wish, which the member list and the nudge both need.
	hasWishlist map[string]bool
}

func (m memberSet) ids() []string {
	out := make([]string, 0, len(m.members))
	for _, member := range m.members {
		out = append(out, member.UserID)
	}
	return out
}

func (m memberSet) characterIDs() []string {
	out := make([]string, 0, len(m.members))
	for _, member := range m.members {
		character := "shiba"
		if u, ok := m.users[member.UserID]; ok && u.CharacterID != nil && *u.CharacterID != "" {
			character = *u.CharacterID
		}
		out = append(out, character)
	}
	return out
}

func (m memberSet) dtos() []memberDTO {
	out := make([]memberDTO, 0, len(m.members))
	for _, member := range m.members {
		out = append(out, toMemberDTO(member, m.users[member.UserID], m.hasWishlist[member.UserID]))
	}
	return out
}

// loadMembers hydrates the roster in two queries rather than N+1.
func (s *Server) loadMembers(ctx context.Context, tripID string) (memberSet, error) {
	members, err := s.members.ListByTrip(ctx, tripID)
	if err != nil {
		return memberSet{}, err
	}

	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}

	users, err := s.users.ListByIDs(ctx, ids)
	if err != nil {
		return memberSet{}, err
	}
	byID := make(map[string]models.User, len(users))
	for _, u := range users {
		byID[u.ID] = u
	}

	wishes, err := s.wishlist.ListByTrip(ctx, tripID)
	if err != nil {
		return memberSet{}, err
	}
	hasWishlist := make(map[string]bool, len(byID))
	for _, w := range wishes {
		hasWishlist[w.UserID] = true
	}

	return memberSet{members: members, users: byID, hasWishlist: hasWishlist}, nil
}

/* -------------------------------------------------------------- activity -- */

// track writes the activity line and publishes the event in one call. DEV_SPEC
// §6.2: every mutation does both, so a member who was not looking still finds
// out what changed.
func (s *Server) track(c echo.Context, tripID, text, eventType, targetType, targetID string) {
	ctx := c.Request().Context()
	actor := request.UserID(c)

	if text != "" {
		_ = s.collab.Log(ctx, &models.Activity{
			TripID:     tripID,
			UserID:     actor,
			Text:       text,
			TargetType: targetType,
			TargetID:   strPtr(targetID),
		})
	}

	if eventType != "" {
		_ = s.hub.Publish(ctx, tripID, events.Event{
			Type:       eventType,
			TargetType: targetType,
			TargetID:   targetID,
			ActorID:    actor,
			TS:         time.Now().UTC(),
		})
	}
}

/* -------------------------------------------------------------- coverage -- */

// recomputeCoverage re-derives every wish's state from the plan and writes it
// back (A3.5). Called after anything that changes either side.
func (s *Server) recomputeCoverage(ctx context.Context, tripID string) (domain.CoverageSummary, error) {
	wishes, err := s.wishlist.ListByTrip(ctx, tripID)
	if err != nil {
		return domain.CoverageSummary{}, err
	}
	items, err := s.plans.ListItems(ctx, tripID)
	if err != nil {
		return domain.CoverageSummary{}, err
	}

	wishInputs := make([]domain.WishInput, 0, len(wishes))
	for _, w := range wishes {
		wishInputs = append(wishInputs, domain.WishInput{
			ID:    w.ID,
			Kind:  w.Kind,
			Text:  w.Title,
			Tags:  jsonStrings(json.RawMessage(w.Tags)),
			POIID: derefString(w.POIID),
		})
	}

	itemInputs := make([]domain.PlanItemInput, 0, len(items))
	for _, item := range items {
		itemInputs = append(itemInputs, domain.PlanItemInput{
			ID:    item.ID,
			Title: item.Title,
			POIID: derefString(item.POIID),
		})
	}

	results := domain.ComputeCoverage(wishInputs, itemInputs)

	writes := make(map[string]models.CoverageWrite, len(results))
	for _, r := range results {
		write := models.CoverageWrite{Coverage: string(r.Status)}
		if r.Status == domain.CoverageNA {
			write.Coverage = models.CoverageCovered // nothing left to do about it
		}
		if len(r.CoveredByItemID) > 0 {
			id := r.CoveredByItemID[0]
			write.ItemID = &id
		}
		writes[r.WishlistItemID] = write
	}
	if err := s.wishlist.SetCoverage(ctx, tripID, writes); err != nil {
		return domain.CoverageSummary{}, err
	}

	return domain.SummariseCoverage(wishInputs, results), nil
}

func toCoverageDTO(s domain.CoverageSummary) coverageDTO {
	return coverageDTO{
		Covered:     s.Covered,
		Partial:     s.Partial,
		Uncovered:   s.Uncovered,
		Total:       s.Total,
		MustCovered: s.MustCovered,
		MustTotal:   s.MustTotal,
		Percent:     s.Percent,
	}
}

/* ------------------------------------------------------------------ misc -- */

// contextT is an alias so handler helpers read as plainly as the handlers do.
type contextT = context.Context

func unmarshalJSON(raw datatypes.JSON, dst any) error {
	return json.Unmarshal(raw, dst)
}

func toDatatypesJSON(v any) datatypes.JSON {
	return datatypes.JSON(toJSON(v))
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func jsonArray(values []string) datatypes.JSON {
	if values == nil {
		values = []string{}
	}
	return datatypes.JSON(toJSON(values))
}

// tripFxRate is the rate the trip snapshotted, falling back to the standing
// JPY→THB estimate so a budget never renders as zero.
func tripFxRate(t models.Trip) float64 {
	if t.FxRate != nil && *t.FxRate > 0 {
		return *t.FxRate
	}
	return 0.235
}

func parseDateParam(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, false
	}
	t, err := domain.ParseDate(value)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
