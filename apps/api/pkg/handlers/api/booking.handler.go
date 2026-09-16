package api

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
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
	g.GET("/:tripId/bookings/archived", s.handleListArchivedBookings, view)
	g.DELETE("/:tripId/bookings/:bookingId", s.handleDeleteBooking, edit)
	g.POST("/:tripId/bookings/:bookingId/archive", s.handleArchiveBooking, edit)
	g.POST("/:tripId/bookings/:bookingId/restore", s.handleRestoreBooking, edit)
	g.POST("/:tripId/bookings/:bookingId/link", s.handleBookingLink, view)
}

func (s *Server) handleListBookings(c echo.Context) error {
	ctx := c.Request().Context()
	bookings, err := s.bookings.ListByTrip(ctx, request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดการจองไม่สำเร็จ")
	}
	out, err := s.bookingDTOs(ctx, bookings)
	if err != nil {
		return request.Internal(c, "โหลดการจองไม่สำเร็จ")
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
	if !datesInOrder(booking.CheckIn, booking.CheckOut) {
		return request.BadRequest(c, "วันเช็คเอาต์ต้องไม่ก่อนวันเช็คอิน")
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
	if !datesInOrder(booking.CheckIn, booking.CheckOut) {
		return request.BadRequest(c, "วันเช็คเอาต์ต้องไม่ก่อนวันเช็คอิน")
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

	// Marking "จองแล้ว" here is a group ticking their own box — it earns nothing.
	// Points, the creator's share and the Trip Pass refund all require a partner
	// to confirm the booking themselves (Feedback #4 D-24): otherwise the same
	// toggle could be flipped off and back on to mint rewards without a real
	// booking behind them.
	s.track(c, tripID, "", events.TypeBookingChanged, "booking", booking.ID)
	out, err := s.bookingDTOs(ctx, []models.Booking{*booking})
	if err != nil || len(out) == 0 {
		return c.JSON(http.StatusOK, toBookingDTO(*booking))
	}
	return c.JSON(http.StatusOK, out[0])
}

func (s *Server) handleDeleteBooking(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	tied, err := s.ledger.TiedBookingIDs(ctx, []string{c.Param("bookingId")})
	if err != nil {
		return request.Internal(c, "ตรวจประวัติรายได้ไม่สำเร็จ")
	}
	if tied[c.Param("bookingId")] {
		return c.JSON(http.StatusConflict, archiveConflictDTO{
			Error:      "การจองนี้พาร์ตเนอร์ยืนยันแล้ว ลบไม่ได้ เก็บเข้าคลังแทน",
			Archivable: true,
			Tied:       true,
		})
	}

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
		BookingID: &booking.ID,
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
	// What the booking was worth and what it paid us, when the partner says
	// so (A12.11). A pointer, not a float: zero commission reported is a fact,
	// and a missing field is not the same fact.
	AmountTHB     float64  `json:"amount_thb"`
	CommissionTHB *float64 `json:"commission_thb"`
}

// handleAffiliateWebhook is the partner side of A12.6: a tracked click was
// confirmed (the booking pays out, F12 chain + D-30 split) or cancelled (what it
// paid is reversed or flagged). Guarded by a shared secret; without one
// configured the route answers 404 — an unconfigured webhook must not exist.
//
// This is now the *only* door that awards anything for a booking (Feedback #4
// D-24). Ticking "จองแล้ว" by hand in handleUpdateBooking used to award the
// same points as a stand-in while no partner posted back — closed because
// toggling that box off and on again earned it twice, and it never proved a
// booking actually happened.
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

	switch req.Status {
	case "", "confirmed":
		return s.confirmPartnerBooking(c, req)
	case "cancelled":
		return s.cancelPartnerBooking(c, req)
	default:
		// Pendings are acknowledged and change nothing.
		return c.NoContent(http.StatusAccepted)
	}
}

// confirmPartnerBooking is the chain D-17 asks for, written in order: the click
// (with the clone it came from as its parent), the confirmation, then every
// payout the confirmation produced, each pointing back at it. The amounts come
// from domain.SplitCommission (D-30) and are copied into the snapshot, so a
// later change to the percentages never rewrites what this booking paid.
func (s *Server) confirmPartnerBooking(c echo.Context, req affiliateWebhookRequest) error {
	ctx := c.Request().Context()
	click, err := s.bookings.GetClick(ctx, req.TrackingID)
	if err != nil {
		return request.NotFound(c, "ไม่พบ tracking id นี้")
	}

	now := time.Now().UTC()
	won, err := s.bookings.ConfirmClick(ctx, click.ID, now)
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if !won {
		// Partners retry webhooks; a second confirm must not pay twice.
		return c.NoContent(http.StatusOK)
	}

	trip, _ := s.trips.GetByID(ctx, click.TripID)
	pass, err := s.billing.TripPass(ctx, click.TripID)
	if err != nil {
		logger.L().WithError(err).Error("read trip pass for split")
	}

	commission, estimated := domain.CommissionTHB(
		click.Partner, req.AmountTHB, derefFloat(req.CommissionTHB), req.CommissionTHB != nil,
	)
	creatorID := ""
	if click.SourceCreatorID != nil {
		creatorID = *click.SourceCreatorID
	}
	in := domain.SplitInput{CommissionTHB: commission, HasSourceCreator: creatorID != ""}
	if pass != nil && pass.TotalTHB > 0 {
		in.PassTotalTHB = pass.TotalTHB
		in.PassRefundable = pass.Status == domain.OrderPaid
	}
	eco := s.economy(ctx)
	split := domain.SplitCommission(in, eco)

	var otherTrip *string
	if trip != nil {
		otherTrip = trip.SourceTripID
	}

	clickSource := &models.ValueSource{
		Kind:        models.SourceBookingClick,
		ActorUserID: strOrNil(click.UserID),
		SubjectType: models.SubjectBookingClick,
		SubjectID:   click.ID,
		TripID:      &click.TripID,
		OtherTripID: otherTrip,
		BookingID:   click.BookingID,
		Snapshot: snapshot(map[string]any{
			"clicked_by": s.personSnap(ctx, click.UserID),
			"partner":    click.Partner,
			"tracking_id": click.ID,
			"target_url": click.TargetURL,
			"trip":       tripSnap(trip),
			"clicked_at": click.ClickedAt.UTC().Format(time.RFC3339),
		}),
		OccurredAt: click.ClickedAt,
	}
	if clone, err := s.ledger.CloneSourceForCopy(ctx, click.TripID); err == nil && clone != nil {
		clickSource.ParentID = &clone.ID
	}
	if !s.record(ctx, &models.LedgerEntry{Source: clickSource}) {
		return request.Internal(c, "บันทึกหลักฐานไม่สำเร็จ")
	}

	confirmed := &models.ValueSource{
		Kind:        models.SourcePartnerConfirmed,
		ParentID:    &clickSource.ID,
		SubjectType: models.SubjectBookingClick,
		SubjectID:   click.ID,
		TripID:      &click.TripID,
		OtherTripID: otherTrip,
		BookingID:   click.BookingID,
		Snapshot: snapshot(map[string]any{
			"partner":           click.Partner,
			"tracking_id":       click.ID,
			"booking_value_thb": req.AmountTHB,
			"commission_thb":    commission,
			"commission_estimated": estimated,
			"split":             split,
			"economy":           eco,
			"creator":           s.personSnap(ctx, creatorID),
		}),
		OccurredAt: now,
	}
	entry := &models.LedgerEntry{Source: confirmed}
	if creatorID != "" && split.CreatorShareTHB > 0 {
		entry.Earnings = []models.CreatorEarning{{
			UserID:          creatorID,
			TripID:          click.TripID,
			ClickID:         &click.ID,
			Partner:         click.Partner,
			BookingValueTHB: req.AmountTHB,
			CommissionTHB:   commission,
			SharePercent:    split.CreatorPercent,
			AmountTHB:       split.CreatorShareTHB,
			Estimated:       estimated,
			Status:          models.EarningPending,
		}}
	}
	if !s.record(ctx, entry) {
		return request.Internal(c, "บันทึกหลักฐานไม่สำเร็จ")
	}

	if split.TripPassRefundTHB > 0 && pass != nil {
		s.refundTripPass(ctx, pass, split.TripPassRefundTHB, confirmed)
	}
	if split.BookerCreditTHB > 0 && click.UserID != "" {
		s.issueBookerCredit(ctx, click, split.BookerCreditTHB, confirmed)
	}
	return c.NoContent(http.StatusOK)
}

// cancelPartnerBooking undoes what a confirmation paid, without editing it.
// An earning not yet paid out is reversed; one already in a transfer, or a
// credit already spent, is flagged for an admin to decide (D-36).
func (s *Server) cancelPartnerBooking(c echo.Context, req affiliateWebhookRequest) error {
	ctx := c.Request().Context()
	click, err := s.bookings.GetClick(ctx, req.TrackingID)
	if err != nil {
		return request.NotFound(c, "ไม่พบ tracking id นี้")
	}
	confirmed, err := s.ledger.LatestSource(ctx, models.SourcePartnerConfirmed, click.ID)
	if err != nil {
		return request.Internal(c, "อ่านหลักฐานไม่สำเร็จ")
	}
	if confirmed == nil {
		// Never confirmed — nothing was paid, nothing to undo.
		return c.NoContent(http.StatusAccepted)
	}

	now := time.Now().UTC()
	won, err := s.bookings.CancelClick(ctx, click.ID, now)
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if !won {
		return c.NoContent(http.StatusOK)
	}

	cancelled := &models.ValueSource{
		Kind:        models.SourcePartnerCancelled,
		ParentID:    &confirmed.ID,
		SubjectType: models.SubjectBookingClick,
		SubjectID:   click.ID,
		TripID:      confirmed.TripID,
		OtherTripID: confirmed.OtherTripID,
		BookingID:   confirmed.BookingID,
		Snapshot: snapshot(map[string]any{
			"partner": click.Partner, "tracking_id": click.ID, "reported_amount_thb": req.AmountTHB,
		}),
		OccurredAt: now,
	}
	if !s.record(ctx, &models.LedgerEntry{Source: cancelled}) {
		return request.Internal(c, "บันทึกหลักฐานไม่สำเร็จ")
	}

	flag := func(subjectType, subjectID, reason string) {
		if err := s.ledger.AddFlag(ctx, &models.LedgerFlag{
			SourceID: cancelled.ID, SubjectType: subjectType, SubjectID: subjectID, Reason: reason,
		}); err != nil {
			logger.L().WithError(err).Error("write ledger flag")
		}
	}

	earnings, _ := s.ledger.EarningsBySources(ctx, []string{confirmed.ID})
	for _, earning := range earnings {
		reversed, err := s.ledger.TransitionEarning(ctx, earning.ID,
			[]string{models.EarningPending, models.EarningPayable}, models.EarningReversed,
			nil, "พาร์ตเนอร์ยกเลิกการจอง", cancelled.ID)
		if err != nil {
			logger.L().WithError(err).Error("reverse earning")
			continue
		}
		if !reversed && earning.Status != models.EarningReversed && earning.Status != models.EarningExpired {
			flag(models.SubjectEarning, earning.ID, "การจองถูกยกเลิกหลังรายได้เข้ารอบโอนหรือโอนไปแล้ว")
		}
	}

	credits, _ := s.ledger.ChildSources(ctx, []string{confirmed.ID})
	for _, credit := range credits {
		if credit.SubjectType != models.SubjectDiscountCode {
			continue
		}
		voided, err := s.discounts.Void(ctx, credit.SubjectID, now)
		if err != nil {
			logger.L().WithError(err).Error("void credit code")
			continue
		}
		if !voided {
			flag(models.SubjectDiscountCode, credit.SubjectID, "เครดิตจากการจองนี้ถูกใช้ไปแล้วก่อนพาร์ตเนอร์ยกเลิก")
		}
	}
	return c.NoContent(http.StatusOK)
}

// refundTripPass pays the Trip Pass back once the trip produces a booking
// (M26 — A26.4), now capped at what the booking actually left over (D-30):
// min(pass, commission − cost of sale). Once per trip however many bookings it
// produces — the UPDATE only matches a pass that is still `paid`, so two
// postbacks arriving together cannot both win.
//
// The credit is a discount code rather than a reversal at a gateway because
// there is no gateway yet (§16). Best effort: a confirmed booking must not be
// un-confirmed because the refund could not be written.
func (s *Server) refundTripPass(ctx contextT, pass *models.Order, amountTHB float64, parent *models.ValueSource) {
	now := time.Now().UTC()
	credit := &models.DiscountCode{
		UserID:    pass.UserID,
		Code:      domain.NewDiscountCode(),
		Scope:     models.DiscountScopeTripPass,
		AmountTHB: amountTHB,
		// Money coming back, not loyalty being spent.
		PointsSpent: 0,
		ExpiresAt:   now.Add(domain.DiscountValidity),
	}

	won, err := s.billing.RefundTripPass(ctx, pass.ID, credit, now)
	if err != nil {
		logger.L().WithError(err).Error("refund trip pass")
		return
	}
	if !won {
		return
	}

	s.record(ctx, &models.LedgerEntry{Source: &models.ValueSource{
		Kind:        models.SourceTripPassRefund,
		ParentID:    &parent.ID,
		ActorUserID: nil,
		SubjectType: models.SubjectDiscountCode,
		SubjectID:   credit.ID,
		TripID:      parent.TripID,
		OtherTripID: parent.OtherTripID,
		BookingID:   parent.BookingID,
		Snapshot: snapshot(map[string]any{
			"order_id": pass.ID, "pass_total_thb": pass.TotalTHB, "credit_thb": amountTHB,
			"code": credit.Code, "buyer": s.personSnap(ctx, pass.UserID), "trip_title": pass.TripTitle,
		}),
		OccurredAt: now,
	}})

	tripID := parent.TripID
	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: pass.UserID,
		TripID: tripID,
		Kind:   models.NotifyRefund,
		Title:  fmt.Sprintf("คืนค่า Trip Pass ฿%.2f ให้แล้ว", amountTHB),
		Body: fmt.Sprintf("ทริป%s มีการจองผ่าน ROVE — โค้ด %s ใช้เป็นส่วนลดทริปหน้าได้",
			pass.TripTitle, credit.Code),
		Link: "/billing/" + pass.ID,
	})
}

