package api

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Admin side of the evidence chain (Feedback #4 — F12 §5 ข้อ 5–6, D-20, D-30).
func (s *Server) registerAdminLedgerRoutes(g *echo.Group) {
	g.GET("/trace", s.handleAdminTrace)
	g.POST("/ledger/adjust", s.handleAdminAdjust)
	g.GET("/flags", s.handleAdminFlags)
	g.POST("/flags/:flagId/resolve", s.handleAdminResolveFlag)
	g.GET("/settings/economy", s.handleAdminEconomy)
	g.PUT("/settings/economy", s.handleAdminSetEconomy)
	g.GET("/audit", s.handleAdminAudit)
}

func (s *Server) logAdmin(c echo.Context, action, targetType, targetID, reason string, before, after any) {
	entry := &models.AdminAuditLog{
		ActorID:    request.UserID(c),
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Reason:     reason,
		IP:         c.RealIP(),
	}
	if before != nil {
		entry.Before = snapshot(map[string]any{"value": before})
	}
	if after != nil {
		entry.After = snapshot(map[string]any{"value": after})
	}
	if err := s.audit.Log(c.Request().Context(), entry); err != nil {
		logger.L().WithError(err).WithField("action", action).Error("write admin audit log")
	}
}

/* --------------------------------------------------------------- trace --- */

type tracePointsDTO struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	Delta      int     `json:"delta"`
	Reason     string  `json:"reason"`
	Note       string  `json:"note"`
	ReversesID *string `json:"reverses_id"`
	OccurredAt string  `json:"occurred_at"`
}

type traceEventDTO struct {
	From       string  `json:"from"`
	To         string  `json:"to"`
	ActorID    *string `json:"actor_id"`
	Reason     string  `json:"reason"`
	Ref        string  `json:"ref"`
	OccurredAt string  `json:"occurred_at"`
}

type traceEarningDTO struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	AmountTHB    float64         `json:"amount_thb"`
	SharePercent int             `json:"share_percent"`
	Status       string          `json:"status"`
	ReversesID   *string         `json:"reverses_id"`
	OccurredAt   string          `json:"occurred_at"`
	Events       []traceEventDTO `json:"events"`
}

type traceCodeDTO struct {
	ID        string  `json:"id"`
	Code      string  `json:"code"`
	UserID    string  `json:"user_id"`
	AmountTHB float64 `json:"amount_thb"`
	UsedAt    *string `json:"used_at"`
	VoidedAt  *string `json:"voided_at"`
}

type traceFlagDTO struct {
	ID          string  `json:"id"`
	SubjectType string  `json:"subject_type"`
	SubjectID   string  `json:"subject_id"`
	Reason      string  `json:"reason"`
	CreatedAt   string  `json:"created_at"`
	ResolvedAt  *string `json:"resolved_at"`
	Resolution  string  `json:"resolution"`
}

type traceTripDTO struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Archived bool   `json:"archived"`
	Missing  bool   `json:"missing"`
}

type traceNodeDTO struct {
	ID          string            `json:"id"`
	Kind        string            `json:"kind"`
	ParentID    *string           `json:"parent_id"`
	ActorUserID *string           `json:"actor_user_id"`
	SubjectType string            `json:"subject_type"`
	SubjectID   string            `json:"subject_id"`
	BookingID   *string           `json:"booking_id"`
	Snapshot    json.RawMessage   `json:"snapshot"`
	OccurredAt  string            `json:"occurred_at"`
	Matched     bool              `json:"matched"`
	Legacy      bool              `json:"legacy"`
	Trips       []traceTripDTO    `json:"trips"`
	Points      []tracePointsDTO  `json:"points"`
	Earnings    []traceEarningDTO `json:"earnings"`
	Codes       []traceCodeDTO    `json:"codes"`
	Flags       []traceFlagDTO    `json:"flags"`
}

type traceDTO struct {
	Type  string         `json:"type"`
	Query string         `json:"query"`
	Nodes []traceNodeDTO `json:"nodes"`
}

const traceMaxDepth = 8

