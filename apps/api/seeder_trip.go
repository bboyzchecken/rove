package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// The published example trip (data/demo-trip.json).
//
// The landing page offers "ดูทริปตัวอย่าง" to a visitor who has not signed in.
// That used to point at /t/demo — the trip *room*, which is behind the sign-in
// wall and, in live mode, did not exist in MySQL at all: the id only ever
// existed in the web app's browser seed. So the button was a redirect to
// /login in one mode and a 404 in the other.
//
// The fix is a real published trip, served by the read-only public page that
// already exists for shared plans (/p/:slug). Which means the database needs
// one, and it needs to be the same itinerary the mock seed shows, or the two
// modes disagree about what the product looks like.
//
// The travellers who own it are ordinary user rows with provider "seed": they
// can never be signed in as (no OAuth uid will ever match) and they are not
// admins, which is why findOrCreateUser now asks "is there an admin yet"
// rather than "is the users table empty".

type demoSeed struct {
	Users []struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
		Handle      string `json:"handle"`
		CharacterID string `json:"character_id"`
		IsCreator   bool   `json:"is_creator"`
	} `json:"users"`

	Trip struct {
		ID                 string   `json:"id"`
		OwnerID            string   `json:"owner_id"`
		Title              string   `json:"title"`
		Slug               string   `json:"slug"`
		ShareToken         string   `json:"share_token"`
		DestinationCountry string   `json:"destination_country"`
		DestinationCities  []string `json:"destination_cities"`
		StartDate          string   `json:"start_date"`
		EndDate            string   `json:"end_date"`
		PartySize          int      `json:"party_size"`
		HomeCurrency       string   `json:"home_currency"`
		DestCurrency       string   `json:"dest_currency"`
		FxRate             float64  `json:"fx_rate"`
		Visibility         string   `json:"visibility"`
		Status             string   `json:"status"`
		CoverImageURL      string   `json:"cover_image_url"`
		BudgetPerPersonTHB float64  `json:"budget_per_person_thb"`
		Summary            string   `json:"summary"`
		ViewCount          int      `json:"view_count"`
		CloneCount         int      `json:"clone_count"`
	} `json:"trip"`

	Members []struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	} `json:"members"`

	Plan struct {
		ID         string   `json:"id"`
		Label      string   `json:"label"`
		Rationales []string `json:"rationales"`
	} `json:"plan"`

	Days []struct {
		ID          string   `json:"id"`
		DayIndex    int      `json:"day_index"`
		Date        string   `json:"date"`
		Label       string   `json:"label"`
		City        string   `json:"city"`
		WeatherIcon string   `json:"weather_icon"`
		WeatherHigh *float64 `json:"weather_high"`
		WeatherLow  *float64 `json:"weather_low"`
		WeatherText string   `json:"weather_text"`

		Items []struct {
			ID            string   `json:"id"`
			SortOrder     int      `json:"sort_order"`
			Type          string   `json:"type"`
			StartTime     string   `json:"start_time"`
			EndTime       string   `json:"end_time"`
			Title         string   `json:"title"`
			Area          string   `json:"area"`
			CostJPY       *float64 `json:"cost_jpy"`
			TravelMinutes *int     `json:"travel_minutes"`
			TravelMode    string   `json:"travel_mode"`
			TravelLine    string   `json:"travel_line"`
			OpenHours     string   `json:"open_hours"`
			ForUserIDs    []string `json:"for_user_ids"`
			Bookable      bool     `json:"bookable"`
			Booked        bool     `json:"booked"`
			Warning       string   `json:"warning"`
			Note          string   `json:"note"`
		} `json:"items"`
	} `json:"days"`
}

