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
	"net/http"
	"strings"
	"time"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Usage struct {
	InputTokens  int
	OutputTokens int
	CostUSD      float64
}

type Response struct {
	Text  string
	Usage Usage
	// Simulated is true when no model was called, so the job — and the UI —
	// can say so instead of implying a draft came from Claude.
	Simulated bool
}

// Client is the thin Anthropic wrapper. Kept as an interface so the pipeline
// can be tested with a recorded response.
type Client interface {
	Complete(ctx context.Context, model string, system string, msgs []Message, maxTokens int) (*Response, error)
}

// Pricing per million tokens, used for the daily cost cap (A4.11). Rounded up
// from the published rates: a cap that under-counts is not a cap.
var pricing = map[string]struct{ in, out float64 }{
	"claude-opus-4-20250514":     {15, 75},
	"claude-sonnet-4-20250514":   {3, 15},
	"claude-3-5-haiku-20241022":  {0.80, 4},
	"claude-haiku-4-5-20251001":  {1, 5},
}

const defaultPricingKey = "claude-sonnet-4-20250514"

// NewClient returns the live Anthropic client, or the stand-in when the API key
// is missing or STUB_PROVIDERS is on. The two are interchangeable by design: UAT
// exercises the same pipeline, the same schema and the same persistence.
func NewClient(cfg core.Config) Client {
	if cfg.UseStubs() || cfg.Anthropic.ApiKey == "" {
		logger.L().Info("ai: using the simulated client (no ANTHROPIC_API_KEY or STUB_PROVIDERS=true)")
		return &mockClient{}
	}
	return &anthropicClient{
		cfg: cfg,
		// Drafting a week takes real time; the job is async, so a generous
		// timeout here is cheaper than a retry storm.
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

var Module = uberfx.Module("services.ai", uberfx.Provide(NewClient, NewPipeline))

/* ------------------------------------------------------------ anthropic -- */

type anthropicClient struct {
	cfg    core.Config
	client *http.Client
}

const anthropicURL = "https://api.anthropic.com/v1/messages"

func (c *anthropicClient) Complete(
	ctx context.Context,
	model, system string,
	msgs []Message,
	maxTokens int,
) (*Response, error) {
	if model == "" {
		model = c.cfg.Anthropic.ModelPlanner
	}
	if maxTokens <= 0 {
		maxTokens = c.cfg.Anthropic.MaxTokens
	}

	body := map[string]any{
		"model":      model,
		"max_tokens": maxTokens,
		"system":     system,
		"messages":   msgs,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicURL, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", c.cfg.Anthropic.ApiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var payload struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ai: anthropic returned %d: %s", res.StatusCode, payload.Error.Message)
	}

	var text strings.Builder
	for _, block := range payload.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}

	price, ok := pricing[model]
	if !ok {
		price = pricing[defaultPricingKey]
	}
	cost := float64(payload.Usage.InputTokens)/1e6*price.in +
		float64(payload.Usage.OutputTokens)/1e6*price.out

	return &Response{
		Text: text.String(),
		Usage: Usage{
			InputTokens:  payload.Usage.InputTokens,
			OutputTokens: payload.Usage.OutputTokens,
			CostUSD:      cost,
		},
	}, nil
}

/* ----------------------------------------------------------------- mock -- */

// mockClient answers with an empty body and zero cost. The pipeline detects
// this and builds its draft from the seeded POI table instead of parsing model
// output, which is what makes STUB_PROVIDERS a complete, playable flow rather than
// a broken one.
type mockClient struct{}

func (m *mockClient) Complete(_ context.Context, _, _ string, _ []Message, _ int) (*Response, error) {
	return &Response{Text: "", Simulated: true}, nil
}
