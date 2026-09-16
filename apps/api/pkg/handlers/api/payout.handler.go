package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Ops side of the partner economy (M22 — A12.11 / A12.12).
//
// Admin-only: this is the screen somebody reads before money leaves the
// company account, and the queue somebody works before an agent calls a
// customer back.
func (s *Server) registerPayoutRoutes(g *echo.Group) {
	// Cycles, reconciliation and transfers (Feedback #4 — F11) live in
	// admin_payout.handler.go; this file keeps the agent lead queue.
	s.registerAdminPayoutRoutes(g)
	g.GET("/leads", s.handleAdminLeads)
	g.PATCH("/leads/:leadId", s.handleAdminUpdateLead)
}

/* ------------------------------------------------------- lead queue ----- */

type adminLeadDTO struct {
	leadDTO
	TripID             string  `json:"trip_id"`
	Destination        string  `json:"destination"`
	PartySize          int     `json:"party_size"`
	BudgetPerPersonTHB float64 `json:"budget_per_person_thb"`
	AdminNote          string  `json:"admin_note"`
}

type updateLeadRequest struct {
	Status    string `json:"status"`
	AdminNote string `json:"admin_note"`
}

func (s *Server) handleAdminLeads(c echo.Context) error {
	leads, err := s.leads.List(c.Request().Context(), c.QueryParam("status"), 100)
	if err != nil {
		return request.Internal(c, "โหลดคำขอไม่สำเร็จ")
	}

	out := make([]adminLeadDTO, 0, len(leads))
	for _, lead := range leads {
		out = append(out, s.toAdminLeadDTO(lead))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleAdminUpdateLead(c echo.Context) error {
	ctx := c.Request().Context()

	lead, err := s.leads.Get(ctx, c.Param("leadId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบคำขอนี้")
	}

	var req updateLeadRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	if req.Status != "" {
		if !validLeadStatus(req.Status) {
			return request.BadRequest(c, "สถานะไม่ถูกต้อง")
		}
		lead.Status = req.Status
	}
	if req.AdminNote != "" {
		lead.AdminNote = req.AdminNote
	}

	if err := s.leads.Update(ctx, lead); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, s.toAdminLeadDTO(*lead))
}

func validLeadStatus(status string) bool {
	switch status {
	case models.LeadNew, models.LeadSent, models.LeadContacted, models.LeadWon, models.LeadLost:
		return true
	}
	return false
}

func (s *Server) toAdminLeadDTO(lead models.AgentLead) adminLeadDTO {
	return adminLeadDTO{
		leadDTO:            s.toLeadDTO(lead),
		TripID:             lead.TripID,
		Destination:        lead.Destination,
		PartySize:          lead.PartySize,
		BudgetPerPersonTHB: lead.BudgetPerPersonTHB,
		AdminNote:          lead.AdminNote,
	}
}
