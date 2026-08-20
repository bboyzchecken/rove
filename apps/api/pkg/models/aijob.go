package models

import (
	"context"
	"time"

	"gorm.io/datatypes"
)

// AI job kinds and statuses (DEV_SPEC M4 — A4.9).
const (
	AIKindDraft       = "draft"
	AIKindRefine      = "refine"
	AIKindRebalance   = "rebalance"
	AIKindDestination = "suggest_destination"
	AIKindTicket      = "parse_ticket"
	AIKindNormalize   = "normalize_wishlist"
)

const (
	AIQueued  = "queued"
	AIRunning = "running"
	AIDone    = "done"
	AIFailed  = "failed"
)

// AIJob is one run of the planner. Drafting takes tens of seconds, so it is a
// job with progress rather than a request that blocks — the browser subscribes
// to it over SSE.
type AIJob struct {
	Base
	TripID     string         `gorm:"type:char(36);not null;index" json:"trip_id"`
	UserID     string         `gorm:"type:char(36);not null" json:"user_id"`
	Kind       string         `gorm:"type:varchar(24);not null;default:'draft'" json:"kind"`
	Status     string         `gorm:"type:varchar(10);not null;default:'queued'" json:"status"`
	Progress   float64        `gorm:"type:decimal(4,3);not null;default:0" json:"progress"`
	Step       string         `gorm:"type:varchar(120)" json:"step"`
	Input      datatypes.JSON `gorm:"type:json" json:"input"`
	Result     datatypes.JSON `gorm:"type:json" json:"result"`
	Error      string         `gorm:"type:varchar(500)" json:"error"`
	// Cost accounting for the daily cap (A4.11).
	InputTokens  int     `gorm:"not null;default:0" json:"input_tokens"`
	OutputTokens int     `gorm:"not null;default:0" json:"output_tokens"`
	CostUSD      float64 `gorm:"type:decimal(10,5);not null;default:0" json:"cost_usd"`
	Simulated    bool    `gorm:"not null;default:false" json:"simulated"`
	FinishedAt   *time.Time `json:"finished_at"`
}

func (AIJob) TableName() string { return "ai_jobs" }

// DefaultIncludedDrafts is what every trip gets for free (§16).
const DefaultIncludedDrafts = 2

// AICredit is the per-trip draft meter (§16). `included` is granted on trip
// creation; `extra` is bought or paid for with points.
type AICredit struct {
	TripID   string `gorm:"type:char(36);primaryKey" json:"trip_id"`
	Included int    `gorm:"not null;default:2" json:"included"`
	Extra    int    `gorm:"not null;default:0" json:"extra"`
	Used     int    `gorm:"not null;default:0" json:"used"`
}

func (AICredit) TableName() string { return "ai_credits" }

type AIJobStore interface {
	Create(ctx context.Context, j *AIJob) error
	Get(ctx context.Context, tripID, jobID string) (*AIJob, error)
	Update(ctx context.Context, j *AIJob) error
	ListByTrip(ctx context.Context, tripID string, limit int) ([]AIJob, error)
	// CostSince powers the daily cap.
	CostSince(ctx context.Context, since time.Time) (float64, error)

	Credits(ctx context.Context, tripID string) (*AICredit, error)
	SaveCredits(ctx context.Context, c *AICredit) error
}
