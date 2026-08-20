package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// The trip recap — what a finished trip leaves behind (M17 — A17.4).
//
// A room that is over stops being a place to plan and becomes a record: which
// dates won, which hotel the group actually booked, why day 3 looked like that,
// and where the money went. Every one of those already lives in the trip's own
// tables, so the recap derives them rather than storing a second copy that can
// disagree with the room.
//
// It is member-only for the same reason the Expense tab never appears in a
// shared link (W16.5): the recap prints real money.

func (s *Server) handleTripRecap(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}

	days, _ := s.plans.ListDays(ctx, tripID)
	items, _ := s.plans.ListItems(ctx, tripID)
	bookings, _ := s.bookings.ListByTrip(ctx, tripID)
	entries, _ := s.expenses.ListByTrip(ctx, tripID)
	activity, _ := s.collab.ListActivity(ctx, tripID, "", 40)
	votes, _ := s.collab.ListTripVotes(ctx, tripID)
	wishes, _ := s.wishlist.ListByTrip(ctx, tripID)

	itemsByDay := make(map[string][]models.PlanItem, len(days))
	for _, item := range items {
		itemsByDay[item.DayID] = append(itemsByDay[item.DayID], item)
	}
	itinerary := make([]planDayDTO, 0, len(days))
	for _, day := range days {
		itinerary = append(itinerary, toPlanDayDTO(day, itemsByDay[day.ID]))
	}

	rate := tripFxRate(*trip)
	spent, spending := recapSpending(entries, rate)

	tripDays := 0
	if trip.StartDate != nil && trip.EndDate != nil {
		tripDays = domain.DaysBetween(*trip.StartDate, *trip.EndDate)
	}

	activityDTOs := make([]activityDTO, 0, len(activity))
	for _, a := range activity {
		activityDTOs = append(activityDTOs, toActivityDTO(a))
	}

	return c.JSON(http.StatusOK, tripRecapDTO{
		Trip:               toTripDTO(*trip),
		Members:            roster.dtos(),
		DateLabel:          dateLabel(*trip),
		Days:               tripDays,
		Places:             len(items),
		SpentTHB:           spent,
		BudgetPerPersonTHB: trip.BudgetPerPersonTHB,
		Itinerary:          itinerary,
		Decisions:          s.recapDecisions(ctx, *trip, days, items, bookings, votes, wishes),
		Spending:           spending,
		Activity:           activityDTOs,
		Share:              s.shareStateOf(*trip),
		PointsPerPublish:   domain.PointsPerPublish,
		// Publishing is the owner's call, and only worth offering once.
		CanPublish: trip.OwnerID == userID && trip.Visibility != models.VisibilityPublic,
	})
}

// recapSpending totals what was actually spent, in THB, and splits it by
// category. Same conversion the past-trip card uses, so the two never disagree.
func recapSpending(entries []models.ExpenseEntry, rate float64) (float64, []recapSpendDTO) {
	total := 0.0
	byCategory := map[string]float64{}

	for _, e := range entries {
		amount := e.Amount
		if e.Currency != "THB" {
			amount = domain.ToHomeCurrency(e.Amount, rate)
		}
		total += amount
		category := e.Category
		if category == "" {
			category = "อื่นๆ"
		}
		byCategory[category] += amount
	}

	out := make([]recapSpendDTO, 0, len(byCategory))
	for category, amount := range byCategory {
		out = append(out, recapSpendDTO{Category: category, AmountTHB: amount})
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].AmountTHB > out[b].AmountTHB })
	return total, out
}

