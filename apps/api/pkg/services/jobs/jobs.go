// Package jobs is the background worker: a Redis list used as a queue plus a
// goroutine pool. Phase 1 runs it inside the API process; it becomes a separate
// binary when load justifies it (DEV_SPEC §2.2).
package jobs

import "context"

type Kind string

const (
	KindGenerate    Kind = "generate"
	KindRefine      Kind = "refine"
	KindExplain     Kind = "explain"
	KindNormalize   Kind = "normalize"
	KindParseTicket Kind = "parse_ticket"
	KindExport      Kind = "export"
)

type Job struct {
	ID     string
	Kind   Kind
	TripID string
	PlanID string
	Input  []byte
}

type Queue interface {
	Enqueue(ctx context.Context, j Job) error
	Dequeue(ctx context.Context) (*Job, error)
}

type Handler func(ctx context.Context, j Job) error

// TODO(A4.9): implement Queue over Redis BLPOP and a Pool that runs N workers,
// updating the ai_jobs row and publishing ai.progress events as it goes.
