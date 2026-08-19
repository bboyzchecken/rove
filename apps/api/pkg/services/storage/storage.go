// Package storage wraps Cloudflare R2 (S3-compatible) for exports, OG images
// and uploads. R2 is used because egress is free (DEV_SPEC §2.3).
package storage

import (
	"context"
	"io"
	"time"
)

type Service interface {
	Put(ctx context.Context, bucket, key string, body io.Reader, contentType string) error
	SignedURL(ctx context.Context, bucket, key string, ttl time.Duration) (string, error)
	Delete(ctx context.Context, bucket, key string) error
}

// TODO(A10.2): implement with aws-sdk-go-v2 pointed at Config.R2.Endpoint.