// recapDecisions rebuilds the choices the group made, newest source first. Each
// one names what was decided rather than what was edited: the activity feed
// already carries the blow-by-blow, and reading it back six months later is not
// how anyone answers "did we book the ryokan or the hotel?".
func (s *Server) recapDecisions(
	ctx contextT,
	trip models.Trip,
	days []models.PlanDay,
	items []models.PlanItem,
	bookings []models.Booking,
	votes []models.Vote,
	wishes []models.WishlistItem,
) []recapDecisionDTO {
	out := make([]recapDecisionDTO, 0, 8)

	if trip.StartDate != nil && trip.EndDate != nil {
		decision := recapDecisionDTO{
			ID:     "dates",
			Kind:   "dates",
			Title:  "วันที่ไป",
			Detail: domain.ThaiRangeLabel(*trip.StartDate, *trip.EndDate) + " · " + plural(domain.DaysBetween(*trip.StartDate, *trip.EndDate), "วัน"),
		}
		if trip.DatesLockedAt != nil {
			decision.DecidedAt = strPtr(trip.DatesLockedAt.UTC().Format(time.RFC3339))
			decision.DecidedBy = trip.DatesLockedBy
		}
		out = append(out, decision)
	}

	if cities := citiesOf(trip); len(cities) > 0 {
		detail := cities[0]
		for _, city := range cities[1:] {
			detail += " · " + city
		}
		out = append(out, recapDecisionDTO{
			ID:     "destination",
			Kind:   "destination",
			Title:  "ปลายทางที่เลือก",
			Detail: detail,
		})
	}

	if trip.BudgetPerPersonTHB > 0 {
		out = append(out, recapDecisionDTO{
			ID:     "budget",
			Kind:   "budget",
			Title:  "งบที่ตั้งไว้",
			Detail: "฿" + itoa(int(trip.BudgetPerPersonTHB)) + " ต่อคน",
		})
	}

	if len(days) > 0 {
		out = append(out, recapDecisionDTO{
			ID:     "plan",
			Kind:   "plan",
			Title:  "แพลนที่ลงตัว",
			Detail: plural(len(days), "วัน") + " · " + plural(len(items), "ที่"),
		})
	}

	// Why the plan looks the way it does — written when the draft was accepted
	// and never edited since (A4.6).
	if plan, err := s.plans.GetPlan(ctx, trip.ID); err == nil && plan != nil {
		for i, rationale := range jsonStrings(toJSONRaw(plan.Rationales)) {
			out = append(out, recapDecisionDTO{
				ID:     "rationale-" + itoa(i),
				Kind:   "rationale",
				Title:  "เหตุผลที่จัดแบบนี้",
				Detail: rationale,
			})
		}
	}

	for _, b := range bookings {
		if b.Status != models.BookingBooked {
			continue
		}
		detail := b.Title + " · " + b.Partner
		if b.PricePerPersonTHB != nil && *b.PricePerPersonTHB > 0 {
			detail += " · ฿" + itoa(int(*b.PricePerPersonTHB)) + " ต่อคน"
		}
		out = append(out, recapDecisionDTO{
			ID:        "booking-" + b.ID,
			Kind:      "booking",
			Title:     "จองจริง",
			Detail:    detail,
			DecidedBy: b.BookedBy,
		})
	}

	out = append(out, voteDecisions(votes, items, wishes)...)
	return out
}

// voteDecisions keeps the votes that settled something: a target the group was
// split on, with the tally that ended it. Titles come from the plan and the
// wishlist, so a vote on something since deleted is dropped rather than
// rendered as an id.
func voteDecisions(votes []models.Vote, items []models.PlanItem, wishes []models.WishlistItem) []recapDecisionDTO {
	titles := make(map[string]string, len(items)+len(wishes))
	for _, item := range items {
		titles[models.TargetItem+":"+item.ID] = item.Title
	}
	for _, wish := range wishes {
		titles[models.TargetWish+":"+wish.ID] = wish.Title
	}

	type tally struct {
		up, down int
		at       time.Time
	}
	byTarget := map[string]*tally{}
	order := make([]string, 0, len(votes))

	for _, v := range votes {
		key := v.TargetType + ":" + v.TargetID
		if _, ok := titles[key]; !ok {
			continue
		}
		t, ok := byTarget[key]
		if !ok {
			t = &tally{}
			byTarget[key] = t
			order = append(order, key)
		}
		if v.Value > 0 {
			t.up++
		} else {
			t.down++
		}
		if v.VotedAt.After(t.at) {
			t.at = v.VotedAt
		}
	}

	out := make([]recapDecisionDTO, 0, len(order))
	for _, key := range order {
		t := byTarget[key]
		out = append(out, recapDecisionDTO{
			ID:        "vote-" + key,
			Kind:      "vote",
			Title:     "โหวตกันแล้ว",
			Detail:    titles[key] + " · " + itoa(t.up) + " เอา / " + itoa(t.down) + " ไม่เอา",
			DecidedAt: strPtr(t.at.UTC().Format(time.RFC3339)),
		})
	}
	return out
}
