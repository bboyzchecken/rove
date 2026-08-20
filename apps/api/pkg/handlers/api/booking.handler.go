package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/affiliate"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/hashutil"
)

// registerBookingRoutes covers affiliate links and booking state
// (DEV_SPEC §5.11 / M12).
//
//	POST /items/:itemId/booking-link    [editor] -> {tracking_id, redirect_url}
//	POST /items/:itemId/booking-status  [editor]
//	GET  /trips/:tripId/bookings        [viewer]
//	GET  /go/:trackingId                [none]  registered in api.go
//	POST /webhooks/affiliate/:partner   [none]  registered in api.go
func (s *Server) registerBookingRoutes(v1, trips *echo.Group) {
	trips.GET("/:tripId/bookings", s.handleListBookings,
		s.TripRoleMiddleware(models.TripRoleViewer))

	items := v1.Group("/items", s.JwtMiddleware)
	editor := s.ResolveTrip("itemId", models.TripRoleEditor, s.itemTrip)
	items.POST("/:itemId/booking-link", s.handleBookingLink, editor)
	items.POST("/:itemId/booking-status", s.handleBookingStatus, editor)
}

// handleBookingLink mints a tracking id and returns our own /go/ URL. The
// partner URL is never handed to the browser directly — the redirect is what
// records the click and carries source_creator_id forward.
func (s *Server) handleBookingLink(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	planID := request.PlanID(c)

	item, err := s.items.Get(ctx, planID, c.Param("itemId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ")
	}
	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	partner, target, ok := s.affiliate.Pick(ctx, item.Type, s.poiPartnerLinks(c, item))
	if !ok {
		return request.Error(c, http.StatusServiceUnavailable,
			"ยังไม่มีพาร์ทเนอร์สำหรับรายการประเภทนี้")
	}
	if target == "" {
		target = searchTarget(item, trip)
	}

	trackingID, err := hashutil.RandomToken(16)
	if err != nil {
		return request.Internal(c, "สร้างลิงก์จองไม่สำเร็จ")
	}

	deeplink, err := s.affiliate.BuildLink(ctx, affiliate.LinkRequest{
		Partner:    partner.Key,
		TargetURL:  target,
		TrackingID: trackingID,
		Params:     linkParams(item, trip),
	})
	if err != nil {
		return request.Internal(c, "สร้างลิงก์จองไม่สำเร็จ")
	}

	click := &models.BookingClick{
		TripID: tripID, ItemID: &item.ID, UserID: request.UserID(c),
		Partner: partner.Key, TrackingID: trackingID, TargetURL: deeplink,
		SourceTripID: trip.SourceTripID, SourceCreatorID: trip.SourceCreatorID,
	}
	if planID != "" {
		click.PlanID = &planID
	}
	if err := s.bookings.CreateClick(ctx, click); err != nil {
		return request.Internal(c, "บันทึกลิงก์จองไม่สำเร็จ")
	}

	item.BookingPartner = partner.Key
	item.BookingURL = strings.TrimRight(s.cfg.AppBaseURL, "/") + "/go/" + trackingID
	if err := s.items.Update(ctx, planID, item, request.UserID(c), models.CreatedByUser); err != nil {
		logger.L().WithError(err).Warn("could not stamp the booking link onto the item")
	}

	return request.OK(c, map[string]any{
		"tracking_id":  trackingID,
		"redirect_url": item.BookingURL,
		"partner":      partner,
	})
}

// poiPartnerLinks reads a POI's curated partner URLs, which beat a generated
// search whenever they exist.
func (s *Server) poiPartnerLinks(c echo.Context, item *models.Item) map[string]string {
	if item.POIID == nil {
		return nil
	}
	poi, err := s.pois.GetByID(c.Request().Context(), *item.POIID)
	if err != nil || len(poi.PartnerLinks) == 0 {
		return nil
	}
	var links map[string]string
	if err := json.Unmarshal(poi.PartnerLinks, &links); err != nil {
		return nil
	}
	return links
}

// searchTarget is the fallback landing page: the partner's own search for this
// place and these dates.
func searchTarget(item *models.Item, trip *models.Trip) string {
	q := item.Title
	if q == "" {
		q = trip.Title
	}
	return "https://www.google.com/search?q=" + strings.ReplaceAll(q, " ", "+")
}

func linkParams(item *models.Item, trip *models.Trip) map[string]string {
	params := map[string]string{
		"destination": item.Title,
		"item_type":   item.Type,
	}
	if trip.StartDate != nil {
		params["checkin"] = trip.StartDate.Format("2006-01-02")
	}
	if trip.EndDate != nil {
		params["checkout"] = trip.EndDate.Format("2006-01-02")
	}
	params["adults"] = itoa(trip.PartySize)
	return params
}

// handleAffiliateRedirect is unauthenticated by necessity — the user may be
// opening it from a shared plan, on a device that never signed in.
func (s *Server) handleAffiliateRedirect(c echo.Context) error {
	ctx := c.Request().Context()
	trackingID := c.Param("trackingId")

	click, err := s.bookings.GetClickByTracking(ctx, trackingID)
	if err != nil {
		// Never bounce a user into an error page over a tracking miss; send
		// them to the app instead.
		return c.Redirect(http.StatusFound, s.cfg.WebBaseURL)
	}

	// Recording the click must not delay the redirect the user is waiting on.
	go func() {
		bg, cancel := timeoutContext(5 * time.Second)
		defer cancel()
		_ = s.bookings.MarkClicked(bg, trackingID,
			c.Request().UserAgent(), c.Request().Referer())
	}()

	if click.TripID != "" {
		s.emit(c, click.TripID, emitOpts{
			Action:     models.ActionBookingClicked,
			EventType:  events.TypeBookingUpdated,
			TargetType: "booking", TargetID: trackingID,
		})
	}
	return c.Redirect(http.StatusFound, click.TargetURL)
}

type bookingStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=none clicked booked skipped"`
}

func (s *Server) handleBookingStatus(c echo.Context) error {
	var req bookingStatusRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	planID := request.PlanID(c)

	item, err := s.items.Get(ctx, planID, c.Param("itemId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ")
	}

	item.BookingStatus = req.Status
	// "Booked" means the money is committed, which is exactly what the budget's
	// prepaid split is for.
	if req.Status == models.BookingStatusBooked {
		item.IsPrepaid = true
		item.CostStatus = models.CostStatusPaid
	}

	err = s.items.Update(ctx, planID, item, request.UserID(c), models.CreatedByUser)
	if err != nil {
		return request.Internal(c, "บันทึกสถานะการจองไม่สำเร็จ")
	}

	s.emit(c, request.TripID(c), emitOpts{
		EventType:  events.TypeBookingUpdated,
		TargetType: "item", TargetID: item.ID,
		Meta: map[string]any{"booking_status": req.Status},
	})
	return request.OK(c, item)
}

func (s *Server) handleListBookings(c echo.Context) error {
	clicks, err := s.bookings.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "อ่านรายการจองไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": clicks})
}

type webhookPayload struct {
	TrackingID string  `json:"tracking_id"`
	PartnerRef string  `json:"partner_ref"`
	Amount     float64 `json:"amount"`
	Currency   string  `json:"currency"`
	Commission float64 `json:"commission"`
	Status     string  `json:"status"`
}

// handleAffiliateWebhook receives a confirmation from a partner and, when the
// booking came from someone else's public trip, awards that creator points
// (DEV_SPEC §6.5).
//
// Every partner signs differently, so the shared secret is checked here and the
// per-partner signature scheme is added as each one is actually approved.
func (s *Server) handleAffiliateWebhook(c echo.Context) error {
	if secret := s.cfg.WebhookSecret; secret != "" {
		if c.Request().Header.Get("X-Rove-Signature") != secret {
			return request.Unauthorized(c, "invalid signature")
		}
	}

	var payload webhookPayload
	if err := c.Bind(&payload); err != nil {
		return request.BadRequest(c, "invalid payload")
	}
	if payload.TrackingID == "" {
		return request.BadRequest(c, "tracking_id is required")
	}

	partner := c.Param("partner")
	ctx := c.Request().Context()

	// Partners retry webhooks. Awarding points twice for one booking would be
	// the most expensive bug in this file.
	if payload.PartnerRef != "" {
		if _, err := s.bookings.GetConfirmationByRef(ctx, partner, payload.PartnerRef); err == nil {
			return request.OK(c, map[string]any{"status": "duplicate"})
		}
	}

	click, err := s.bookings.GetClickByTracking(ctx, payload.TrackingID)
	if err != nil {
		return request.NotFound(c, "unknown tracking id")
	}

	raw, _ := json.Marshal(payload)
	confirmation := &models.BookingConfirmation{
		TrackingID: payload.TrackingID,
		Partner:    partner,
		PartnerRef: payload.PartnerRef,
		Amount:     payload.Amount,
		Currency:   orDefaultString(payload.Currency, "THB"),
		Commission: payload.Commission,
		Status:     orDefaultString(payload.Status, models.ConfirmPending),
		Raw:        datatypes.JSON(raw),
	}
	if confirmation.Status == models.ConfirmConfirmed {
		now := time.Now().UTC()
		confirmation.ConfirmedAt = &now
	}

	award := domain.PointsAward{}
	if confirmation.Status == models.ConfirmConfirmed && click.SourceCreatorID != nil {
		award = domain.CalculatePoints(payload.Commission,
			domain.PointsConfig{EarnRatePct: s.cfg.Points.EarnRatePct},
			*click.SourceCreatorID, click.UserID)
		confirmation.PointsAwarded = award.Amount
	}

	if err := s.bookings.CreateConfirmation(ctx, confirmation); err != nil {
		return request.Internal(c, "record failed")
	}

	// Award writes the ledger row and moves the balance in one transaction.
	// It runs after the confirmation exists so the ledger can point at it, and
	// the partner_ref guard above is what stops a retry awarding twice.
	if award.Amount > 0 {
		err := s.points.Award(ctx, &models.PointsTransaction{
			UserID:  award.UserID,
			Amount:  award.Amount,
			Type:    models.PointsTypeEarnFromClone,
			RefID:   confirmation.ID,
			RefType: models.PointsRefBookingConfirmation,
			Note:    "มีคนจองจากทริปที่คุณเปิดสาธารณะ",
		})
		if err != nil {
			logger.L().WithError(err).Error("points award failed after a confirmed booking")
		}
	}

	return request.OK(c, map[string]any{
		"status":         "recorded",
		"points_awarded": confirmation.PointsAwarded,
	})
}

func itoa(n int) string {
	if n <= 0 {
		return "1"
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}
