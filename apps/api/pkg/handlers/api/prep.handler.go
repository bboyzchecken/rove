package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Prep checklist (M8 — A8.1 … A8.3).
func (s *Server) registerPrepRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/prep", s.handleListPrep, view)
	g.POST("/:tripId/prep", s.handleCreatePrep, edit)
	g.PATCH("/:tripId/prep/:taskId", s.handleUpdatePrep, edit)
	g.DELETE("/:tripId/prep/:taskId", s.handleDeletePrep, edit)
	g.POST("/:tripId/prep/template", s.handleApplyPrepTemplate, edit)
	g.GET("/:tripId/prep/note", s.handleGetPrepNote, view)
	g.PUT("/:tripId/prep/note", s.handleSavePrepNote, edit)
}

// japanTemplate is the default checklist for a Japan trip (A8.3). It is a
// country template, not a generic one: "Visit Japan Web" is the item that
// actually catches people out.
var japanTemplate = []struct {
	title    string
	category string
}{
	{"เช็กวันหมดอายุพาสปอร์ต (เหลือ > 6 เดือน)", models.PrepDocument},
	{"ลงทะเบียน Visit Japan Web ล่วงหน้า", models.PrepDocument},
	{"ซื้อประกันเดินทาง", models.PrepHealth},
	{"ซื้อ eSIM / pocket wifi", models.PrepBooking},
	{"แลกเงินเยน / เปิดบัตรที่กดเงินต่างประเทศได้", models.PrepMoney},
	{"จองที่พักให้ครบทุกคืน", models.PrepBooking},
	{"เตรียมยาประจำตัว + ยาแก้หวัด", models.PrepHealth},
	{"เตรียมเสื้อกันหนาว / ร่มพับ", models.PrepPacking},
	{"ปลั๊กแปลง Type A + power bank", models.PrepPacking},
	{"ตั้งกลุ่มแชร์ตำแหน่งไว้ใช้ตอนหลง", models.PrepOther},
}

func (s *Server) handleListPrep(c echo.Context) error {
	tasks, err := s.prep.ListByTrip(c.Request().Context(), request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดเช็กลิสต์ไม่สำเร็จ")
	}
	out := make([]prepTaskDTO, 0, len(tasks))
	for _, t := range tasks {
		out = append(out, toPrepDTO(t))
	}
	return c.JSON(http.StatusOK, out)
}

type prepRequest struct {
	Title      string  `json:"title"`
	Category   string  `json:"category"`
	AssigneeID *string `json:"assignee_id"`
	DueDate    string  `json:"due_date"`
	Done       *bool   `json:"done"`
	Note       string  `json:"note"`
}

func (s *Server) handleCreatePrep(c echo.Context) error {
	var req prepRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if req.Title == "" {
		return request.BadRequest(c, "ใส่ชื่อสิ่งที่ต้องเตรียมด้วย")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	task := &models.PrepTask{
		TripID:     tripID,
		Title:      req.Title,
		Category:   orDefault(req.Category, models.PrepOther),
		AssigneeID: req.AssigneeID,
		Note:       req.Note,
	}
	if due, ok := parseDateParam(req.DueDate); ok {
		task.DueDate = &due
	}

	if err := s.prep.Create(ctx, task); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePrepChanged, "prep", task.ID)
	return c.JSON(http.StatusCreated, toPrepDTO(*task))
}

func (s *Server) handleUpdatePrep(c echo.Context) error {
	var req prepRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	task, err := s.prep.Get(ctx, tripID, c.Param("taskId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรายการนี้")
	}

	if req.Title != "" {
		task.Title = req.Title
	}
	if req.Category != "" {
		task.Category = req.Category
	}
	if req.AssigneeID != nil {
		task.AssigneeID = req.AssigneeID
	}
	if req.Note != "" {
		task.Note = req.Note
	}
	if due, ok := parseDateParam(req.DueDate); ok {
		task.DueDate = &due
	}
	if req.Done != nil {
		task.Done = *req.Done
		if task.Done {
			task.DoneBy = &userID
		} else {
			task.DoneBy = nil
		}
	}

	if err := s.prep.Update(ctx, task); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePrepChanged, "prep", task.ID)
	return c.JSON(http.StatusOK, toPrepDTO(*task))
}

func (s *Server) handleDeletePrep(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	if err := s.prep.Delete(ctx, tripID, c.Param("taskId")); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	s.track(c, tripID, "", events.TypePrepChanged, "prep", c.Param("taskId"))
	return c.NoContent(http.StatusNoContent)
}

// handleApplyPrepTemplate seeds the country template, skipping anything already
// on the list — pressing it twice is harmless.
func (s *Server) handleApplyPrepTemplate(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	tasks := make([]models.PrepTask, 0, len(japanTemplate))
	for i, row := range japanTemplate {
		tasks = append(tasks, models.PrepTask{
			TripID:       tripID,
			Title:        row.title,
			Category:     row.category,
			FromTemplate: true,
			SortOrder:    i,
		})
	}

	if err := s.prep.CreateMany(ctx, tasks); err != nil {
		return request.Internal(c, "ดึงเช็กลิสต์ไม่สำเร็จ")
	}

	s.track(c, tripID, "ดึงเช็กลิสต์เตรียมตัวมาใช้", events.TypePrepChanged, "prep", tripID)
	return s.handleListPrep(c)
}

/* ------------------------------------------------------------------ note -- */

func (s *Server) handleGetPrepNote(c echo.Context) error {
	note, err := s.prep.GetNote(c.Request().Context(), request.TripID(c))
	if err != nil {
		// No note yet is the normal case, not an error.
		return c.JSON(http.StatusOK, map[string]string{"body": ""})
	}
	return c.JSON(http.StatusOK, map[string]string{"body": note.Body})
}

type prepNoteRequest struct {
	Body string `json:"body"`
}

func (s *Server) handleSavePrepNote(c echo.Context) error {
	var req prepNoteRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	note := &models.PrepNote{TripID: tripID, Body: req.Body, Author: request.UserID(c)}
	if existing, err := s.prep.GetNote(ctx, tripID); err == nil {
		note.ID = existing.ID
	}

	if err := s.prep.SaveNote(ctx, note); err != nil {
		return request.Internal(c, "บันทึกโน้ตไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePrepChanged, "prep", tripID)
	return c.JSON(http.StatusOK, map[string]string{"body": note.Body})
}
