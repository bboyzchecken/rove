// Package notify pushes a notification out of the app and onto someone's
// phone (M9 — A9.2).
//
// LINE is the channel that matters for a Thai group trip: everyone in the room
// already has it open. A push needs the recipient's LINE user id, which we
// have only for accounts that signed in with LINE (`provider_uid`), and a
// channel token — so this degrades honestly: no token or no LINE account means
// the in-app inbox is the only delivery, which is still a delivery.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Service interface {
	// Push sends one short message. It never returns an error that should fail
	// the request that triggered it: a notification that did not arrive must
	// not undo the comment that caused it.
	Push(ctx context.Context, lineUserID, text string)
	Enabled() bool
}

const linePushURL = "https://api.line.me/v2/bot/message/push"

type service struct {
	token  string
	client *http.Client
}

func New(cfg core.Config) Service {
	return &service{
		token:  cfg.Line.MessagingToken,
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

var Module = uberfx.Module("services.notify", uberfx.Provide(New))

func (s *service) Enabled() bool { return s.token != "" }

func (s *service) Push(ctx context.Context, lineUserID, text string) {
	if !s.Enabled() || lineUserID == "" || text == "" {
		return
	}

	payload, err := json.Marshal(map[string]any{
		"to":       lineUserID,
		"messages": []map[string]string{{"type": "text", "text": text}},
	})
	if err != nil {
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, linePushURL, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	res, err := s.client.Do(req)
	if err != nil {
		logger.L().WithError(err).Debug("notify: line push failed")
		return
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 {
		logger.L().WithField("status", res.StatusCode).Debug("notify: line push rejected")
	}
}