// handleAdminTrace walks from whatever an admin pasted in — a user, a points
// row, an earning, a booking, a tracking id, a trip, a code — up to the event
// that started it and down to everything it caused.
func (s *Server) handleAdminTrace(c echo.Context) error {
	ctx := c.Request().Context()
	kind := c.QueryParam("type")
	query := strings.TrimSpace(c.QueryParam("q"))
	if query == "" {
		return request.BadRequest(c, "ใส่สิ่งที่ต้องการไล่ที่มา")
	}

	seeds, err := s.traceSeeds(ctx, kind, query)
	if err != nil {
		return request.BadRequest(c, err.Error())
	}

	byID := map[string]models.ValueSource{}
	matched := map[string]bool{}
	for _, src := range seeds {
		byID[src.ID] = src
		matched[src.ID] = true
	}

	// Up to the root.
	frontier := parentIDs(seeds, byID)
	for depth := 0; depth < traceMaxDepth && len(frontier) > 0; depth++ {
		parents, err := s.ledger.SourcesByIDs(ctx, frontier)
		if err != nil {
			return request.Internal(c, "ไล่ที่มาไม่สำเร็จ")
		}
		for _, p := range parents {
			byID[p.ID] = p
		}
		frontier = parentIDs(parents, byID)
	}

	// Down to everything it caused.
	frontier = make([]string, 0, len(byID))
	for id := range byID {
		frontier = append(frontier, id)
	}
	for depth := 0; depth < traceMaxDepth && len(frontier) > 0; depth++ {
		children, err := s.ledger.ChildSources(ctx, frontier)
		if err != nil {
			return request.Internal(c, "ไล่ที่มาไม่สำเร็จ")
		}
		frontier = frontier[:0]
		for _, child := range children {
			if _, seen := byID[child.ID]; seen {
				continue
			}
			byID[child.ID] = child
			frontier = append(frontier, child.ID)
		}
	}

	nodes, err := s.traceNodes(ctx, byID, matched)
	if err != nil {
		return request.Internal(c, "ไล่ที่มาไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, traceDTO{Type: kind, Query: query, Nodes: nodes})
}

type traceError string

func (e traceError) Error() string { return string(e) }

func (s *Server) traceSeeds(ctx contextT, kind, query string) ([]models.ValueSource, error) {
	one := func(id *string) ([]models.ValueSource, error) {
		if id == nil {
			return nil, traceError("รายการนี้ไม่มีหลักฐานต้นทาง")
		}
		src, err := s.ledger.GetSource(ctx, *id)
		if err != nil {
			return nil, traceError("ไม่พบหลักฐานต้นทาง")
		}
		return []models.ValueSource{*src}, nil
	}

	switch kind {
	case "source":
		return one(&query)
	case "points":
		row, err := s.ledger.GetPoints(ctx, query)
		if err != nil {
			return nil, traceError("ไม่พบแถวแต้มนี้")
		}
		return one(row.SourceID)
	case "earning":
		row, err := s.ledger.GetEarning(ctx, query)
		if err != nil {
			return nil, traceError("ไม่พบรายได้นี้")
		}
		return one(row.SourceID)
	case "booking":
		return s.ledger.SourcesForBooking(ctx, query)
	case "click":
		return s.ledger.SourcesForSubject(ctx, query)
	case "trip":
		return s.ledger.SourcesForTrip(ctx, query, 100)
	case "code":
		code, err := s.discounts.GetByCode(ctx, strings.ToUpper(query))
		if err != nil {
			return s.ledger.SourcesForSubject(ctx, query)
		}
		return s.ledger.SourcesForSubject(ctx, code.ID)
	case "user":
		userID := query
		if user, err := s.users.GetByHandle(ctx, strings.TrimPrefix(query, "@")); err == nil {
			userID = user.ID
		}
		out, err := s.ledger.SourcesForActor(ctx, userID, 100)
		if err != nil {
			return nil, err
		}
		ids := map[string]bool{}
		for _, src := range out {
			ids[src.ID] = true
		}
		points, _ := s.ledger.PointsForUser(ctx, userID, 100)
		earnings, _ := s.ledger.EarningsForUser(ctx, userID, 100)
		var extra []string
		for _, p := range points {
			if p.SourceID != nil && !ids[*p.SourceID] {
				ids[*p.SourceID] = true
				extra = append(extra, *p.SourceID)
			}
		}
		for _, e := range earnings {
			if e.SourceID != nil && !ids[*e.SourceID] {
				ids[*e.SourceID] = true
				extra = append(extra, *e.SourceID)
			}
		}
		more, err := s.ledger.SourcesByIDs(ctx, extra)
		if err != nil {
			return nil, err
		}
		return append(out, more...), nil
	default:
		return nil, traceError("ประเภทที่ค้นหาไม่ถูกต้อง")
	}
}

func parentIDs(sources []models.ValueSource, known map[string]models.ValueSource) []string {
	var out []string
	for _, src := range sources {
		if src.ParentID == nil {
			continue
		}
		if _, ok := known[*src.ParentID]; ok {
			continue
		}
		out = append(out, *src.ParentID)
	}
	return out
}

func (s *Server) traceNodes(ctx contextT, byID map[string]models.ValueSource, matched map[string]bool) ([]traceNodeDTO, error) {
	ids := make([]string, 0, len(byID))
	tripIDs := map[string]bool{}
	var codeIDs []string
	for id, src := range byID {
		ids = append(ids, id)
		if src.TripID != nil {
			tripIDs[*src.TripID] = true
		}
		if src.OtherTripID != nil {
			tripIDs[*src.OtherTripID] = true
		}
		if src.SubjectType == models.SubjectDiscountCode {
			codeIDs = append(codeIDs, src.SubjectID)
		}
	}

	points, err := s.ledger.PointsBySources(ctx, ids)
	if err != nil {
		return nil, err
	}
	earnings, err := s.ledger.EarningsBySources(ctx, ids)
	if err != nil {
		return nil, err
	}
	earningIDs := make([]string, 0, len(earnings))
	for _, e := range earnings {
		earningIDs = append(earningIDs, e.ID)
	}
	events, err := s.ledger.EarningEvents(ctx, earningIDs)
	if err != nil {
		return nil, err
	}
	flags, err := s.ledger.FlagsBySources(ctx, ids)
	if err != nil {
		return nil, err
	}
	codes, err := s.discounts.ByIDs(ctx, codeIDs)
	if err != nil {
		return nil, err
	}

	trips := map[string]traceTripDTO{}
	for id := range tripIDs {
		trip, err := s.trips.GetByID(ctx, id)
		if err != nil {
			trips[id] = traceTripDTO{ID: id, Missing: true}
			continue
		}
		trips[id] = traceTripDTO{ID: id, Title: trip.Title, Archived: trip.ArchivedAt != nil}
	}

	eventsByEarning := map[string][]traceEventDTO{}
	for _, ev := range events {
		eventsByEarning[ev.EarningID] = append(eventsByEarning[ev.EarningID], traceEventDTO{
			From: ev.FromStatus, To: ev.ToStatus, ActorID: ev.ActorID, Reason: ev.Reason, Ref: ev.Ref,
			OccurredAt: ev.OccurredAt.UTC().Format(time.RFC3339),
		})
	}
	codesByID := map[string]models.DiscountCode{}
	for _, code := range codes {
		codesByID[code.ID] = code
	}

	nodes := make([]traceNodeDTO, 0, len(byID))
	index := map[string]int{}
	for _, src := range byID {
		node := traceNodeDTO{
			ID: src.ID, Kind: src.Kind, ParentID: src.ParentID, ActorUserID: src.ActorUserID,
			SubjectType: src.SubjectType, SubjectID: src.SubjectID, BookingID: src.BookingID,
			Snapshot:   json.RawMessage(src.Snapshot),
			OccurredAt: src.OccurredAt.UTC().Format(time.RFC3339),
			Matched:    matched[src.ID],
			Legacy:     src.Kind == models.SourceLegacy,
			Trips:      []traceTripDTO{}, Points: []tracePointsDTO{}, Earnings: []traceEarningDTO{},
			Codes: []traceCodeDTO{}, Flags: []traceFlagDTO{},
		}
		if len(node.Snapshot) == 0 {
			node.Snapshot = json.RawMessage("{}")
		}
		for _, id := range []*string{src.TripID, src.OtherTripID} {
			if id != nil {
				node.Trips = append(node.Trips, trips[*id])
			}
		}
		if code, ok := codesByID[src.SubjectID]; ok && src.SubjectType == models.SubjectDiscountCode {
			node.Codes = append(node.Codes, traceCodeDTO{
				ID: code.ID, Code: code.Code, UserID: code.UserID, AmountTHB: code.AmountTHB,
				UsedAt: timeString(code.UsedAt), VoidedAt: timeString(code.VoidedAt),
			})
		}
		index[src.ID] = len(nodes)
		nodes = append(nodes, node)
	}

	for _, p := range points {
		if i, ok := index[deref(p.SourceID)]; ok {
			nodes[i].Points = append(nodes[i].Points, tracePointsDTO{
				ID: p.ID, UserID: p.UserID, Delta: p.Delta, Reason: p.Reason, Note: p.Note,
				ReversesID: p.ReversesID, OccurredAt: p.OccurredAt.UTC().Format(time.RFC3339),
			})
		}
	}
	for _, e := range earnings {
		if i, ok := index[deref(e.SourceID)]; ok {
			evs := eventsByEarning[e.ID]
			if evs == nil {
				evs = []traceEventDTO{}
			}
			nodes[i].Earnings = append(nodes[i].Earnings, traceEarningDTO{
				ID: e.ID, UserID: e.UserID, AmountTHB: e.AmountTHB, SharePercent: e.SharePercent,
				Status: e.Status, ReversesID: e.ReversesID,
				OccurredAt: e.OccurredAt.UTC().Format(time.RFC3339), Events: evs,
			})
		}
	}
	for _, f := range flags {
		if i, ok := index[f.SourceID]; ok {
			nodes[i].Flags = append(nodes[i].Flags, toTraceFlagDTO(f))
		}
	}

	sort.SliceStable(nodes, func(a, b int) bool { return nodes[a].OccurredAt < nodes[b].OccurredAt })
	return nodes, nil
}

func toTraceFlagDTO(f models.LedgerFlag) traceFlagDTO {
	return traceFlagDTO{
		ID: f.ID, SubjectType: f.SubjectType, SubjectID: f.SubjectID, Reason: f.Reason,
		CreatedAt:  f.CreatedAt.UTC().Format(time.RFC3339),
		ResolvedAt: timeString(f.ResolvedAt), Resolution: f.Resolution,
	}
}

func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

/* -------------------------------------------------------------- adjust --- */

type adjustRequest struct {
	TargetType string  `json:"target_type"`
	TargetID   string  `json:"target_id"`
	Amount     float64 `json:"amount"`
	Reason     string  `json:"reason"`
	Reference  string  `json:"reference"`
	FlagID     string  `json:"flag_id"`
}

// handleAdminAdjust is the only way a balance changes by hand (D-20): a new
// source pointing at the row being corrected, a reversing row, a mandatory
// reason, and an audit entry naming who did it.
func (s *Server) handleAdminAdjust(c echo.Context) error {
	ctx := c.Request().Context()
	adminID := request.UserID(c)

	var req adjustRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		return request.BadRequest(c, "ต้องกรอกเหตุผลที่แก้ยอด")
	}
	if req.Amount == 0 || math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) {
		return request.BadRequest(c, "ยอดที่แก้ต้องไม่เป็นศูนย์")
	}

	source := &models.ValueSource{
		Kind:        models.SourceAdminAdjustment,
		ActorUserID: &adminID,
		SubjectType: req.TargetType,
		SubjectID:   req.TargetID,
	}
	base := map[string]any{
		"admin": s.personSnap(ctx, adminID), "reason": req.Reason, "reference": req.Reference,
		"amount": req.Amount, "target_type": req.TargetType, "target_id": req.TargetID,
	}

	switch req.TargetType {
	case models.SubjectPoints:
		target, err := s.ledger.GetPoints(ctx, req.TargetID)
		if err != nil {
			return request.NotFound(c, "ไม่พบแถวแต้มนี้")
		}
		if req.Amount != math.Trunc(req.Amount) {
			return request.BadRequest(c, "แต้มต้องเป็นจำนวนเต็ม")
		}
		source.ParentID = target.SourceID
		source.TripID = target.TripID
		base["target_before"] = map[string]any{"user_id": target.UserID, "delta": target.Delta, "reason": target.Reason}
		source.Snapshot = snapshot(base)
		if err := s.ledger.Record(ctx, &models.LedgerEntry{
			Source: source,
			Points: []models.UserPoints{{
				UserID: target.UserID, Delta: int(req.Amount), Reason: models.PointsReasonAdjustment,
				Note: req.Reason, TripID: target.TripID, ReversesID: &target.ID, ActorID: &adminID,
			}},
		}); err != nil {
			return request.Internal(c, "บันทึกการแก้ยอดไม่สำเร็จ")
		}

	case models.SubjectEarning:
		target, err := s.ledger.GetEarning(ctx, req.TargetID)
		if err != nil {
			return request.NotFound(c, "ไม่พบรายได้นี้")
		}
		source.ParentID = target.SourceID
		source.TripID = strOrNil(target.TripID)
		base["target_before"] = map[string]any{"user_id": target.UserID, "amount_thb": target.AmountTHB, "status": target.Status}
		source.Snapshot = snapshot(base)

		fullReversal := req.Amount == -target.AmountTHB &&
			(target.Status == models.EarningPending || target.Status == models.EarningPayable)
		entry := &models.LedgerEntry{Source: source}
		if !fullReversal {
			// Money already in a transfer, or a partial correction: a new line
			// that the next payout cycle nets against.
			entry.Earnings = []models.CreatorEarning{{
				UserID: target.UserID, TripID: target.TripID, Partner: target.Partner,
				AmountTHB: round2(req.Amount), Status: models.EarningPayable, ReversesID: &target.ID,
			}}
		}
		if err := s.ledger.Record(ctx, entry); err != nil {
			return request.Internal(c, "บันทึกการแก้ยอดไม่สำเร็จ")
		}
		if fullReversal {
			if _, err := s.ledger.TransitionEarning(ctx, target.ID,
				[]string{models.EarningPending, models.EarningPayable}, models.EarningReversed,
				&adminID, req.Reason, source.ID); err != nil {
				return request.Internal(c, "บันทึกการแก้ยอดไม่สำเร็จ")
			}
		}

	default:
		return request.BadRequest(c, "แก้ยอดได้เฉพาะแต้มหรือรายได้")
	}

	if req.FlagID != "" {
		if _, err := s.ledger.ResolveFlag(ctx, req.FlagID, adminID, "แก้ยอดแล้ว: "+req.Reason, time.Now().UTC()); err != nil {
			logger.L().WithError(err).Error("resolve flag after adjustment")
		}
	}
	s.logAdmin(c, "ledger.adjust", req.TargetType, req.TargetID, req.Reason, nil, base)
	return c.JSON(http.StatusCreated, map[string]string{"source_id": source.ID})
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

/* --------------------------------------------------------------- flags --- */

func (s *Server) handleAdminFlags(c echo.Context) error {
	flags, err := s.ledger.ListFlags(c.Request().Context(), c.QueryParam("open") != "0", 200)
	if err != nil {
		return request.Internal(c, "โหลดรายการที่ต้องตรวจไม่สำเร็จ")
	}
	out := make([]traceFlagDTO, 0, len(flags))
	for _, f := range flags {
		dto := toTraceFlagDTO(f)
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

type resolveFlagRequest struct {
	Resolution string `json:"resolution"`
}

func (s *Server) handleAdminResolveFlag(c echo.Context) error {
	var req resolveFlagRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	req.Resolution = strings.TrimSpace(req.Resolution)
	if req.Resolution == "" {
		return request.BadRequest(c, "ต้องกรอกว่าตัดสินอย่างไร")
	}
	won, err := s.ledger.ResolveFlag(c.Request().Context(), c.Param("flagId"), request.UserID(c), req.Resolution, time.Now().UTC())
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if !won {
		return request.Error(c, http.StatusConflict, "รายการนี้ถูกตัดสินไปแล้ว")
	}
	s.logAdmin(c, "flag.resolve", "ledger_flag", c.Param("flagId"), req.Resolution, nil, nil)
	return c.NoContent(http.StatusNoContent)
}

/* ------------------------------------------------------------ settings --- */

type economySettingsDTO struct {
	domain.Economy
	DefaultCreatorSharePercent int `json:"default_creator_share_percent"`
	DefaultBookerCreditPercent int `json:"default_booker_credit_percent"`
	MaxCreatorSharePercent     int `json:"max_creator_share_percent"`
	MaxBookerCreditPercent     int `json:"max_booker_credit_percent"`
}

func economyDTO(eco domain.Economy) economySettingsDTO {
	return economySettingsDTO{
		Economy:                    eco,
		DefaultCreatorSharePercent: domain.DefaultCreatorSharePercent,
		DefaultBookerCreditPercent: domain.DefaultBookerCreditPercent,
		MaxCreatorSharePercent:     domain.MaxCreatorSharePercent,
		MaxBookerCreditPercent:     domain.MaxBookerCreditPercent,
	}
}

func (s *Server) handleAdminEconomy(c echo.Context) error {
	return c.JSON(http.StatusOK, economyDTO(s.economy(c.Request().Context())))
}

type setEconomyRequest struct {
	CreatorSharePercent int    `json:"creator_share_percent"`
	BookerCreditPercent int    `json:"booker_credit_percent"`
	Reason              string `json:"reason"`
}

func (s *Server) handleAdminSetEconomy(c echo.Context) error {
	ctx := c.Request().Context()
	var req setEconomyRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if req.CreatorSharePercent < 0 || req.CreatorSharePercent > domain.MaxCreatorSharePercent {
		return request.BadRequest(c, "ส่วนแบ่งครีเอเตอร์ต้องอยู่ระหว่าง 0–"+strconv.Itoa(domain.MaxCreatorSharePercent)+"%")
	}
	if req.BookerCreditPercent < 0 || req.BookerCreditPercent > domain.MaxBookerCreditPercent {
		return request.BadRequest(c, "เครดิตคืนผู้จองต้องอยู่ระหว่าง 0–"+strconv.Itoa(domain.MaxBookerCreditPercent)+"%")
	}

	before := s.economy(ctx)
	adminID := request.UserID(c)
	if err := s.settings.Set(ctx, domain.SettingCreatorSharePercent, strconv.Itoa(req.CreatorSharePercent), &adminID); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	if err := s.settings.Set(ctx, domain.SettingBookerCreditPercent, strconv.Itoa(req.BookerCreditPercent), &adminID); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	after := s.economy(ctx)
	s.logAdmin(c, "settings.economy", "app_settings", "economy", req.Reason, before, after)
	return c.JSON(http.StatusOK, economyDTO(after))
}

/* --------------------------------------------------------------- audit --- */

type auditDTO struct {
	ID         string          `json:"id"`
	ActorID    string          `json:"actor_id"`
	ActorName  string          `json:"actor_name"`
	Action     string          `json:"action"`
	TargetType string          `json:"target_type"`
	TargetID   string          `json:"target_id"`
	Reason     string          `json:"reason"`
	Before     json.RawMessage `json:"before"`
	After      json.RawMessage `json:"after"`
	OccurredAt string          `json:"occurred_at"`
}

func (s *Server) handleAdminAudit(c echo.Context) error {
	ctx := c.Request().Context()
	rows, err := s.audit.List(ctx, c.QueryParam("target_type"), c.QueryParam("target_id"), 200)
	if err != nil {
		return request.Internal(c, "โหลดประวัติแอดมินไม่สำเร็จ")
	}
	names := map[string]string{}
	out := make([]auditDTO, 0, len(rows))
	for _, row := range rows {
		name, ok := names[row.ActorID]
		if !ok {
			if user, err := s.users.GetByID(ctx, row.ActorID); err == nil {
				name = user.DisplayName
			}
			names[row.ActorID] = name
		}
		out = append(out, auditDTO{
			ID: row.ID, ActorID: row.ActorID, ActorName: name, Action: row.Action,
			TargetType: row.TargetType, TargetID: row.TargetID, Reason: row.Reason,
			Before: rawOrNull(row.Before), After: rawOrNull(row.After),
			OccurredAt: row.OccurredAt.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(http.StatusOK, out)
}

func rawOrNull(v []byte) json.RawMessage {
	if len(v) == 0 {
		return json.RawMessage("null")
	}
	return json.RawMessage(v)
}
