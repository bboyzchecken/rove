// Package email sends the few transactional messages this product needs —
// mainly the invite fallback when LINE is not an option.
//
// Decision (DEV_SPEC §16): Resend over the Gmail API. Gmail needs an OAuth
// consent screen and a refresh token per sender, which is a lot of moving parts
// for the handful of messages Phase 1 sends.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Service interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
	Configured() bool
}

const endpoint = "https://api.resend.com/emails"

type service struct {
	apiKey string
	from   string
	http   *http.Client
}

func New(cfg core.Config) Service {
	return &service{
		apiKey: cfg.Email.ResendAPIKey,
		from:   cfg.Email.From,
		http:   &http.Client{Timeout: 10 * time.Second},
	}
}

var Module = fx.Module("services.email", fx.Provide(New))

func (s *service) Configured() bool { return s.apiKey != "" && s.from != "" }

// Send logs and returns nil when email is not configured. An invite link is
// copied to the clipboard in the UI anyway, so a missing SMTP key must not fail
// the invite request.
func (s *service) Send(ctx context.Context, to, subject, htmlBody string) error {
	if !s.Configured() {
		logger.L().WithField("to", to).Info("email not configured, skipping send")
		return nil
	}

	body, err := json.Marshal(map[string]any{
		"from":    s.from,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+s.apiKey)

	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 {
		return fmt.Errorf("email: resend returned %d", res.StatusCode)
	}
	return nil
}
