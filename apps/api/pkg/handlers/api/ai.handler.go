package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/ai"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// AI planner (M4 — A4.x).
//
// Drafting is a job, not a request: it takes tens of seconds, so the endpoint
// returns as soon as the job is queued and the browser follows it over SSE.
func (s *Server) registerAIRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/ai/credits", s.handleAICredits, view)
	g.POST("/:tripId/ai/generate", s.handleAIGenerate, edit)
	g.GET("/:tripId/ai/jobs/:jobId", s.handleAIJob, view)
	g.GET("/:tripId/ai/jobs/:jobId/stream", s.handleAIJobStream, view)
	g.POST("/:tripId/ai/jobs/:jobId/apply", s.handleApplyDraft, edit)
	g.POST("/:tripId/ai/credits/purchase", s.handleBuyCredits, edit)
}

// registerAIPublicRoutes holds the one AI endpoint that is not trip-scoped:
// reading a pasted ticket happens *before* a trip exists (M1 — A1.2).
func (s *Server) registerAIPublicRoutes(g *echo.Group) {
	g.POST("/ai/parse-ticket", s.handleParseTicket, s.JwtMiddleware)
}

func (s *Server) handleAICredits(c echo.Context) error {
	credits, err := s.aiJobs.Credits(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดโควตาไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, toCreditsDTO(*credits))
}

type generateRequest struct {
	Kind  string   `json:"kind"`
	Brief string   `json:"brief"`
	Pace  string   `json:"pace"`
	Focus []string `json:"focus"`
}

func (s *Server) handleAIGenerate(c echo.Context) error {
	var req generateRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	if trip.StartDate == nil || trip.EndDate == nil {
		return request.BadRequest(c, "ล็อควันเดินทางก่อนถึงจะร่างแพลนได้")
	}

	// The meter comes before the model: a quota discovered halfway through a
	// draft is a bad surprise attached to a paid action (§16).
	credits, err := s.aiJobs.Credits(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดโควตาไม่สำเร็จ")
	}
	if credits.Used >= credits.Included+credits.Extra {
		return request.Error(c, http.StatusPaymentRequired,
			"ใช้ครบโควตาร่างแล้ว — ซื้อเพิ่มก่อนถึงจะร่างใหม่ได้")
	}
	if err := ai.CheckDailyCap(ctx, s.aiJobs, s.cfg.Anthropic.DailyCostCapUSD); err != nil {
		return request.Error(c, http.StatusTooManyRequests, err.Error())
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดสมาชิกไม่สำเร็จ")
	}
	wishes, err := s.wishlist.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดที่อยากไปไม่สำเร็จ")
	}

	members := make([]models.User, 0, len(roster.users))
	for _, m := range roster.members {
		if u, ok := roster.users[m.UserID]; ok {
			members = append(members, u)
		}
	}

	job := models.AIJob{
		Base:   models.Base{ID: uuid.NewString()},
		TripID: tripID,
		UserID: userID,
		Kind:   orDefault(req.Kind, models.AIKindDraft),
		Status: models.AIQueued,
		Step:   "เข้าคิว",
		Input:  toDatatypesJSON(req),
	}
	if err := s.aiJobs.Create(ctx, &job); err != nil {
		return request.Internal(c, "สร้างงานร่างแพลนไม่สำเร็จ")
	}

	credits.Used++
	if err := s.aiJobs.SaveCredits(ctx, credits); err != nil {
		return request.Internal(c, "บันทึกโควตาไม่สำเร็จ")
	}

	s.aiRunner.Enqueue(job, ai.GenerateInput{
		Trip:    *trip,
		Members: members,
		Wishes:  wishes,
		Brief:   req.Brief,
		Pace:    req.Pace,
	})

	s.track(c, tripID, "ให้ AI ร่างแพลน", events.TypeAIProgress, "ai_job", job.ID)
	return c.JSON(http.StatusAccepted, toAIJobDTO(job))
}

func (s *Server) handleAIJob(c echo.Context) error {
	job, err := s.aiJobs.Get(c.Request().Context(), request.TripID(c), c.Param("jobId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบงานนี้")
	}
	return c.JSON(http.StatusOK, toAIJobDTO(*job))
}

