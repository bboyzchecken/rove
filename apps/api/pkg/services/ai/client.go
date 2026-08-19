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

import "context"

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
}

// Client is the thin Anthropic wrapper. Kept as an interface so the pipeline
// can be tested with a recorded response.
type Client interface {
	Complete(ctx context.Context, model string, system string, msgs []Message, maxTokens int) (*Response, error)
}

// TODO(A4.1): implement with retry, timeout and token accounting.
