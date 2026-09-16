// Package sms sends one-time codes to a phone (Feedback #4 — F11, D-29).
//
// No provider is signed yet, so the only implementation is a stub that logs the
// message. The handler returns the code to the caller outside production, which
// is what lets UAT get through phone verification at all.
package sms

import (
	"context"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Service interface {
	Send(ctx context.Context, phone, text string) error
	// Stub reports that nothing was actually delivered.
	Stub() bool
}

func New(core.Config) Service { return stub{} }

var Module = uberfx.Module("services.sms", uberfx.Provide(New))

type stub struct{}

func (stub) Send(_ context.Context, phone, _ string) error {
	logger.L().WithField("phone_last4", last4(phone)).Info("sms stub: code not delivered")
	return nil
}

func (stub) Stub() bool { return true }

func last4(v string) string {
	if len(v) <= 4 {
		return v
	}
	return v[len(v)-4:]
}