// handleAIJobStream is the progress feed for one job. It reuses the trip's
// event channel and filters — one subscription per trip is enough, and a
// browser that reconnects gets the current state immediately rather than
// waiting for the next tick.
func (s *Server) handleAIJobStream(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	jobID := c.Param("jobId")

	job, err := s.aiJobs.Get(ctx, tripID, jobID)
	if err != nil {
		return request.NotFound(c, "ไม่พบงานนี้")
	}

	stream, cancel, err := s.hub.Subscribe(ctx, tripID)
	if err != nil {
		return request.Internal(c, "เปิดสตรีมไม่สำเร็จ")
	}
	defer cancel()

	res := c.Response()
	setSSEHeaders(res)

	writeSSE(res, toAIJobDTO(*job))

	// A proxy will drop a connection that says nothing for a minute.
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-heartbeat.C:
			_, _ = res.Write([]byte(": ping\n\n"))
			res.Flush()

		case event, ok := <-stream:
			if !ok {
				return nil
			}
			if event.TargetID != jobID {
				continue
			}

			current, err := s.aiJobs.Get(ctx, tripID, jobID)
			if err != nil {
				continue
			}
			writeSSE(res, toAIJobDTO(*current))

			if current.Status == models.AIDone || current.Status == models.AIFailed {
				return nil
			}
		}
	}
}

// handleApplyDraft writes a finished draft into the plan (A4.8). The whole
// itinerary is replaced in one transaction: a half-applied draft would be worse
// than none.
func (s *Server) handleApplyDraft(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	job, err := s.aiJobs.Get(ctx, tripID, c.Param("jobId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบงานนี้")
	}
	if job.Status != models.AIDone || len(job.Result) == 0 {
		return request.BadRequest(c, "ร่างยังไม่เสร็จ")
	}

	var result ai.DraftResult
	if err := json.Unmarshal(job.Result, &result); err != nil {
		return request.Internal(c, "อ่านร่างไม่สำเร็จ")
	}

	plan, err := s.plans.EnsurePlan(ctx, tripID, userID)
	if err != nil {
		return request.Internal(c, "เตรียมแพลนไม่สำเร็จ")
	}

	days := make([]models.PlanDay, 0, len(result.Days))
	items := map[string][]models.PlanItem{}

	for i, draftDay := range result.Days {
		day := models.PlanDay{
			Base:        models.Base{ID: uuid.NewString()},
			PlanID:      plan.ID,
			TripID:      tripID,
			DayIndex:    i + 1,
			Date:        draftDay.Date,
			Label:       orDefault(draftDay.Label, fmt.Sprintf("วันที่ %d", i+1)),
			City:        draftDay.City,
			WeatherIcon: draftDay.WeatherIcon,
			WeatherText: draftDay.WeatherText,
		}
		if draftDay.WeatherHigh != 0 || draftDay.WeatherLow != 0 {
			high, low := draftDay.WeatherHigh, draftDay.WeatherLow
			day.WeatherHigh, day.WeatherLow = &high, &low
			now := time.Now().UTC()
			day.WeatherAt = &now
		}

		dayItems := make([]models.PlanItem, 0, len(draftDay.Items))
		for _, draftItem := range draftDay.Items {
			item := models.PlanItem{
				Base:       models.Base{ID: uuid.NewString()},
				DayID:      day.ID,
				TripID:     tripID,
				Type:       orDefault(draftItem.Type, models.ItemPOI),
				StartTime:  orDefault(draftItem.StartTime, "09:00"),
				EndTime:    draftItem.EndTime,
				Title:      draftItem.Title,
				Area:       draftItem.Area,
				POIID:      draftItem.POIID,
				TravelMode: draftItem.TravelMode,
				OpenHours:  draftItem.OpenHours,
				ForUsers:   jsonArray(draftItem.ForUsers),
				Bookable:   draftItem.Bookable,
				Note:       draftItem.Note,
			}
			if draftItem.CostJPY > 0 {
				cost := draftItem.CostJPY
				item.CostJPY = &cost
			}
			if draftItem.TravelMin > 0 {
				travel := draftItem.TravelMin
				item.TravelMin = &travel
			}
			dayItems = append(dayItems, item)
		}

		days = append(days, day)
		items[day.ID] = dayItems
	}

	if err := s.plans.ReplaceDays(ctx, tripID, days, items); err != nil {
		return request.Internal(c, "บันทึกแพลนไม่สำเร็จ")
	}

	plan.Rationales = toDatatypesJSON(result.Rationales)
	plan.OpenQs = toDatatypesJSON(result.OpenQuestions)
	_ = s.plans.UpdatePlan(ctx, plan)

	_ = s.revalidate(ctx, tripID)
	_, _ = s.recomputeCoverage(ctx, tripID)

	s.track(c, tripID,
		fmt.Sprintf("ใช้ร่างของ AI (%d วัน)", len(days)),
		events.TypePlanReady, "plan", plan.ID)

	return s.handlePlanDays(c)
}

