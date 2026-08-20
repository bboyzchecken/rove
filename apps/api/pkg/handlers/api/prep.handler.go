package api

import (
	"encoding/json"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// registerPrepRoutes covers the Prep tab (DEV_SPEC §5.8 / M8).
//
//	GET/POST /trips/:tripId/prep             [viewer read / editor write]
//	POST     /trips/:tripId/prep/regenerate  [editor]
//	PATCH    /prep/:blockId                  [viewer — ticking a box is not an edit]
//	DELETE   /prep/:blockId                  [editor]
func (s *Server) registerPrepRoutes(v1, trips *echo.Group) {
	viewer := s.TripRoleMiddleware(models.TripRoleViewer)
	editor := s.TripRoleMiddleware(models.TripRoleEditor)

	trips.GET("/:tripId/prep", s.handleListPrep, viewer)
	trips.POST("/:tripId/prep", s.handleCreatePrep, editor)
	trips.POST("/:tripId/prep/regenerate", s.handleRegeneratePrep, editor)

	prep := v1.Group("/prep", s.JwtMiddleware)
	// Any member may tick a checklist item — that is the whole point of a
	// shared list — so this resolves at viewer level.
	prep.PATCH("/:blockId", s.handleUpdatePrep,
		s.ResolveTrip("blockId", models.TripRoleViewer, s.prepTrip))
	prep.DELETE("/:blockId", s.handleDeletePrep,
		s.ResolveTrip("blockId", models.TripRoleEditor, s.prepTrip))
}

func (s *Server) handleListPrep(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	blocks, err := s.preps.ListByTrip(ctx, tripID)
	if err != nil {
		return request.Internal(c, "อ่านข้อมูลเตรียมตัวไม่สำเร็จ")
	}

	// Generating on first read means the tab is never empty on the first visit,
	// which is when people actually look at it.
	if len(blocks) == 0 {
		if generated, err := s.regeneratePrep(c, tripID); err == nil {
			blocks = generated
		}
	}
	return request.OK(c, map[string]any{"items": blocks})
}

type prepRequest struct {
	Type      string                  `json:"type" validate:"omitempty,oneof=weather packing rule docs custom"`
	Title     string                  `json:"title" validate:"required,max=200"`
	ContentMD string                  `json:"content_md" validate:"omitempty,max=20000"`
	Checklist []models.ChecklistEntry `json:"checklist" validate:"omitempty,max=100,dive"`
}

func (s *Server) handleCreatePrep(c echo.Context) error {
	var req prepRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	existing, _ := s.preps.ListByTrip(ctx, tripID)

	block := &models.PrepBlock{
		TripID:    tripID,
		Type:      orDefaultString(req.Type, models.PrepCustom),
		Title:     req.Title,
		ContentMD: req.ContentMD,
		SortOrder: len(existing),
		// Marking it user-generated is what protects it from regenerate.
		GeneratedBy: models.CreatedByUser,
	}
	if raw, err := json.Marshal(orEmptyChecklist(req.Checklist)); err == nil {
		block.Checklist = datatypes.JSON(raw)
	}

	if err := s.preps.Create(ctx, block); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPrepUpdated,
		EventType:  events.TypePrepUpdated,
		TargetType: "prep", TargetID: block.ID,
	})
	return request.Created(c, block)
}

type updatePrepRequest struct {
	Title     *string                  `json:"title" validate:"omitempty,max=200"`
	ContentMD *string                  `json:"content_md" validate:"omitempty,max=20000"`
	Checklist *[]models.ChecklistEntry `json:"checklist" validate:"omitempty,max=100,dive"`
}