func seedDemoTrip(ctx context.Context, db *gorm.DB) error {
	path := filepath.Join("data", "demo-trip.json")

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.L().Warnf("%s not found — skipping the example trip", path)
			return nil
		}
		return err
	}

	var seed demoSeed
	if err := json.Unmarshal(raw, &seed); err != nil {
		return fmt.Errorf("demo-trip.json: %w", err)
	}
	if seed.Trip.ID == "" || seed.Trip.Slug == "" {
		return fmt.Errorf("demo-trip.json: trip id and slug are required")
	}

	// Every id in the file is a UUID v5 derived from a stable name, so the whole
	// seed is an upsert: running it on each deploy repairs drift and never
	// duplicates. The days and items are replaced wholesale instead — an
	// itinerary that shrank between two versions would otherwise keep the rows
	// it no longer has.
	//
	// A fresh statement per row, never one chained *gorm.DB reused across
	// models: a chain carries the schema of whatever it saw first, and feeding
	// it a second type makes it write one struct's fields through another
	// struct's offsets.
	upsert := func() *gorm.DB {
		return db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true})
	}

	for _, u := range seed.Users {
		handle := u.Handle
		character := u.CharacterID
		user := models.User{
			Base:        models.Base{ID: u.ID},
			DisplayName: u.DisplayName,
			Handle:      &handle,
			// "seed", not "password": no OAuth exchange can ever produce this
			// provider, so these accounts have no way in by construction.
			Provider:     "seed",
			ProviderUID:  "seed:" + handle,
			Role:         models.RoleUser,
			Status:       models.UserStatusActive,
			IsCreator:    u.IsCreator,
			Locale:       "th",
			HomeCurrency: "THB",
			CharacterID:  &character,
		}
		if err := upsert().Create(&user).Error; err != nil {
			return fmt.Errorf("seed user %s: %w", u.DisplayName, err)
		}
	}

	start, err := parseSeedDate(seed.Trip.StartDate)
	if err != nil {
		return err
	}
	end, err := parseSeedDate(seed.Trip.EndDate)
	if err != nil {
		return err
	}

	cities, _ := json.Marshal(seed.Trip.DestinationCities)
	slug := seed.Trip.Slug
	shareToken := seed.Trip.ShareToken
	fx := seed.Trip.FxRate

	trip := models.Trip{
		Base:               models.Base{ID: seed.Trip.ID},
		OwnerID:            seed.Trip.OwnerID,
		Title:              seed.Trip.Title,
		Slug:               &slug,
		DestinationCountry: seed.Trip.DestinationCountry,
		DestinationCities:  datatypes.JSON(cities),
		StartDate:          &start,
		EndDate:            &end,
		PartySize:          seed.Trip.PartySize,
		HomeCurrency:       seed.Trip.HomeCurrency,
		DestCurrency:       seed.Trip.DestCurrency,
		FxRate:             &fx,
		Visibility:         seed.Trip.Visibility,
		ShareToken:         &shareToken,
		Status:             seed.Trip.Status,
		CoverImageURL:      seed.Trip.CoverImageURL,
		Summary:            seed.Trip.Summary,
		CloneCount:         seed.Trip.CloneCount,
		ViewCount:          seed.Trip.ViewCount,
		BudgetPerPersonTHB: seed.Trip.BudgetPerPersonTHB,
		DatesLockedAt:      &start,
		DestinationID:      "japan",
	}
	if err := upsert().Create(&trip).Error; err != nil {
		return fmt.Errorf("seed trip: %w", err)
	}

	for _, m := range seed.Members {
		member := models.TripMember{
			TripID:   trip.ID,
			UserID:   m.UserID,
			Role:     m.Role,
			JoinedAt: start,
		}
		if err := upsert().Create(&member).Error; err != nil {
			return fmt.Errorf("seed member: %w", err)
		}
	}

	rationales, _ := json.Marshal(seed.Plan.Rationales)
	plan := models.Plan{
		Base:       models.Base{ID: seed.Plan.ID},
		TripID:     trip.ID,
		Label:      seed.Plan.Label,
		IsFinal:    true,
		Rationales: datatypes.JSON(rationales),
		CreatedBy:  trip.OwnerID,
	}
	if err := upsert().Create(&plan).Error; err != nil {
		return fmt.Errorf("seed plan: %w", err)
	}

	if err := db.WithContext(ctx).Where("trip_id = ?", trip.ID).Delete(&models.PlanItem{}).Error; err != nil {
		return fmt.Errorf("clear demo items: %w", err)
	}
	if err := db.WithContext(ctx).Where("trip_id = ?", trip.ID).Delete(&models.PlanDay{}).Error; err != nil {
		return fmt.Errorf("clear demo days: %w", err)
	}

	items := 0
	for _, d := range seed.Days {
		date, err := parseSeedDate(d.Date)
		if err != nil {
			return err
		}
		day := models.PlanDay{
			Base:        models.Base{ID: d.ID},
			PlanID:      plan.ID,
			TripID:      trip.ID,
			DayIndex:    d.DayIndex,
			Date:        date,
			Label:       d.Label,
			City:        d.City,
			WeatherIcon: d.WeatherIcon,
			WeatherHigh: d.WeatherHigh,
			WeatherLow:  d.WeatherLow,
			WeatherText: d.WeatherText,
		}
		if err := db.WithContext(ctx).Create(&day).Error; err != nil {
			return fmt.Errorf("seed day %d: %w", d.DayIndex, err)
		}

		for _, it := range d.Items {
			forUsers, _ := json.Marshal(it.ForUserIDs)
			item := models.PlanItem{
				Base:       models.Base{ID: it.ID},
				DayID:      day.ID,
				TripID:     trip.ID,
				SortOrder:  it.SortOrder,
				Type:       it.Type,
				StartTime:  it.StartTime,
				EndTime:    it.EndTime,
				Title:      it.Title,
				Area:       it.Area,
				CostJPY:    it.CostJPY,
				TravelMin:  it.TravelMinutes,
				TravelMode: it.TravelMode,
				TravelLine: it.TravelLine,
				OpenHours:  it.OpenHours,
				ForUsers:   datatypes.JSON(forUsers),
				Bookable:   it.Bookable,
				Booked:     it.Booked,
				Warning:    it.Warning,
				Note:       it.Note,
			}
			if err := db.WithContext(ctx).Create(&item).Error; err != nil {
				return fmt.Errorf("seed item %s: %w", it.Title, err)
			}
			items++
		}
	}

	logger.L().Infof(
		"example trip seeded: /p/%s — %d days, %d items, %d travellers",
		slug, len(seed.Days), items, len(seed.Users),
	)
	return nil
}

func parseSeedDate(value string) (time.Time, error) {
	t, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, fmt.Errorf("bad date %q: %w", value, err)
	}
	return t, nil
}
