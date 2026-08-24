package api

import (
	"crypto/subtle"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/affiliate"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Bookings (M12 — A12.1 … A12.4).
//
// ROVE never takes a payment. Every "จอง" goes out to a partner through
// /go/:clickId, which logs the click and then redirects — that click is the
// business model, so it is recorded before the redirect, not after.
func (s *Server) registerBookingRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/bookings", s.handleListBookings, view)
	g.GET("/:tripId/bookings/offers", s.handleBookingOffers, view)
	g.POST("/:tripId/bookings", s.handleCreateBooking, edit)
	g.PATCH("/:tripId/bookings/:bookingId", s.handleUpdateBooking, edit)
	g.DELETE("/:tripId/bookings/:bookingId", s.handleDeleteBooking, edit)
	g.POST("/:tripId/bookings/:bookingId/link", s.handleBookingLink, view)
}

func (s *Server) handleListBookings(c echo.Context) error {
	bookings, err := s.bookings.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดการจองไม่สำเร็จ")
	}
	out := make([]bookingDTO, 0, len(bookings))
	for _, b := range bookings {
		out = append(out, toBookingDTO(b))
	}
	return c.JSON(http.StatusOK, out)
}

// handleBookingOffers returns the partner catalogue for a kind. The ids are
// synthetic — an offer is a suggestion until someone saves it.
func (s *Server) handleBookingOffers(c echo.Context) error {
	kind := c.QueryParam("kind")
	if kind == "" {
		kind = models.BookingStay
	}

	offers, err := s.affiliate.Offers(c.Request().Context(), kind)
	if err != nil {
		return request.Internal(c, "โหลดตัวเลือกไม่สำเร็จ")
	}

	out := make([]bookingDTO, 0, len(offers))
	for i, offer := range offers {
		price := offer.PricePerPersonTHB
		out = append(out, bookingDTO{
			ID:                "offer_" + offer.Partner + "_" + itoa(i),
			Kind:              offer.Kind,
			Title:             offer.Title,
			Partner:           partnerName(offer.Partner),
			URL:               offer.URL,
			Status:            models.BookingIdea,
			PricePerPersonTHB: &price,
			Note:              strPtr(offer.Note),
		})
	}
	return c.JSON(http.StatusOK, out)
}

type bookingRequest struct {
	Kind              string   `json:"kind"`
	Title             string   `json:"title"`
	Partner           string   `json:"partner"`
	URL               string   `json:"url"`
	Status            string   `json:"status" validate:"omitempty,oneof=idea booked cancelled"`
	PricePerPersonTHB *float64 `json:"price_per_person_thb"`
	CheckIn           string   `json:"check_in"`
	CheckOut          string   `json:"check_out"`
	ConfirmationCode  string   `json:"confirmation_code"`
	Note              string   `json:"note"`
	ItemID            *string  `json:"item_id"`
}

func (s *Server) handleCreateBooking(c echo.Context) error {
	var req bookingRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Title == "" {
		return request.BadRequest(c, "ใส่ชื่อสิ่งที่จองด้วย")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	booking := &models.Booking{
		TripID:            tripID,
		ItemID:            req.ItemID,
		Kind:              orDefault(req.Kind, models.BookingStay),
		Title:             req.Title,
		Partner:           req.Partner,
		URL:               req.URL,
		Status:            orDefault(req.Status, models.BookingIdea),
		PricePerPersonTHB: req.PricePerPersonTHB,
		ConfirmationCode:  req.ConfirmationCode,
		Note:              req.Note,
	}
	if checkIn, ok := parseDateParam(req.CheckIn); ok {
		booking.CheckIn = &checkIn
	}
	if checkOut, ok := parseDateParam(req.CheckOut); ok {
		booking.CheckOut = &checkOut
	}

	if err := s.bookings.Create(ctx, booking); err != nil {
		return request.Internal(c, "บันทึกการจองไม่สำเร็จ")
	}

	s.track(c, tripID, "บันทึกการจอง \""+booking.Title+"\"", events.TypeBookingChanged, "booking", booking.ID)
	return c.JSON(http.StatusCreated, toBookingDTO(*booking))
}

func (s *Server) handleUpdateBooking(c echo.Context) error {
	var req bookingRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	booking, err := s.bookings.Get(ctx, tripID, c.Param("bookingId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบการจองนี้")
	}

	wasBooked := booking.Status == models.BookingBooked

	if req.Title != "" {
		booking.Title = req.Title
	}
	if req.Status != "" {
		booking.Status = req.Status
	}
	if req.ConfirmationCode != "" {
		booking.ConfirmationCode = req.ConfirmationCode
	}
	if req.Note != "" {
		booking.Note = req.Note
	}
	if req.PricePerPersonTHB != nil {
		booking.PricePerPersonTHB = req.PricePerPersonTHB
	}
	if checkIn, ok := parseDateParam(req.CheckIn); ok {
		booking.CheckIn = &checkIn
	}
	if checkOut, ok := parseDateParam(req.CheckOut); ok {
		booking.CheckOut = &checkOut
	}
	if booking.Status == models.BookingBooked && booking.BookedBy == nil {
		booking.BookedBy = &userID
	}

	if err := s.bookings.Update(ctx, booking); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	// Marking an item booked keeps the timeline badge and the prepaid split in
	// the budget honest.
	if booking.ItemID != nil {
		if item, err := s.plans.GetItem(ctx, tripID, *booking.ItemID); err == nil {
			item.Booked = booking.Status == models.BookingBooked
			_ = s.plans.UpdateItem(ctx, item)
		}
	}

	if !wasBooked && booking.Status == models.BookingBooked {
		s.awardBookingPoints(ctx, tripID)
	}

	s.track(c, tripID, "", events.TypeBookingChanged, "booking", booking.ID)
	return c.JSON(http.StatusOK, toBookingDTO(*booking))
}

func (s *Server) handleDeleteBooking(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.bookings.Delete(ctx, tripID, c.Param("bookingId")); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	s.track(c, tripID, "", events.TypeBookingChanged, "booking", c.Param("bookingId"))
	return c.NoContent(http.StatusNoContent)
}

// handleBookingLink mints a tracked deeplink (A12.2). The click row is written
// first so the redirect can never happen unattributed.
func (s *Server) handleBookingLink(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	booking, err := s.bookings.Get(ctx, tripID, c.Param("bookingId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบการจองนี้")
	}

	click := &models.BookingClick{
		TripID:    tripID,
		UserID:    request.UserID(c),
		Partner:   booking.Partner,
		TargetURL: booking.URL,
		ItemID:    booking.ItemID,
		ClickedAt: time.Now().UTC(),
	}
	// A trip that was copied from someone else's public plan credits them when
	// a booking is made from it (§6.5).
	if trip, err := s.trips.GetByID(ctx, tripID); err == nil && trip.SourceCreatorID != nil {
		click.SourceCreatorID = trip.SourceCreatorID
	}

	if err := s.bookings.AddClick(ctx, click); err != nil {
		return request.Internal(c, "สร้างลิงก์ไม่สำเร็จ")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"url": s.cfg.AppBaseURL + "/go/" + click.ID,
	})
}

