package api

import (
	"bytes"
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/str"
)

// Export (M10 — A10.2).
//
// The file is streamed straight back rather than uploaded to a bucket and
// signed: a trip export is a few kilobytes the user asked for and downloads
// immediately, and a round trip through storage would add a dependency, a key
// and a lifecycle policy to solve a problem nobody has. Money is never in it,
// at any visibility (W16.5).
func (s *Server) registerExportRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)

	g.POST("/:tripId/export", s.handleExport, view)
	g.GET("/:tripId/export", s.handleExport, view)
}

type exportRequest struct {
	Format string `json:"format"`
}

func (s *Server) handleExport(c echo.Context) error {
	var req exportRequest
	_ = c.Bind(&req)

	format := strings.ToLower(orDefault(req.Format, c.QueryParam("format")))
	if format == "" {
		format = "html"
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)

	trip, err := s.trips.GetByID(ctx, tripID)
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}
	days, _ := s.plans.ListDays(ctx, tripID)
	items, _ := s.plans.ListItems(ctx, tripID)

	byDay := map[string][]models.PlanItem{}
	for _, item := range items {
		byDay[item.DayID] = append(byDay[item.DayID], item)
	}

	filename := str.Slugify(trip.Title)
	if filename == "" {
		filename = "trip"
	}

	switch format {
	case "ics":
		body := buildICS(*trip, days, byDay)
		return download(c, filename+".ics", "text/calendar; charset=utf-8", body)

	case "json":
		payload := map[string]any{"trip": toTripDTO(*trip), "days": planDayDTOs(days, byDay)}
		return download(c, filename+".json", "application/json; charset=utf-8", toJSON(payload))

	case "pdf", "html":
		// "PDF" is the browser's print dialog on a self-contained page: a
		// headless renderer is a whole service to maintain, and the page it
		// would render is this one.
		body := buildPrintableHTML(*trip, days, byDay)
		return download(c, filename+".html", "text/html; charset=utf-8", body)

	default:
		return request.BadRequest(c, "รูปแบบไฟล์ไม่รองรับ")
	}
}

func download(c echo.Context, filename, contentType string, body []byte) error {
	c.Response().Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	return c.Blob(http.StatusOK, contentType, body)
}

func planDayDTOs(days []models.PlanDay, byDay map[string][]models.PlanItem) []planDayDTO {
	out := make([]planDayDTO, 0, len(days))
	for _, day := range days {
		out = append(out, toPlanDayDTO(day, byDay[day.ID]))
	}
	return out
}

/* ------------------------------------------------------------------- ics -- */

// buildICS emits one all-day event per plan day, with the stops in the
// description. Per-item timed events would flood a personal calendar with
// twenty entries a day.
func buildICS(trip models.Trip, days []models.PlanDay, byDay map[string][]models.PlanItem) []byte {
	var b bytes.Buffer

	b.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ROVE//TH//\r\nCALSCALE:GREGORIAN\r\n")

	for _, day := range days {
		lines := make([]string, 0, len(byDay[day.ID]))
		for _, item := range byDay[day.ID] {
			lines = append(lines, item.StartTime+" "+item.Title)
		}

		b.WriteString("BEGIN:VEVENT\r\n")
		fmt.Fprintf(&b, "UID:%s@rove.app\r\n", day.ID)
		fmt.Fprintf(&b, "DTSTART;VALUE=DATE:%s\r\n", day.Date.Format("20060102"))
		fmt.Fprintf(&b, "DTEND;VALUE=DATE:%s\r\n", day.Date.AddDate(0, 0, 1).Format("20060102"))
		fmt.Fprintf(&b, "SUMMARY:%s — %s\r\n", icsEscape(trip.Title), icsEscape(day.Label))
		fmt.Fprintf(&b, "DESCRIPTION:%s\r\n", icsEscape(strings.Join(lines, "\\n")))
		if day.City != "" {
			fmt.Fprintf(&b, "LOCATION:%s\r\n", icsEscape(day.City))
		}
		b.WriteString("END:VEVENT\r\n")
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.Bytes()
}

func icsEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, ";", "\\;")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

/* ------------------------------------------------------------------ html -- */

// buildPrintableHTML is deliberately self-contained: no fonts, no scripts, no
// external CSS. It has to render the same in a browser, in a print dialog and
// in whatever the file gets forwarded into.
func buildPrintableHTML(trip models.Trip, days []models.PlanDay, byDay map[string][]models.PlanItem) []byte {
	var b bytes.Buffer

	dates := ""
	if trip.StartDate != nil && trip.EndDate != nil {
		dates = domain.ThaiRangeLabel(*trip.StartDate, *trip.EndDate) +
			fmt.Sprintf(" · %d วัน %d คืน", domain.DaysBetween(*trip.StartDate, *trip.EndDate), trip.Nights())
	}

	b.WriteString(`<!doctype html><html lang="th"><head><meta charset="utf-8">`)
	fmt.Fprintf(&b, `<title>%s — ROVE</title>`, html.EscapeString(trip.Title))
	b.WriteString(`<meta name="viewport" content="width=device-width,initial-scale=1">`)
	b.WriteString(`<style>
:root{color-scheme:light}
body{font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;color:#3D2B24;background:#fff;margin:0;padding:32px;line-height:1.6}
.wrap{max-width:720px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.3px}
.sub{color:#6B5B4E;font-size:14px;margin:0 0 28px}
h2{font-size:15px;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid #eee}
.item{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f5f5f5}
.time{width:52px;flex:none;font-variant-numeric:tabular-nums;font-size:13px;color:#6B5B4E}
.title{font-weight:600;font-size:14px}
.meta{color:#6B5B4E;font-size:12px}
.foot{margin-top:36px;color:#6B5B4E;font-size:12px;border-top:1px solid #eee;padding-top:12px}
@media print{body{padding:0}.foot{position:fixed;bottom:0}}
</style></head><body><div class="wrap">`)

	fmt.Fprintf(&b, `<h1>%s</h1>`, html.EscapeString(trip.Title))
	fmt.Fprintf(&b, `<p class="sub">%s</p>`, html.EscapeString(dates))

	for _, day := range days {
		fmt.Fprintf(&b, `<h2>%s · %s</h2>`, html.EscapeString(day.Label), html.EscapeString(day.City))
		for _, item := range byDay[day.ID] {
			meta := item.Area
			if item.CostJPY != nil && *item.CostJPY > 0 {
				if meta != "" {
					meta += " · "
				}
				meta += fmt.Sprintf("¥%.0f", *item.CostJPY)
			}
			b.WriteString(`<div class="item">`)
			fmt.Fprintf(&b, `<div class="time">%s</div><div><div class="title">%s</div>`,
				html.EscapeString(item.StartTime), html.EscapeString(item.Title))
			if meta != "" {
				fmt.Fprintf(&b, `<div class="meta">%s</div>`, html.EscapeString(meta))
			}
			b.WriteString(`</div></div>`)
		}
	}

	b.WriteString(`<p class="foot">พิมพ์จาก ROVE · ค่าใช้จ่ายจริงของกลุ่มไม่ถูกรวมในไฟล์นี้</p>`)
	b.WriteString(`</div></body></html>`)

	return b.Bytes()
}
