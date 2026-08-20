// Package email sends the few transactional messages this product needs.
//
// Phase 1 decision: there are none. Invites are links pasted into a LINE chat
// (M2 — W2.4), the AI paywall is in-app, and there is no password to reset
// because sign-in is OAuth. Rather than wire a provider nothing calls, this is
// a logging stub that records what *would* have been sent — so the day a real
// message is needed, the call site already exists and only the transport
// changes.
package email

import (
	"context"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Service interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
}

type service struct{ cfg core.Config }

func New(cfg core.Config) Service { return &service{cfg: cfg} }

var Module = uberfx.Module("services.email", uberfx.Provide(New))

// Send never fails: nothing in Phase 1 depends on delivery, and turning a
// missing provider into a 500 on an otherwise successful invite would be the
// wrong trade.
func (s *service) Send(_ context.Context, to, subject, _ string) error {
	logger.L().WithField("to", to).WithField("subject", subject).
		Info("email: not sent — no transport configured in this phase")
	return nil
}