// handleAffiliateRedirect is the public hop: log, build the partner link, send
// them on. It never 404s into a dead end — a broken link still lands somewhere.
func (s *Server) handleAffiliateRedirect(c echo.Context) error {
	ctx := c.Request().Context()

	click, err := s.bookings.GetClick(ctx, c.Param("clickId"))
	if err != nil {
		return c.Redirect(http.StatusFound, s.cfg.WebBaseURL)
	}

	url, err := s.affiliate.BuildLink(ctx, affiliate.LinkRequest{
		Partner:    click.Partner,
		TargetURL:  click.TargetURL,
		TrackingID: click.ID,
	})
	if err != nil || url == "" {
		url = click.TargetURL
	}
	if url == "" {
		url = s.cfg.WebBaseURL
	}

	return c.Redirect(http.StatusFound, url)
}

/* --------------------------------------------------- partner postback ---- */

type affiliateWebhookRequest struct {
	TrackingID string `json:"tracking_id" validate:"required"`
	Status     string `json:"status"`
}

// handleAffiliateWebhook is the confirmation side of A12.6: a partner tells us
// a tracked click converted, the click is marked confirmed once, and the
// source creator earns their points. Guarded by a shared secret; without one
// configured the route answers 404 — an unconfigured webhook must not exist.
//
// Note: the manual "จองแล้ว" path (handleUpdateBooking) also awards points as a
// stand-in while no partner posts back. When real postbacks go live per
// partner (A12.9), that stand-in should be reviewed so a booking is not paid
// twice.
func (s *Server) handleAffiliateWebhook(c echo.Context) error {
	secret := s.cfg.AffiliateWebhookSecret
	if secret == "" {
		return request.NotFound(c, "ยังไม่เปิดใช้งาน")
	}
	if subtle.ConstantTimeCompare([]byte(c.Request().Header.Get("X-Rove-Signature")), []byte(secret)) != 1 {
		return request.Error(c, http.StatusUnauthorized, "ลายเซ็นไม่ถูกต้อง")
	}

	var req affiliateWebhookRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Status != "" && req.Status != "confirmed" {
		// Cancellations and pendings are acknowledged but change nothing yet.
		return c.NoContent(http.StatusAccepted)
	}

	ctx := c.Request().Context()
	click, err := s.bookings.GetClick(ctx, req.TrackingID)
	if err != nil {
		return request.NotFound(c, "ไม่พบ tracking id นี้")
	}
	if click.ConfirmedAt != nil {
		// Partners retry webhooks; a second confirm must not pay twice.
		return c.NoContent(http.StatusOK)
	}

	if err := s.bookings.ConfirmClick(ctx, click.ID, time.Now().UTC()); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	if click.SourceCreatorID != nil && *click.SourceCreatorID != "" {
		_ = s.points.Add(ctx, &models.UserPoints{
			UserID: *click.SourceCreatorID,
			Delta:  domain.PointsPerBooking,
			Reason: models.PointsReasonBooking,
			Note:   "มีคนจองสำเร็จจากทริปที่คุณเปิดสาธารณะ (" + click.Partner + ")",
			TripID: &click.TripID,
		})
	}

	return c.NoContent(http.StatusOK)
}

// awardBookingPoints credits the creator of the trip this one was copied from.
func (s *Server) awardBookingPoints(ctx contextT, tripID string) {
	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil || trip.SourceCreatorID == nil {
		return
	}
	_ = s.points.Add(ctx, &models.UserPoints{
		UserID: *trip.SourceCreatorID,
		Delta:  domain.PointsPerBooking,
		Reason: models.PointsReasonBooking,
		Note:   "มีคนจองจากทริปที่คุณเปิดสาธารณะ",
		TripID: &tripID,
	})
}

func partnerName(key string) string {
	switch key {
	case "agoda":
		return "Agoda"
	case "booking":
		return "Booking.com"
	case "klook":
		return "Klook"
	case "kkday":
		return "KKday"
	case "rentalcars":
		return "Rentalcars"
	case "airalo":
		return "Airalo"
	case "rabbitcare":
		return "Rabbit Care"
	default:
		return key
	}
}
