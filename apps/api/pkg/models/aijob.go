package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// AI job kinds.
const (
	JobGenerate    = "generate"
	JobRefine      = "refine"
	JobExplain     = "explain"
	JobNormalize   = "normalize"
	JobParseTicket = "parse_ticket"
	JobExport      = "export"
)

// AI job status.
const (
	JobQueued  = "queued"
	JobRunning = "running"
	JobDone    = "done"
	JobError   = "error"
)

// AIJob is both the queue record and the audit trail: every model call writes
// its tokens and USD cost here, which is what the daily cost cap reads (A4.11).
type AIJob struct {
	Base
	TripID     string         `gorm:"type:char(36);index" json:"trip_id"`
	PlanID     *string        `gorm:"type:char(36)" json:"plan_id"`
	UserID     string         `gorm:"type:char(36)" json:"user_id"`
	Kind       string         `gorm:"type:varchar(20);not null" json:"kind"`
	Status     string         `gorm:"type:varchar(20);not null;default:'queued'" json:"status"`
	Step       string         `gorm:"type:varchar(40)" json:"step"`
	Input      datatypes.JSON `gorm:"type:json" json:"input"`
	Output     datatypes.JSON `gorm:"type:json" json:"output"`
	Error      string         `gorm:"type:text" json:"error"`
	TokensIn   int            `gorm:"not null;default:0" json:"tokens_in"`
	TokensOut  int            `gorm:"not null;default:0" json:"tokens_out"`
	CostUSD    float64        `gorm:"type:decimal(10,4);not null;default:0" json:"cost_usd"`
	FinishedAt *time.Time     `json:"finished_at"`
}

func (AIJob) TableName() string { return "ai_jobs" }

type AIJobStore interface {
	Create(ctx context.Context, j *AIJob) error
	Get(ctx context.Context, id string) (*AIJob, error)
	Update(ctx context.Context, j *AIJob) error
	SetStep(ctx context.Context, id, step string) error
	Fail(ctx context.Context, id, message string) error
	// CostSince backs the per-trip daily cost cap.
	CostSince(ctx context.Context, tripID string, since time.Time) (float64, error)
	CountSince(ctx context.Context, tripID string, since time.Time) (int64, error)
	TotalCostSince(ctx context.Context, since time.Time) (float64, error)
}
