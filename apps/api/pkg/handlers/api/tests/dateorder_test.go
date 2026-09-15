package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Feedback #4 D-1: an end cannot be before its own start. The date fields
// already stop a person picking it that way; these pin that the API does not
// trust a client to be one of those fields.

func TestCreateTripRejectsAnEndDateBeforeTheStart(t *testing.T) {
	h := testsupport.New(t)
	_, token := h.User("alice")

	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{
		"title":      "โตเกียว",
		"start_date": "2026-12-10",
		"end_date":   "2026-12-04",
	}).ExpectStatus(http.StatusBadRequest)
}

func TestUpdateTripRejectsAnEndDateBeforeTheStart(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว") // starts 6 Apr, ends 10 Apr (testsupport.Trip)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID, token,
		map[string]any{"end_date": "2026-04-01"}).ExpectStatus(http.StatusBadRequest)
}

func TestCreateBookingRejectsACheckOutBeforeCheckIn(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/bookings", token, map[string]any{
		"title":     "โรงแรมชินจูกุ",
		"partner":   "agoda",
		"check_in":  "2026-12-10",
		"check_out": "2026-12-04",
	}).ExpectStatus(http.StatusBadRequest)
}

func TestUpdateBookingRejectsACheckOutBeforeCheckIn(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	var booking struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/bookings", token, map[string]any{
		"title": "โรงแรมชินจูกุ", "partner": "agoda", "check_in": "2026-12-04", "check_out": "2026-12-10",
	}).ExpectStatus(http.StatusCreated).Decode(&booking)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/bookings/"+booking.ID, token,
		map[string]any{"check_out": "2026-12-01"}).ExpectStatus(http.StatusBadRequest)
}

func TestCreateItemRejectsAnEndTimeBeforeStart(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")
	seedDay(t, h, trip.ID, token)

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/items", token, map[string]any{
		"title":      "ศาลเจ้าเมจิ",
		"start_time": "14:00",
		"end_time":   "09:00",
	}).ExpectStatus(http.StatusBadRequest)
}

func TestUpdateItemRejectsAnEndTimeBeforeStart(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")
	seedDay(t, h, trip.ID, token)

	var item struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/items", token, map[string]any{
		"title": "ศาลเจ้าเมจิ", "start_time": "09:00", "end_time": "11:00",
	}).ExpectStatus(http.StatusCreated).Decode(&item)

	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/items/"+item.ID, token,
		map[string]any{"start_time": "14:00", "end_time": "09:00"}).ExpectStatus(http.StatusBadRequest)
}

// A blank end time is "not decided yet" (Feedback #4 F1), never a rejection.
func TestItemWithNoEndTimeIsNotRejected(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")
	seedDay(t, h, trip.ID, token)

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/items", token, map[string]any{
		"title": "ศาลเจ้าเมจิ", "start_time": "14:00",
	}).ExpectStatus(http.StatusCreated)
}
