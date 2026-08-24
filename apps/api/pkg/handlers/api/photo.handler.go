package api

import (
	"fmt"
	"html/template"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Trip photos (M18 — A18.2/A18.3) and the photo book (A18.4).
//
// The browser resizes before uploading (same rule as trip covers), so the API
// receives a webp measured in hundreds of kilobytes, not a camera original.
func (s *Server) registerPhotoRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/photos", s.handleListPhotos, view)
	g.POST("/:tripId/photos", s.handleUploadPhoto, edit)
	g.DELETE("/:tripId/photos/:photoId", s.handleDeletePhoto, edit)
	g.GET("/:tripId/photobook", s.handlePhotoBook, view)
}

/* ------------------------------------------------------------------ DTOs -- */

type photoDTO struct {
	ID        string  `json:"id"`
	TripID    string  `json:"trip_id"`
	DayID     *string `json:"day_id"`
	ItemID    *string `json:"item_id"`
	UserID    string  `json:"user_id"`
	URL       string  `json:"url"`
	Caption   string  `json:"caption"`
	TakenAt   *string `json:"taken_at"`
	CreatedAt string  `json:"created_at"`
}

func (s *Server) toPhotoDTO(ctx contextT, p models.TripPhoto) photoDTO {
	url, _ := s.storage.URL(ctx, s.photoBucket(), p.StorageKey)
	dto := photoDTO{
		ID:        p.ID,
		TripID:    p.TripID,
		DayID:     p.DayID,
		ItemID:    p.ItemID,
		UserID:    p.UserID,
		URL:       url,
		Caption:   p.Caption,
		CreatedAt: p.CreatedAt.UTC().Format(time.RFC3339),
	}
	if p.TakenAt != nil {
		taken := p.TakenAt.UTC().Format(time.RFC3339)
		dto.TakenAt = &taken
	}
	return dto
}

func (s *Server) photoBucket() string {
	if s.cfg.R2.PhotoBucket != "" {
		return s.cfg.R2.PhotoBucket
	}
	return "photos"
}

/* ------------------------------------------------------------ list/upload */

func (s *Server) handleListPhotos(c echo.Context) error {
	ctx := c.Request().Context()

	photos, err := s.photos.ListByTrip(ctx, request.TripID(c), models.PhotoFilter{
		DayID:  c.QueryParam("day_id"),
		ItemID: c.QueryParam("item_id"),
		UserID: c.QueryParam("user_id"),
	})
	if err != nil {
		return request.Internal(c, "โหลดรูปไม่สำเร็จ")
	}

	out := make([]photoDTO, 0, len(photos))
	for _, p := range photos {
		out = append(out, s.toPhotoDTO(ctx, p))
	}
	return c.JSON(http.StatusOK, out)
}

// photoContentTypes is what an upload may claim to be. The browser encodes to
// webp; jpeg/png are accepted for the phones that hand over originals.
var photoContentTypes = map[string]string{
	"image/webp": ".webp",
	"image/jpeg": ".jpg",
	"image/png":  ".png",
}

func (s *Server) handleUploadPhoto(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	file, err := c.FormFile("image")
	if err != nil {
		return request.BadRequest(c, "แนบรูปมาด้วย (field ชื่อ image)")
	}

	contentType := file.Header.Get("Content-Type")
	ext, ok := photoContentTypes[contentType]
	if !ok {
		return request.BadRequest(c, "ใช้ได้เฉพาะรูป JPG PNG หรือ WebP")
	}

	src, err := file.Open()
	if err != nil {
		return request.Internal(c, "อ่านไฟล์ไม่สำเร็จ")
	}
	defer src.Close()

	key := fmt.Sprintf("trips/%s/%s%s", tripID, uuid.NewString(), ext)
	if err := s.storage.Put(ctx, s.photoBucket(), key, src, contentType); err != nil {
		return request.Internal(c, "อัปโหลดรูปไม่สำเร็จ")
	}

	photo := &models.TripPhoto{
		TripID:      tripID,
		UserID:      userID,
		StorageKey:  key,
		ContentType: contentType,
		SizeBytes:   file.Size,
		Caption:     c.FormValue("caption"),
	}
	if v := c.FormValue("day_id"); v != "" {
		photo.DayID = &v
	}
	if v := c.FormValue("item_id"); v != "" {
		photo.ItemID = &v
		// A photo pinned to an item inherits the item's day and POI, so the
		// grid can group without a join the client would have to redo.
		if item, err := s.plans.GetItem(ctx, tripID, v); err == nil {
			photo.DayID = &item.DayID
			photo.POIID = item.POIID
		}
	}
	if taken, ok := parseDateParam(c.FormValue("taken_at")); ok {
		photo.TakenAt = &taken
	}

	if err := s.photos.Create(ctx, photo); err != nil {
		_ = s.storage.Delete(ctx, s.photoBucket(), key)
		return request.Internal(c, "บันทึกรูปไม่สำเร็จ")
	}

	s.track(c, tripID, "อัปโหลดรูปใหม่", events.TypePhotoChanged, "photo", photo.ID)
	return c.JSON(http.StatusCreated, s.toPhotoDTO(ctx, *photo))
}

