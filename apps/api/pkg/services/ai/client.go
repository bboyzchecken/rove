// Package ai owns everything that talks to Claude: the HTTP client, the prompt
// templates, the JSON schemas the model must fill, and the pipeline that runs
// them in order (DEV_SPEC §6.3).
//
// Non-negotiable rules:
//   - model output must parse into a Go struct; retry at most twice, then the
//     job is an error
//   - the model never decides opening hours or prices on its own — those come
//     from tools backed by real services
//   - a POI the model invents that is not in our DB is stored as verified='unverified'
//   - every cost the model produces is cost_status='estimate' with a cost_note
//   - token counts and USD cost are written to ai_jobs for every call
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Usage struct {
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
}

type Response struct {
	Text  string `json:"text"`
	Usage Usage  `json:"usage"`
}

// Client is the thin Anthropic wrapper. Kept as an interface so the pipeline
// can be tested with a recorded response.
type Client interface {
	Complete(ctx context.Context, model, system string, msgs []Message, maxTokens int) (*Response, error)
	Configured() bool
}

// ErrNotConfigured is returned when no API key is set. The handler turns it
// into a clear "AI ยังไม่ได้ตั้งค่า" rather than a 500.
var ErrNotConfigured = fmt.Errorf("ai: ANTHROPIC_API_KEY is not configured")

const (
	apiURL     = "https://api.anthropic.com/v1/messages"
	apiVersion = "2023-06-01"
	// maxAttempts is 1 try plus 2 retries, matching the §6.3 rule.
	maxAttempts = 3
	// requestTimeout is generous: a 7-day plan is a large completion.
	requestTimeout = 120 * time.Second
)

// pricePerMTok is USD per million tokens, used only to record job cost so the
// daily cap has something to compare against. Wrong-but-close is fine here;
// the number is a guardrail, not an invoice.
var pricePerMTok = map[string]struct{ In, Out float64 }{
	"claude-opus-5":             {In: 5, Out: 25},
	"claude-sonnet-5":           {In: 3, Out: 15},
	"claude-haiku-4-5-20251001": {In: 1, Out: 5},
}

// defaultPrice covers a model id we do not have a row for, so cost accounting
// never silently reports zero.
var defaultPrice = struct{ In, Out float64 }{In: 3, Out: 15}

type client struct {
	apiKey string
	http   *http.Client
}

func NewClient(cfg core.Config) Client {
	return &client{
		apiKey: cfg.Anthropic.ApiKey,
		http:   &http.Client{Timeout: requestTimeout},
	}
}

func (c *client) Configured() bool { return c.apiKey != "" }

func (c *client) Complete(ctx context.Context, model, system string, msgs []Message, maxTokens int) (*Response, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	if maxTokens <= 0 {
		maxTokens = 8000
	}

	body, err := json.Marshal(map[string]any{
		"model":      model,
		"max_tokens": maxTokens,
		"system":     system,
		"messages":   msgs,
	})
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		res, err := c.attempt(ctx, model, body)
		if err == nil {
			return res, nil
		}
		lastErr = err

		// A bad request will fail identically on every retry; only transient
		// failures are worth waiting for.
		if !retryable(err) || attempt == maxAttempts {
			break
		}
		backoff := time.Duration(attempt*attempt) * time.Second
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, lastErr
}

func (c *client) attempt(ctx context.Context, model string, body []byte) (*Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", apiVersion)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, &apiError{Status: 0, Message: err.Error()}
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, &apiError{Status: res.StatusCode, Message: err.Error()}
	}
	if res.StatusCode != http.StatusOK {
		return nil, &apiError{Status: res.StatusCode, Message: string(raw)}
	}

	var payload struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, &apiError{Status: res.StatusCode, Message: "undecodable response: " + err.Error()}
	}

	var text strings.Builder
	for _, block := range payload.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}

	price, ok := pricePerMTok[model]
	if !ok {
		price = defaultPrice
	}
	cost := float64(payload.Usage.InputTokens)/1e6*price.In +
		float64(payload.Usage.OutputTokens)/1e6*price.Out

	return &Response{
		Text: text.String(),
		Usage: Usage{
			InputTokens:  payload.Usage.InputTokens,
			OutputTokens: payload.Usage.OutputTokens,
			CostUSD:      cost,
		},
	}, nil
}

type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("ai: anthropic returned %d: %s", e.Status, truncate(e.Message, 400))
}

// retryable covers the transient cases: network failures, rate limits and 5xx.
func retryable(err error) bool {
	var ae *apiError
	if !asAPIError(err, &ae) {
		return false
	}
	return ae.Status == 0 || ae.Status == http.StatusTooManyRequests || ae.Status >= 500
}

func asAPIError(err error, target **apiError) bool {
	ae, ok := err.(*apiError)
	if ok {
		*target = ae
	}
	return ok
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

var Module = fx.Module("services.ai", fx.Provide(NewClient, NewTools, NewPipeline))
