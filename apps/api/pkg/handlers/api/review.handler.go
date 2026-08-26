package api

import (
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Reviews (M21 — A11.5).
//
// A published plan says what a trip was meant to cost. A review says what it
// actually cost, from somebody who went — which is the number a stranger
// reading the plan wants most. Writing one is member-only and only after the
// trip is over; reading the roll-up is part of the public payload, because a
// plan with no honest aftermath is exactly the kind nobody should follow.
func (s *Server) registerReviewRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)

	g.GET("/:tripId/reviews", s.handleListReviews, view)
	g.PUT("/:tripId/reviews/me", s.handleSaveReview, view)
	g.DELETE("/:tripId/reviews/me", s.handleDeleteReview, view)
}

/* -------------------------------------------------------------- payloads -- */

type reviewDTO struct {
	UserID                string  `json:"user_id"`
	Name                  string  `json:"name"`
	CharacterID           string  `json:"character_id"`
	Rating                int     `json:"rating"`
	ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
	Body                  string  `json:"body"`
	CreatedAt             string  `json:"created_at"`
}

type reviewSummaryDTO struct {
	Count                 int     `json:"count"`
	AverageRating         float64 `json:"average_rating"`
	ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
	BudgetSaid            int     `json:"budget_said"`
}

type reviewListDTO struct {
	Summary reviewSummaryDTO `json:"summary"`
	Entries []reviewDTO      `json:"entries"`
	// The caller's own review, so the form opens filled in.
	Mine *reviewDTO `json:"mine"`
	// False until the trip is over — the form is read-only before that.
	CanReview bool `json:"can_review"`
}

type saveReviewRequest struct {
	Rating                int     `json:"rating"`
	ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
	Body                  string  `json:"body"`
}

/* --------------------------------------------------------------- reading -- */

func (s *Server) handleListReviews(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	reviews, err := s.reviews.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดรีวิวไม่สำเร็จ")
	}

	out := reviewListDTO{
		Summary:   toReviewSummaryDTO(summariseReviews(reviews)),
		Entries:   s.reviewDTOs(ctx, reviews),
		CanReview: tripIsOver(*trip),
	}
	for i := range out.Entries {
		if out.Entries[i].UserID == userID {
			mine := out.Entries[i]
			out.Mine = &mine
			break
		}
	}

	return c.JSON(http.StatusOK, out)
}

/* --------------------------------------------------------------- writing -- */

func (s *Server) handleSaveReview(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	// "How was it?" has no answer while you are still packing.
	if !tripIsOver(*trip) {
		return request.Error(c, http.StatusConflict, "รีวิวได้หลังทริปจบแล้วเท่านั้น")
	}

	var req saveReviewRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return request.BadRequest(c, "ให้ดาว 1–5 ดวง")
	}
	if req.ActualBudgetPerPerson < 0 {
		return request.BadRequest(c, "ยอดที่ใช้จริงติดลบไม่ได้")
	}

	review := &models.TripReview{
		TripID:                tripID,
		UserID:                userID,
		Rating:                req.Rating,
		ActualBudgetPerPerson: req.ActualBudgetPerPerson,
		Body:                  req.Body,
	}
	if err := s.reviews.Upsert(ctx, review); err != nil {
		return request.Internal(c, "บันทึกรีวิวไม่สำเร็จ")
	}

	s.track(c, tripID, "เขียนรีวิวทริปนี้แล้ว", "", "trip", tripID)

	reviews, _ := s.reviews.ListByTrip(ctx, tripID)
	saved := s.reviewDTO(ctx, *review)

	return c.JSON(http.StatusOK, reviewListDTO{
		Summary:   toReviewSummaryDTO(summariseReviews(reviews)),
		Entries:   s.reviewDTOs(ctx, reviews),
		Mine:      &saved,
		CanReview: true,
	})
}

func (s *Server) handleDeleteReview(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	if _, err := s.reviews.Get(ctx, tripID, userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.NoContent(http.StatusNoContent)
		}
		return request.Internal(c, "ลบรีวิวไม่สำเร็จ")
	}
	if err := s.reviews.Delete(ctx, tripID, userID); err != nil {
		return request.Internal(c, "ลบรีวิวไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

/* ---------------------------------------------------------------- shared -- */

// tripIsOver is the one definition of "post-trip" the whole feature uses: the
// end date has passed, or the room was archived early.
func tripIsOver(trip models.Trip) bool {
	if trip.Status == models.TripStatusDone {
		return true
	}
	if trip.EndDate == nil {
		return false
	}
	return trip.EndDate.Before(time.Now().UTC().Truncate(24 * time.Hour))
}

// summariseReviews is the in-memory twin of ReviewStore.SummaryByTrips, used
// when the rows are already loaded. Both count the budget average over the
// people who gave one, never over everybody.
func summariseReviews(reviews []models.TripReview) models.ReviewSummary {
	summary := models.ReviewSummary{Count: len(reviews)}
	if len(reviews) == 0 {
		return summary
	}

	ratings, budgets := 0, 0.0
	for _, r := range reviews {
		ratings += r.Rating
		if r.ActualBudgetPerPerson > 0 {
			budgets += r.ActualBudgetPerPerson
			summary.BudgetSaid++
		}
	}

	summary.AverageRating = math.Round(float64(ratings)/float64(len(reviews))*10) / 10
	if summary.BudgetSaid > 0 {
		summary.ActualBudgetPerPerson = math.Round(budgets / float64(summary.BudgetSaid))
	}
	return summary
}

func toReviewSummaryDTO(s models.ReviewSummary) reviewSummaryDTO {
	return reviewSummaryDTO{
		Count:                 s.Count,
		AverageRating:         math.Round(s.AverageRating*10) / 10,
		ActualBudgetPerPerson: math.Round(s.ActualBudgetPerPerson),
		BudgetSaid:            s.BudgetSaid,
	}
}

func (s *Server) reviewDTOs(ctx contextT, reviews []models.TripReview) []reviewDTO {
	out := make([]reviewDTO, 0, len(reviews))
	for _, review := range reviews {
		out = append(out, s.reviewDTO(ctx, review))
	}
	return out
}

// reviewDTO carries the reviewer's display name and character and nothing
// else — a review is public, the account behind it is not.
func (s *Server) reviewDTO(ctx contextT, review models.TripReview) reviewDTO {
	dto := reviewDTO{
		UserID:                review.UserID,
		Name:                  "นักเดินทาง",
		CharacterID:           "shiba",
		Rating:                review.Rating,
		ActualBudgetPerPerson: review.ActualBudgetPerPerson,
		Body:                  review.Body,
		CreatedAt:             review.CreatedAt.UTC().Format(time.RFC3339),
	}
	if user, err := s.users.GetByID(ctx, review.UserID); err == nil {
		dto.Name = user.DisplayName
		if user.CharacterID != nil && *user.CharacterID != "" {
			dto.CharacterID = *user.CharacterID
		}
	}
	return dto
}