func (s *Server) handleDeletePhoto(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	photo, err := s.photos.Get(ctx, tripID, c.Param("photoId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบรูปนี้")
	}
	// The uploader may delete their own shot; the owner may delete anything.
	if photo.UserID != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบได้เฉพาะรูปของตัวเอง")
	}

	if err := s.photos.Delete(ctx, tripID, photo.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}
	_ = s.storage.Delete(ctx, s.photoBucket(), photo.StorageKey)

	s.track(c, tripID, "", events.TypePhotoChanged, "photo", photo.ID)
	return c.NoContent(http.StatusNoContent)
}

/* -------------------------------------------------------- photo book ----- */

// photoBookTemplate is a self-contained page the browser prints to PDF — the
// same choice the plan export made (Decision Log 20 ส.ค.): no headless Chrome
// on the instance, and the user picks their own paper size.
var photoBookTemplate = template.Must(template.New("photobook").Parse(`<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>{{.Title}} — Photo Book</title>
<style>
  body { font-family: 'Inter', 'Noto Sans Thai', sans-serif; color: #3D2B24; margin: 0; }
  .cover { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; text-align: center; padding: 2rem; }
  .cover h1 { font-size: 2.4rem; margin: 0.5rem 0 0.2rem; }
  .cover p { color: #6B5B4E; }
  .day { page-break-before: always; padding: 1.5rem 2rem; }
  .day h2 { font-size: 1.3rem; border-bottom: 2px solid #D9714E; padding-bottom: 0.4rem; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.8rem; margin-top: 1rem; }
  figure { margin: 0; break-inside: avoid; }
  img { width: 100%; border-radius: 12px; display: block; }
  figcaption { font-size: 0.75rem; color: #6B5B4E; margin-top: 0.3rem; }
  .footer { text-align: center; color: #6B5B4E; font-size: 0.7rem; padding: 2rem; }
  @media print { .day { padding: 0.5rem 0; } }
</style></head><body>
<div class="cover">
  <p>ROVE Travel Photo Book</p>
  <h1>{{.Title}}</h1>
  <p>{{.Subtitle}}</p>
</div>
{{range .Days}}
<section class="day">
  <h2>{{.Label}}</h2>
  <div class="grid">
    {{range .Photos}}<figure><img src="{{.URL}}" alt="">{{if .Caption}}<figcaption>{{.Caption}}</figcaption>{{end}}</figure>{{end}}
  </div>
</section>
{{end}}
<p class="footer">ทำด้วย ROVE — rovetravel.site</p>
</body></html>`))

type photoBookDay struct {
	Label  string
	Photos []photoDTO
}

// handlePhotoBook renders every photo of the trip, grouped by day, as one
// printable page (A18.4 — W18.4).
func (s *Server) handlePhotoBook(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	photos, err := s.photos.ListByTrip(ctx, tripID, models.PhotoFilter{})
	if err != nil || len(photos) == 0 {
		return request.BadRequest(c, "ยังไม่มีรูปในทริปนี้ — อัปโหลดก่อนแล้วค่อยทำโฟโต้บุ๊ก")
	}

	days, _ := s.plans.ListDays(ctx, tripID)
	dayLabel := map[string]string{}
	dayOrder := map[string]int{}
	for _, day := range days {
		label := day.Label
		if label == "" {
			label = fmt.Sprintf("วันที่ %d", day.DayIndex)
		}
		dayLabel[day.ID] = label
		dayOrder[day.ID] = day.DayIndex
	}

	grouped := map[string][]photoDTO{}
	for _, p := range photos {
		key := ""
		if p.DayID != nil {
			key = *p.DayID
		}
		grouped[key] = append(grouped[key], s.toPhotoDTO(ctx, p))
	}

	keys := make([]string, 0, len(grouped))
	for key := range grouped {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		// Unassigned photos land in a final "ความทรงจำอื่นๆ" section.
		oi, oki := dayOrder[keys[i]]
		oj, okj := dayOrder[keys[j]]
		if oki && okj {
			return oi < oj
		}
		return oki
	})

	bookDays := make([]photoBookDay, 0, len(keys))
	for _, key := range keys {
		label := dayLabel[key]
		if label == "" {
			label = "ความทรงจำอื่นๆ"
		}
		bookDays = append(bookDays, photoBookDay{Label: label, Photos: grouped[key]})
	}

	subtitle := strings.Join(jsonStrings(toJSONRaw(trip.DestinationCities)), " · ")
	if trip.StartDate != nil && trip.EndDate != nil {
		subtitle = fmt.Sprintf("%s — %s · %s",
			trip.StartDate.Format("2 Jan 2006"), trip.EndDate.Format("2 Jan 2006"), subtitle)
	}

	var b strings.Builder
	if err := photoBookTemplate.Execute(&b, map[string]any{
		"Title":    trip.Title,
		"Subtitle": subtitle,
		"Days":     bookDays,
	}); err != nil {
		return request.Internal(c, "สร้างโฟโต้บุ๊กไม่สำเร็จ")
	}

	return c.HTML(http.StatusOK, b.String())
}
