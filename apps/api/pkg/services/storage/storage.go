// Package storage wraps Cloudflare R2 (S3-compatible) for exports, OG images
// and uploads. R2 is used because egress is free (DEV_SPEC §2.3).
package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

type Service interface {
	Put(ctx context.Context, bucket, key string, body io.Reader, contentType string) error
	// SignedURL is how a private export reaches the browser: a short-lived URL
	// rather than a public bucket.
	SignedURL(ctx context.Context, bucket, key string, ttl time.Duration) (string, error)
	Delete(ctx context.Context, bucket, key string) error
	Configured() bool
}

// ErrNotConfigured is returned when R2 credentials are absent. Export jobs
// report it as a job error rather than crashing the worker.
var ErrNotConfigured = fmt.Errorf("storage: R2 credentials are not configured")

type service struct {
	client *s3.Client
	ok     bool
}

func New(cfg core.Config) Service {
	r2 := cfg.R2
	if r2.Endpoint == "" || r2.AccessKey == "" || r2.SecretKey == "" {
		// Running without object storage is normal in local dev; every method
		// returns ErrNotConfigured instead of panicking at wire time.
		return &service{}
	}

	region := r2.Region
	if region == "" {
		region = "auto" // R2 ignores region but the SDK requires one
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(r2.AccessKey, r2.SecretKey, ""),
		),
	)
	if err != nil {
		return &service{}
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = &r2.Endpoint
		// R2 does not support virtual-hosted-style addressing.
		o.UsePathStyle = true
	})
	return &service{client: client, ok: true}
}

var Module = fx.Module("services.storage", fx.Provide(New))

func (s *service) Configured() bool { return s.ok }

func (s *service) Put(ctx context.Context, bucket, key string, body io.Reader, contentType string) error {
	if !s.ok {
		return ErrNotConfigured
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &key,
		Body:        body,
		ContentType: &contentType,
	})
	return err
}

func (s *service) SignedURL(ctx context.Context, bucket, key string, ttl time.Duration) (string, error) {
	if !s.ok {
		return "", ErrNotConfigured
	}
	presign := s3.NewPresignClient(s.client)
	req, err := presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (s *service) Delete(ctx context.Context, bucket, key string) error {
	if !s.ok {
		return ErrNotConfigured
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &bucket, Key: &key})
	return err
}