type buyCreditsRequest struct {
	Quantity int `json:"quantity"`
	// The channel id ("promptpay", "points", …). The label below is what the
	// user actually tapped and is quoted verbatim on the receipt.
	Method  string `json:"method"`
	Channel string `json:"channel"`
}

// handleBuyCredits adds paid drafts. There is no payment gateway in Phase 1:
// points are debited for real, and a cash purchase is recorded and flagged
// `simulated` so nothing in the UI can imply a charge that did not happen.
//
// Either way it leaves a receipt (M20). A purchase the user cannot look up
// afterwards is a purchase they have to take our word for.
func (s *Server) handleBuyCredits(c echo.Context) error {
	var req buyCreditsRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	credits, err := s.aiJobs.Credits(ctx, tripID)
	if err != nil {
		return request.Internal(c, "โหลดโควตาไม่สำเร็จ")
	}

	// The id decides; the label is only ever printed. Older clients that sent a
	// label alone are still understood — that is what the rune check is for now.
	method := domain.NormalisePayMethod(req.Method)
	if req.Method == "" && containsRunes(req.Channel, "แต้ม") {
		method = domain.PayMethodPoints
	}

	usingPoints := method == domain.PayMethodPoints
	if usingPoints {
		balance, err := s.points.Balance(ctx, userID)
		if err != nil {
			return request.Internal(c, "อ่านแต้มไม่สำเร็จ")
		}
		cost := domain.PointsPerAIDraft * req.Quantity
		if balance < cost {
			return request.BadRequest(c, "แต้มไม่พอ")
		}
		err = s.points.Add(ctx, &models.UserPoints{
			UserID: userID,
			Delta:  -cost,
			Reason: models.PointsReasonAIDraft,
			Note:   "แลกโควตาร่างแพลน",
			TripID: &tripID,
		})
		if err != nil {
			return request.Internal(c, "หักแต้มไม่สำเร็จ")
		}
	}

	credits.Extra += req.Quantity
	if err := s.aiJobs.SaveCredits(ctx, credits); err != nil {
		return request.Internal(c, "บันทึกโควตาไม่สำเร็จ")
	}

	tripTitle := ""
	if trip, err := s.trips.GetByID(ctx, tripID); err == nil {
		tripTitle = trip.Title
	}
	pointsSpent := 0
	if usingPoints {
		pointsSpent = domain.PointsPerAIDraft * req.Quantity
	}

	order, err := s.recordOrder(ctx, recordOrderInput{
		UserID:      userID,
		Kind:        domain.OrderKindAICredit,
		Title:       fmt.Sprintf("ร่างแพลนด้วย AI เพิ่ม %d ครั้ง", req.Quantity),
		LineLabel:   "สิทธิ์ให้ AI ร่างแพลน",
		Quantity:    req.Quantity,
		UnitTHB:     domain.PricePerDraftTHB,
		Method:      method,
		MethodLabel: orDefault(req.Channel, domain.PayMethodLabel(method)),
		PointsSpent: pointsSpent,
		TripID:      &tripID,
		TripTitle:   tripTitle,
	})
	if err != nil {
		// The drafts are already granted and the points are already spent, so a
		// receipt that failed to write must not fail the purchase — it is logged
		// and the credits are returned without one.
		logger.L().WithError(err).Error("record order for ai credits")
	}

	out := toCreditsDTO(*credits)
	// A cash purchase has no gateway behind it yet; say so rather than let the
	// UI imply money moved.
	out.Simulated = domain.IsCashMethod(method)
	if order != nil {
		dto := toOrderDTO(*order)
		out.Order = &dto
	}

	s.track(c, tripID, "ซื้อโควตาร่างเพิ่ม "+itoa(req.Quantity)+" ครั้ง", "", "ai_job", tripID)
	return c.JSON(http.StatusOK, out)
}

/* ---------------------------------------------------------- parse ticket -- */

type parseTicketRequest struct {
	Text string `json:"text" validate:"required"`
}

