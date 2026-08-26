package models

import "context"

// Trip reviews (DEV_SPEC §4 / A11.5).
//
// A published plan says what a trip was going to cost. A review says what it
// actually cost, from someone who went — which is the number a stranger reading
// the plan actually wants. One row per member per trip: a review is a person's
// opinion, not the group's, and editing it replaces it rather than adding a
// second one.
//
// This is deliberately NOT the expense ledger. `expense_entries` is the
// group's private accounting and never leaves the room (W16.5); the figure
// here is one number a traveller chose to publish about their own trip.
type TripReview struct {
	Base
	TripID string `gorm:"type:char(36);not null;uniqueIndex:idx_review_trip_user" json:"trip_id"`
	UserID string `gorm:"type:char(36);not null;uniqueIndex:idx_review_trip_user" json:"user_id"`
	// 1–5. There is no zero: a review with no rating is a comment.
	Rating int `gorm:"not null" json:"rating"`
	// THB per person, 0 when the reviewer did not want to say.
	ActualBudgetPerPerson float64 `gorm:"type:decimal(12,2);not null;default:0" json:"actual_budget_per_person"`
	Body                  string  `gorm:"type:text" json:"body"`
}

func (TripReview) TableName() string { return "trip_reviews" }

// ReviewSummary is the rolled-up view a card shows: how it went, and what it
// really cost. `BudgetSaid` is kept separate because an average over the people
// who answered is honest and an average over everyone is not.
type ReviewSummary struct {
	Count                 int     `json:"count"`
	AverageRating         float64 `json:"average_rating"`
	ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
	BudgetSaid            int     `json:"budget_said"`
}

// PlatformReviews is every review on the platform rolled into one line
// (A24.1): how many people reviewed, and how they rated it on average.
type PlatformReviews struct {
	Count         int64   `json:"count"`
	AverageRating float64 `json:"average_rating"`
}

// PublicReview is a review shown outside the trip it belongs to (A24.2): on
// the landing page and in explore, where the reader has no idea which trip
// this is unless the row carries it.
//
// It is assembled from a join rather than stored: `trip_reviews` holds the
// opinion, `trips` holds what it is about, `users` holds who said it.
type PublicReview struct {
	TripID    string  `json:"trip_id"`
	TripTitle string  `json:"trip_title"`
	TripSlug  string  `json:"trip_slug"`
	Country   string  `json:"country"`
	Rating    int     `json:"rating"`
	Body      string  `json:"body"`
	// THB per person, 0 when the reviewer did not want to say.
	ActualBudgetPerPerson float64 `json:"actual_budget_per_person"`
	Name        string `json:"name"`
	CharacterID string `json:"character_id"`
	CreatedAt   string `json:"created_at"`
}

type ReviewStore interface {
	// Upsert writes this member's review, replacing their previous one.
	Upsert(ctx context.Context, r *TripReview) error
	Get(ctx context.Context, tripID, userID string) (*TripReview, error)
	ListByTrip(ctx context.Context, tripID string) ([]TripReview, error)
	Delete(ctx context.Context, tripID, userID string) error
	// SummaryByTrips feeds the explore feed and the creator page without one
	// query per card.
	SummaryByTrips(ctx context.Context, tripIDs []string) (map[string]ReviewSummary, error)
	// Platform rolls every review into one line for /public/stats (A24.1).
	Platform(ctx context.Context) (PlatformReviews, error)
	// ListRecentPublic returns reviews with something written in them, from
	// trips their owners published (A24.2). A review of a private trip is not
	// social proof — it is somebody's diary.
	ListRecentPublic(ctx context.Context, limit int) ([]PublicReview, error)
}
