package api

import (
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Agent lead handoff (M22 — A12.12).
//
// Some groups do not want a planner, they want somebody to book the thing.
// This hands the trip to a partner agent — by e-mail and by LINE, whichever is
// configured — and keeps the row so the room can see what happened to their
// request. A form that sends a message nobody can follow up on is a contact
// form, not a handoff, which is why the lead is stored before it is sent.
func (s *Server) registerLeadRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/leads", s.handleListLeads, view)
	g.POST("/:tripId/leads", s.handleCreateLead, edit)
}

type leadDTO struct {
	ID           string  `json:"id"`
	Partner      string  `json:"partner"`
	ContactName  string  `json:"contact_name"`
	ContactPhone string  `json:"contact_phone"`
	ContactLine  string  `json:"contact_line"`
	Note         string  `json:"note"`
	Status       string  `json:"status"`
	SentAt       *string `json:"sent_at"`
	CreatedAt    string  `json:"created_at"`
	// True when no agent channel is configured: the lead is saved and the
	// screen says so rather than implying somebody was messaged.
	Simulated bool `json:"simulated"`
}

type createLeadRequest struct {
	ContactName  string `json:"contact_name" validate:"required"`
	ContactPhone string `json:"contact_phone"`
	ContactLine  string `json:"contact_line"`
	Note         string `json:"note"`
	Partner      string `json:"partner"`
}

func (s *Server) handleListLeads(c echo.Context) error {
	leads, err := s.leads.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดคำขอไม่สำเร็จ")
	}

	out := make([]leadDTO, 0, len(leads))
	for _, lead := range leads {
		out = append(out, s.toLeadDTO(lead))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleCreateLead(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	var req createLeadRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.ContactPhone == "" && req.ContactLine == "" {
		return request.BadRequest(c, "ใส่เบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งอย่าง")
	}

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	lead := &models.AgentLead{
		TripID:       tripID,
		UserID:       userID,
		Partner:      orDefault(req.Partner, s.cfg.AgentPartner),
		ContactName:  req.ContactName,
		ContactPhone: req.ContactPhone,
		ContactLine:  req.ContactLine,
		Note:         req.Note,
		// Snapshotted: the agent quotes against what they were told, and the
		// room keeps editing the trip afterwards.
		PartySize:          trip.PartySize,
		StartDate:          trip.StartDate,
		EndDate:            trip.EndDate,
		Destination:        strings.Join(jsonStrings(toJSONRaw(trip.DestinationCities)), ", "),
		BudgetPerPersonTHB: trip.BudgetPerPersonTHB,
		Status:             models.LeadNew,
	}

	if err := s.leads.Create(ctx, lead); err != nil {
		return request.Internal(c, "ส่งคำขอไม่สำเร็จ")
	}

	if s.deliverLead(ctx, *trip, lead) {
		now := time.Now().UTC()
		lead.Status = models.LeadSent
		lead.SentAt = &now
		if err := s.leads.Update(ctx, lead); err != nil {
			// The agent already has it; failing the request now would invite a
			// second send rather than fix anything.
			lead.Status = models.LeadNew
		}
	}

	s.track(c, tripID, "ขอให้เอเจนต์ช่วยจัดทริปนี้", "", "trip", tripID)

	return c.JSON(http.StatusCreated, s.toLeadDTO(*lead))
}

// deliverLead sends the handoff and reports whether anything actually left the
// building. Both channels are best-effort: an agent inbox that is down must not
// lose the row that says somebody asked.
func (s *Server) deliverLead(ctx contextT, trip models.Trip, lead *models.AgentLead) bool {
	if s.cfg.AgentEmail == "" && s.cfg.AgentLineUserID == "" {
		return false
	}

	dates := "ยังไม่ได้ล็อควัน"
	if lead.StartDate != nil && lead.EndDate != nil {
		dates = domain.ThaiRangeLabel(*lead.StartDate, *lead.EndDate)
	}
	budget := "ยังไม่ได้ตั้งงบ"
	if lead.BudgetPerPersonTHB > 0 {
		budget = fmt.Sprintf("ประมาณ %.0f บาท/คน", lead.BudgetPerPersonTHB)
	}

	sent := false

	if s.cfg.AgentEmail != "" {
		body := fmt.Sprintf(
			`<h2>คำขอให้ช่วยจัดทริป</h2>
<p><b>ทริป:</b> %s (%s)</p>
<p><b>ช่วงเวลา:</b> %s · <b>จำนวน:</b> %d คน · <b>งบ:</b> %s</p>
<p><b>ติดต่อ:</b> %s · โทร %s · LINE %s</p>
<p><b>โน้ตจากลูกค้า:</b><br>%s</p>
<p>อ้างอิงคำขอ: %s</p>`,
			html.EscapeString(trip.Title),
			html.EscapeString(lead.Destination),
			html.EscapeString(dates),
			lead.PartySize,
			html.EscapeString(budget),
			html.EscapeString(lead.ContactName),
			html.EscapeString(orDefault(lead.ContactPhone, "-")),
			html.EscapeString(orDefault(lead.ContactLine, "-")),
			html.EscapeString(lead.Note),
			lead.ID,
		)
		if err := s.email.Send(ctx, s.cfg.AgentEmail, "ROVE — คำขอให้ช่วยจัดทริป: "+trip.Title, body); err == nil {
			sent = true
		}
	}

	if s.cfg.AgentLineUserID != "" {
		s.notify.Push(ctx, s.cfg.AgentLineUserID, fmt.Sprintf(
			"คำขอให้ช่วยจัดทริป\n%s (%s)\n%s · %d คน · %s\nติดต่อ %s %s %s\nอ้างอิง %s",
			trip.Title, lead.Destination, dates, lead.PartySize, budget,
			lead.ContactName, lead.ContactPhone, lead.ContactLine, lead.ID,
		))
		sent = sent || s.notify.Enabled()
	}

	return sent
}

func (s *Server) toLeadDTO(lead models.AgentLead) leadDTO {
	dto := leadDTO{
		ID:           lead.ID,
		Partner:      partnerName(lead.Partner),
		ContactName:  lead.ContactName,
		ContactPhone: lead.ContactPhone,
		ContactLine:  lead.ContactLine,
		Note:         lead.Note,
		Status:       lead.Status,
		CreatedAt:    lead.CreatedAt.UTC().Format(time.RFC3339),
		Simulated:    s.cfg.AgentEmail == "" && s.cfg.AgentLineUserID == "",
	}
	if lead.SentAt != nil {
		sent := lead.SentAt.UTC().Format(time.RFC3339)
		dto.SentAt = &sent
	}
	return dto
}