func (s *Server) handleParseTicket(c echo.Context) error {
	var req parseTicketRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c, 30*time.Second)
	defer cancel()

	parsed, err := s.pipeline.ParseTicket(ctx, req.Text)
	if err != nil {
		return request.Internal(c, "อ่านตั๋วไม่สำเร็จ")
	}

	out := parsedTicketDTO{
		Flights:   make([]parsedTicketFlightDTO, 0, len(parsed.Flights)),
		Cities:    ai.TicketCities(parsed),
		Simulated: s.cfg.UseMock() || s.cfg.Anthropic.ApiKey == "",
	}
	for _, f := range parsed.Flights {
		flight := parsedTicketFlightDTO{
			Code:      f.FlightNo,
			From:      f.DepAirport,
			To:        f.ArrAirport,
			Direction: f.Direction,
		}
		if len(f.DepAt) >= 10 {
			flight.Date = f.DepAt[:10]
		}
		if len(f.DepAt) >= 16 {
			t := f.DepAt[11:16]
			flight.Time = &t
		}
		out.Flights = append(out.Flights, flight)
	}
	if parsed.StartDate != "" {
		out.StartDate = &parsed.StartDate
	}
	if parsed.EndDate != "" {
		out.EndDate = &parsed.EndDate
	}
	if size := ai.TicketPartySize(req.Text); size > 0 {
		out.PartySize = &size
	}

	return c.JSON(http.StatusOK, out)
}

func toAIJobDTO(job models.AIJob) aiJobDTO {
	out := aiJobDTO{
		ID:        job.ID,
		TripID:    job.TripID,
		Kind:      job.Kind,
		Status:    job.Status,
		Progress:  job.Progress,
		Step:      job.Step,
		Error:     strPtr(job.Error),
		CreatedAt: job.CreatedAt.UTC().Format(time.RFC3339),
		Simulated: job.Simulated,
	}
	if job.FinishedAt != nil {
		finished := job.FinishedAt.UTC().Format(time.RFC3339)
		out.FinishedAt = &finished
	}
	if len(job.Result) > 0 {
		out.Result = draftResultDTO(job.Result)
	}
	return out
}

// draftResultDTO reshapes a stored draft into the same day/item wire format the
// plan endpoint returns. The dialog that previews a draft and the board that
// renders the applied plan are the same components — giving them two different
// shapes for the same itinerary would be a bug waiting to happen.
func draftResultDTO(raw []byte) json.RawMessage {
	var result ai.DraftResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return json.RawMessage(raw)
	}

	days := make([]planDayDTO, 0, len(result.Days))
	for i, day := range result.Days {
		items := make([]planItemDTO, 0, len(day.Items))
		for j, item := range day.Items {
			dto := planItemDTO{
				// A draft has no ids yet; these are stable within the preview,
				// which is all the list needs to render.
				ID:         fmt.Sprintf("draft-%d-%d", i, j),
				Type:       orDefault(item.Type, models.ItemPOI),
				StartTime:  item.StartTime,
				EndTime:    strPtr(item.EndTime),
				Title:      item.Title,
				Area:       strPtr(item.Area),
				TravelMode: strPtr(item.TravelMode),
				OpenHours:  strPtr(item.OpenHours),
				ForUserIDs: item.ForUsers,
				Bookable:   item.Bookable,
				Note:       strPtr(item.Note),
			}
			if item.CostJPY > 0 {
				cost := item.CostJPY
				dto.CostJPY = &cost
			}
			if item.TravelMin > 0 {
				travel := item.TravelMin
				dto.TravelMin = &travel
			}
			if dto.ForUserIDs == nil {
				dto.ForUserIDs = []string{}
			}
			items = append(items, dto)
		}

		dayDTO := planDayDTO{
			ID:          fmt.Sprintf("draft-%d", i),
			DayIndex:    i + 1,
			Date:        day.Date.Format("2006-01-02"),
			Label:       orDefault(day.Label, fmt.Sprintf("วันที่ %d", i+1)),
			City:        day.City,
			WeatherIcon: strPtr(day.WeatherIcon),
			WeatherText: strPtr(day.WeatherText),
			Items:       items,
		}
		if day.WeatherHigh != 0 || day.WeatherLow != 0 {
			high, low := day.WeatherHigh, day.WeatherLow
			dayDTO.WeatherHigh, dayDTO.WeatherLow = &high, &low
		}
		days = append(days, dayDTO)
	}

	return toJSON(map[string]any{
		"days":           days,
		"rationales":     result.Rationales,
		"open_questions": result.OpenQuestions,
	})
}
