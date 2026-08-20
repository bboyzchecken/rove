// Package storage wraps object storage for exports, OG images and uploads.
//
// Phase 1 decision: exports are streamed straight from the API with a
// Content-Disposition header instead of being uploaded and signed. A trip
// export is a few kilobytes of HTML or ICS that the user asked for and
// downloads immediately — putting it in a bucket first adds a dependency, a
// signing key and a lifecycle policy to solve a problem nobody has yet.
//
// The interface stays because Phase 2 (photos, PDF rendering, OG images) does
// need a bucket; `NewService` returns a stub until R2 credentials are set, and
// every caller has to handle `ErrNotConfigured` anyway.
package storage

import (
	"context"
	"errors"
	"io"
	"time"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

type Service interface {
	Put(ctx context.Context, bucket, key string, body io.Reader, contentType string) error
	SignedURL(ctx context.Context, bucket, key string, ttl time.Duration) (string, error)
	Delete(ctx context.Context, bucket, key string) error
	// Configured reports whether a real bucket is behind this service, so a
	// caller can pick the streaming path instead.
	Configured() bool
}

// ErrNotConfigured is returned by every method when R2 has no credentials.
var ErrNotConfigured = errors.New("storage: R2 is not configured")

type service struct{ cfg core.Config }

func New(cfg core.Config) Service { return &service{cfg: cfg} }

var Module = uberfx.Module("services.storage", uberfx.Provide(New))

func (s *service) Configured() bool {
	return s.cfg.R2.Endpoint != "" && s.cfg.R2.AccessKey != "" && s.cfg.R2.SecretKey != ""
}

func (s *service) Put(context.Context, string, string, io.Reader, string) error {
	if !s.Configured() {
		return ErrNotConfigured
	}
	// TODO(Phase 2 — photos): implement with an S3-compatible client once
	// something needs to persist a file rather than stream it.
	return ErrNotConfigured
}

func (s *service) SignedURL(context.Context, string, string, time.Duration) (string, error) {
	if !s.Configured() {
		return "", ErrNotConfigured
	}
	return "", ErrNotConfigured
}

func (s *service) Delete(context.Context, string, string) error {
	if !s.Configured() {
		return ErrNotConfigured
	}
	return ErrNotConfigured
}
