// Package export renders a plan as a self-contained HTML file (and, when a
// renderer is configured, a PDF), uploads it to R2 and hands back a signed URL
// (DEV_SPEC M10 / A10.2, A10.3).
//
// Decision (§16): PDF goes through Gotenberg, not chromedp. chromedp would put
// a full Chrome inside the API image on a 2 GB box; Gotenberg is a container we
// start only when someone actually exports, and it is one HTTP call away.
package export

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/storage"
)

// Formats.
const (
	FormatHTML = "html"
	FormatPDF  = "pdf"
)

// SignedURLTTL is how long an export link stays valid. Long enough to share in
// a LINE group, short enough that a leaked link expires.
const SignedURLTTL = 24 * time.Hour

type Service interface {
	// Render produces the export and returns a signed URL to it.
	Render(ctx context.Context, format string, data PlanView) (string, error)
	// HTML renders the document without uploading, for the share page and tests.
	HTML(data PlanView) ([]byte, error)
}

// PlanView is the whole document, flattened. Nothing here is loaded lazily —
// the export must render with no DB access so it can run in a worker.
type PlanView struct {
	TripID       string
	PlanID       string
	Title        string
	Subtitle     string
	StartDate    string
	EndDate      string
	PartySize    int
	Summary      string
	BrandName    string
	GeneratedAt  string
	HomeCurrency string
	// FXNote is the "อัตราโดยประมาณ ณ ..." label required wherever converted
	// money appears (DEV_SPEC §7.2).
	FXNote     string
	TotalLabel string
	Days       []DayView
	Members    []string
}

type DayView struct {
	Date  string
	Title string
	Theme string
	Items []ItemView
}

type ItemView struct {
	Time     string
	Title    string
	Notes    string
	Type     string
	Travel   string
	Cost     string
	Verified bool
}

type service struct {
	cfg     core.Config
	storage storage.Service
	tpl     *template.Template
	http    *http.Client
}

func New(cfg core.Config, s storage.Service) Service {
	return &service{
		cfg:     cfg,
		storage: s,
		tpl:     template.Must(template.New("plan").Parse(planTemplate)),
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

var Module = fx.Module("services.export", fx.Provide(New))

func (s *service) HTML(data PlanView) ([]byte, error) {
	var buf bytes.Buffer
	if err := s.tpl.Execute(&buf, data); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (s *service) Render(ctx context.Context, format string, data PlanView) (string, error) {
	html, err := s.HTML(data)
	if err != nil {
		return "", err
	}

	body, contentType, ext := html, "text/html; charset=utf-8", "html"
	if format == FormatPDF {
		pdf, err := s.toPDF(ctx, html)
		if err != nil {
			return "", err
		}
		body, contentType, ext = pdf, "application/pdf", "pdf"
	}

	key := fmt.Sprintf("plans/%s/%s-%d.%s",
		data.TripID, data.PlanID, time.Now().UTC().Unix(), ext)
	bucket := s.cfg.R2.ExportBucket

	if err := s.storage.Put(ctx, bucket, key, bytes.NewReader(body), contentType); err != nil {
		return "", err
	}
	return s.storage.SignedURL(ctx, bucket, key, SignedURLTTL)
}

// ErrPDFNotConfigured means no Gotenberg URL is set; the caller offers HTML.
var ErrPDFNotConfigured = fmt.Errorf("export: GOTENBERG_URL is not configured")

func (s *service) toPDF(ctx context.Context, html []byte) ([]byte, error) {
	base := s.cfg.GotenbergURL
	if base == "" {
		return nil, ErrPDFNotConfigured
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("files", "index.html")
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(html); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		base+"/forms/chromium/convert/html", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", w.FormDataContentType())

	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("export: gotenberg returned %d", res.StatusCode)
	}
	return io.ReadAll(res.Body)
}