// handleUpdatePrep is what a checkbox tick calls. It stamps who ticked each
// entry so the card can show "แพรเตรียมแล้ว" rather than an anonymous tick.
func (s *Server) handleUpdatePrep(c echo.Context) error {
	var req updatePrepRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	block, err := s.preps.Get(ctx, tripID, c.Param("blockId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการ")
	}

	// Only an editor may rewrite the text of a block; anyone may tick a box.
	isEditor := models.TripRoleRank[request.TripRole(c)] >= models.TripRoleRank[models.TripRoleEditor]
	if (req.Title != nil || req.ContentMD != nil) && !isEditor {
		return request.Forbidden(c, "แก้ไขเนื้อหาได้เฉพาะสมาชิกที่แก้ไขได้")
	}

	if req.Title != nil {
		block.Title = *req.Title
	}
	if req.ContentMD != nil {
		block.ContentMD = *req.ContentMD
	}
	if req.Checklist != nil {
		entries := stampDoneBy(*req.Checklist, request.UserID(c))
		if raw, err := json.Marshal(entries); err == nil {
			block.Checklist = datatypes.JSON(raw)
		}
	}

	if err := s.preps.Update(ctx, block); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPrepUpdated,
		EventType:  events.TypePrepUpdated,
		TargetType: "prep", TargetID: block.ID,
	})
	return request.OK(c, block)
}

// stampDoneBy records who ticked each newly-completed entry and clears the name
// when it is un-ticked.
func stampDoneBy(entries []models.ChecklistEntry, userID string) []models.ChecklistEntry {
	out := make([]models.ChecklistEntry, 0, len(entries))
	for _, e := range entries {
		if e.Done && e.DoneBy == "" {
			e.DoneBy = userID
		}
		if !e.Done {
			e.DoneBy = ""
		}
		out = append(out, e)
	}
	return out
}

func (s *Server) handleDeletePrep(c echo.Context) error {
	tripID := request.TripID(c)
	if err := s.preps.Delete(c.Request().Context(), tripID, c.Param("blockId")); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	return request.NoContent(c)
}

func (s *Server) handleRegeneratePrep(c echo.Context) error {
	blocks, err := s.regeneratePrep(c, request.TripID(c))
	if err != nil {
		return request.Internal(c, "สร้างข้อมูลเตรียมตัวไม่สำเร็จ")
	}
	return request.OK(c, map[string]any{"items": blocks})
}

// regeneratePrep rebuilds only the system blocks; custom blocks written by
// members survive (A8.3).
func (s *Server) regeneratePrep(c echo.Context, tripID string) ([]models.PrepBlock, error) {
	ctx := c.Request().Context()

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return nil, err
	}
	profiles, _ := s.profiles.ListByTrip(ctx, tripID)

	generated, err := s.prep.Generate(ctx, trip, profiles, s.planTags(c, tripID))
	if err != nil {
		return nil, err
	}
	if err := s.preps.ReplaceGenerated(ctx, tripID, generated); err != nil {
		return nil, err
	}

	s.emit(c, tripID, emitOpts{
		Action:     models.ActionPrepUpdated,
		EventType:  events.TypePrepUpdated,
		TargetType: "prep", TargetID: tripID,
	})
	return s.preps.ListByTrip(ctx, tripID)
}

// planTags collects the POI tags in the active plan, which is how the packing
// list knows the group is going to an onsen or a theme park.
func (s *Server) planTags(c echo.Context, tripID string) []string {
	ctx := c.Request().Context()

	plan, err := s.activePlan(ctx, tripID)
	if err != nil {
		return nil
	}
	items, err := s.plans.Items(ctx, plan.ID)
	if err != nil {
		return nil
	}

	ids := []string{}
	for _, it := range items {
		if it.POIID != nil {
			ids = append(ids, *it.POIID)
		}
	}
	pois, err := s.pois.ListByIDs(ctx, ids)
	if err != nil {
		return nil
	}

	seen := map[string]bool{}
	out := []string{}
	for _, p := range pois {
		var tags []string
		if len(p.Tags) > 0 {
			_ = json.Unmarshal(p.Tags, &tags)
		}
		for _, t := range tags {
			if !seen[t] {
				seen[t] = true
				out = append(out, t)
			}
		}
	}
	return out
}

func orEmptyChecklist(s []models.ChecklistEntry) []models.ChecklistEntry {
	if s == nil {
		return []models.ChecklistEntry{}
	}
	return s
}