// issueBookerCredit is the new "เครดิตคืนผู้จอง" (D-30): a share of what is left
// after every other payout, to the person who followed the link and booked.
func (s *Server) issueBookerCredit(ctx contextT, click *models.BookingClick, amountTHB float64, parent *models.ValueSource) {
	now := time.Now().UTC()
	credit := &models.DiscountCode{
		UserID:      click.UserID,
		Code:        domain.NewDiscountCode(),
		Scope:       models.DiscountScopeTripPass,
		AmountTHB:   amountTHB,
		PointsSpent: 0,
		ExpiresAt:   now.Add(domain.DiscountValidity),
	}
	if err := s.discounts.Create(ctx, credit); err != nil {
		logger.L().WithError(err).Error("issue booker credit")
		return
	}

	s.record(ctx, &models.LedgerEntry{Source: &models.ValueSource{
		Kind:        models.SourceBookerCredit,
		ParentID:    &parent.ID,
		ActorUserID: &click.UserID,
		SubjectType: models.SubjectDiscountCode,
		SubjectID:   credit.ID,
		TripID:      parent.TripID,
		OtherTripID: parent.OtherTripID,
		BookingID:   parent.BookingID,
		Snapshot: snapshot(map[string]any{
			"booker": s.personSnap(ctx, click.UserID), "credit_thb": amountTHB, "code": credit.Code,
			"partner": click.Partner,
		}),
		OccurredAt: now,
	}})

	_ = s.notifications.Create(ctx, &models.Notification{
		UserID: click.UserID,
		TripID: &click.TripID,
		Kind:   models.NotifyCredit,
		Title:  fmt.Sprintf("ได้เครดิตคืน ฿%.2f จากการจอง", amountTHB),
		Body:   fmt.Sprintf("พาร์ตเนอร์ยืนยันการจองแล้ว — โค้ด %s ใช้เป็นส่วนลด Trip Pass ได้", credit.Code),
		Link:   "/points",
	})
}

func derefFloat(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
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
