package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Document folder (M19 — A19.2): tickets, vouchers, insurance papers — the
// paper the trip runs on, in the room everyone can reach it from.
func (s *Server) registerDocumentRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/documents", s.handleListDocuments, view)
	g.POST("/:tripId/documents", s.handleUploadDocument, edit)
	g.DELETE("/:tripId/documents/:documentId", s.handleDeleteDocument, edit)
}

type documentDTO struct {
	ID          string `json:"id"`
	TripID      string `json:"trip_id"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	CreatedAt   string `json:"created_at"`
}

func (s *Server) toDocumentDTO(ctx contextT, d models.TripDocument) documentDTO {
	url, _ := s.storage.URL(ctx, s.documentBucket(), d.StorageKey)
	return documentDTO{
		ID:          d.ID,
		TripID:      d.TripID,
		UserID:      d.UserID,
		Name:        d.Name,
		Category:    d.Category,
		URL:         url,
		ContentType: d.ContentType,
		SizeBytes:   d.SizeBytes,
		CreatedAt:   d.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func (s *Server) documentBucket() string {
	if s.cfg.R2.DocumentBucket != "" {
		return s.cfg.R2.DocumentBucket
	}
	return "documents"
}

func (s *Server) handleListDocuments(c echo.Context) error {
	ctx := c.Request().Context()

	docs, err := s.documents.ListByTrip(ctx, request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดเอกสารไม่สำเร็จ")
	}
	out := make([]documentDTO, 0, len(docs))
	for _, d := range docs {
		out = append(out, s.toDocumentDTO(ctx, d))
	}
	return c.JSON(http.StatusOK, out)
}

// documentContentTypes is the allowlist (A19.2): the formats a ticket, voucher
// or insurance paper actually arrives in. Executables have no business here.
var documentContentTypes = map[string]bool{
	"application/pdf":    true,
	"image/jpeg":         true,
	"image/png":          true,
	"image/webp":         true,
	"image/heic":         true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

var documentCategories = map[string]bool{
	models.DocTicket: true, models.DocHotel: true, models.DocTransport: true,
	models.DocInsurance: true, models.DocOther: true,
}

func (s *Server) handleUploadDocument(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	file, err := c.FormFile("file")
	if err != nil {
		return request.BadRequest(c, "แนบไฟล์มาด้วย (field ชื่อ file)")
	}

	contentType := file.Header.Get("Content-Type")
	if !documentContentTypes[contentType] {
		return request.BadRequest(c, "ใช้ได้เฉพาะ PDF รูปภาพ หรือไฟล์เอกสารทั่วไป")
	}

	category := c.FormValue("category")
	if !documentCategories[category] {
		category = models.DocOther
	}
	name := strings.TrimSpace(c.FormValue("name"))
	if name == "" {
		name = file.Filename
	}

	src, err := file.Open()
	if err != nil {
		return request.Internal(c, "อ่านไฟล์ไม่สำเร็จ")
	}
	defer src.Close()

	ext := filepath.Ext(file.Filename)
	if len(ext) > 8 {
		ext = ""
	}
	key := fmt.Sprintf("trips/%s/%s%s", tripID, uuid.NewString(), ext)
	if err := s.storage.Put(ctx, s.documentBucket(), key, src, contentType); err != nil {
		return request.Internal(c, "อัปโหลดไฟล์ไม่สำเร็จ")
	}

	doc := &models.TripDocument{
		TripID:      tripID,
		UserID:      request.UserID(c),
		Name:        name,
		Category:    category,
		StorageKey:  key,
		ContentType: contentType,
		SizeBytes:   file.Size,
	}
	if err := s.documents.Create(ctx, doc); err != nil {
		_ = s.storage.Delete(ctx, s.documentBucket(), key)
		return request.Internal(c, "บันทึกเอกสารไม่สำเร็จ")
	}

	s.track(c, tripID, "เพิ่มเอกสาร \""+doc.Name+"\"", events.TypeDocumentChanged, "document", doc.ID)
	return c.JSON(http.StatusCreated, s.toDocumentDTO(ctx, *doc))
}

func (s *Server) handleDeleteDocument(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	doc, err := s.documents.Get(ctx, tripID, c.Param("documentId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบเอกสารนี้")
	}
	if doc.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบได้เฉพาะเอกสารที่ตัวเองอัปโหลด")
	}

	if err := s.documents.Delete(ctx, tripID, doc.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	_ = s.storage.Delete(ctx, s.documentBucket(), doc.StorageKey)

	s.track(c, tripID, "", events.TypeDocumentChanged, "document", doc.ID)
	return c.NoContent(http.StatusNoContent)
}
