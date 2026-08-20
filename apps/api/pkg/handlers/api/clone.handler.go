package api

import (
	"context"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Cloning is what makes a public trip worth publishing: the copy carries
// source_creator_id, so when the cloner books through it the original author
// earns points (DEV_SPEC §1, §6.5).
//
// The whole copy is one transaction. A half-copied trip — days without items,
// a plan without days — is worse than no copy at all.

// cloneInto copies a source trip's final (or newest) plan into a brand new trip
// owned by userID.
func (s *Server) cloneInto(c echo.Context, sourceTripID, userID string) error {
	ctx := c.Request().Context()

	source, err := s.trips.GetByID(ctx, sourceTripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริปต้นแบบ")
	}

	// A private trip may only be cloned by someone already inside it; a link or
	// public trip may be cloned by anyone who can reach it.
	if source.Visibility == models.VisibilityPrivate {
		if _, err := s.members.Get(ctx, sourceTripID, userID); err != nil {
			return request.NotFound(c, "ไม่พบทริปต้นแบบ")
		}
	}

	sourcePlan, err := s.planToClone(ctx, source)
	if err != nil {
		return request.BadRequest(c, "ทริปต้นแบบยังไม่มีแพลนให้คัดลอก")
	}
	days, err := s.plans.Days(ctx, sourcePlan.ID)
	if err != nil {
		return request.Internal(c, "อ่านแพลนต้นแบบไม่สำเร็จ")
	}
	items, err := s.plans.Items(ctx, sourcePlan.ID)
	if err != nil {
		return request.Internal(c, "อ่านรายการต้นแบบไม่สำเร็จ")
	}

	itemsByDay := map[string][]models.Item{}
	for _, it := range items {
		itemsByDay[it.DayID] = append(itemsByDay[it.DayID], it)
	}

	newTrip := &models.Trip{
		OwnerID:            userID,
		Title:              source.Title + " (คัดลอก)",
		DestinationCountry: source.DestinationCountry,
		DestinationCities:  source.DestinationCities,
		StartDate:          source.StartDate,
		EndDate:            source.EndDate,
		PartySize:          source.PartySize,
		HomeCurrency:       source.HomeCurrency,
		DestCurrency:       source.DestCurrency,
		Visibility:         models.VisibilityPrivate,
		Status:             models.TripStatusPlanning,
		SourceTripID:       &source.ID,
		CoverImageURL:      source.CoverImageURL,
		Summary:            source.Summary,
		PublicHideExpense:  true,
	}
	// The attribution edge. Without it a booking made from the copy earns
	// nobody anything and the whole public incentive collapses.
	if source.OwnerID != userID {
		creator := source.OwnerID
		newTrip.SourceCreatorID = &creator
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(newTrip).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.TripMember{
			TripID: newTrip.ID, UserID: userID,
			Role: models.TripRoleOwner, JoinedAt: time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		newPlan := &models.Plan{
			TripID:      newTrip.ID,
			Name:        sourcePlan.Name,
			Version:     1,
			CreatedBy:   models.CreatedByUser,
			Summary:     sourcePlan.Summary,
			Pros:        sourcePlan.Pros,
			Cons:        sourcePlan.Cons,
			KeyDecision: sourcePlan.KeyDecision,
			Status:      models.PlanStatusReady,
		}
		newPlan.CreatedByUserID = &userID
		if err := tx.Create(newPlan).Error; err != nil {
			return err
		}

		for _, d := range days {
			newDay := &models.Day{
				PlanID: newPlan.ID, Date: d.Date, DayIndex: d.DayIndex,
				Title: d.Title, Theme: d.Theme, SortOrder: d.SortOrder,
			}
			if err := tx.Create(newDay).Error; err != nil {
				return err
			}

			for _, it := range itemsByDay[d.ID] {
				copied := it
				copied.ID = ""
				copied.PlanID = newPlan.ID
				copied.DayID = newDay.ID
				// Booking state belongs to whoever booked it, not to the copy.
				copied.BookingStatus = models.BookingStatusNone
				copied.BookingURL = ""
				copied.CostStatus = models.CostStatusEstimate
				copied.IsPrepaid = false
				if err := tx.Create(&copied).Error; err != nil {
					return err
				}
			}
		}

		if err := tx.Model(&models.Trip{}).Where("id = ?", source.ID).
			UpdateColumn("clone_count", gorm.Expr("clone_count + 1")).Error; err != nil {
			return err
		}
		return tx.Create(&models.PlanClone{
			SourceTripID: source.ID, NewTripID: newTrip.ID, UserID: userID,
		}).Error
	})
	if err != nil {
		return request.Internal(c, "คัดลอกทริปไม่สำเร็จ")
	}

	s.emit(c, newTrip.ID, emitOpts{
		Action:     models.ActionTripCreated,
		EventType:  events.TypeTripUpdated,
		TargetType: "trip", TargetID: newTrip.ID,
		Meta: map[string]any{"cloned_from": source.ID},
	})
	return request.Created(c, map[string]any{
		"trip":           newTrip,
		"source_trip_id": source.ID,
	})
}

// planToClone prefers the plan the group actually agreed on.
func (s *Server) planToClone(ctx context.Context, trip *models.Trip) (*models.Plan, error) {
	plans, err := s.plans.ListByTrip(ctx, trip.ID)
	if err != nil {
		return nil, err
	}
	if len(plans) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	for _, p := range plans {
		if p.IsFinal {
			return &p, nil
		}
	}
	// ListByTrip orders is_final first then newest, so index 0 is the best
	// available fallback.
	return &plans[0], nil
}
