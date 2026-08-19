// Package email sends the few transactional messages this product needs —
// mainly the invite fallback when LINE is not an option.
package email

import "context"

type Service interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
}

// TODO(A2.2): implement with Gmail API (per PROJECT_TEMPLATE) or Resend.
// Decide and record it in DEV_SPEC §16.
