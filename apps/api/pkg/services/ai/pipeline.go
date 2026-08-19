package ai

import "context"

// Pipeline is the ordered set of steps that turns a trip + wishlists into a
// persisted plan. Each step is separately testable and separately retryable.
//
//	normalize   wishlist text -> tags + poi_id
//	buildFrame  anchors: flights, prepaid stays, dated must-dos, zone per day
//	generate    -> PlanDraft (schemas.go)
//	validate    pkg/domain.ValidatePlan — pure, no model involved
//	repair      feed issues back to the model, at most 2 loops
//	explain     -> rationales + open questions
//	persist     one DB transaction + item_versions
//
// TODO(A4.3 - A4.8): implement step by step; do not collapse them into one
// prompt — the whole point is that validation is deterministic Go code.
type Pipeline interface {
	Generate(ctx context.Context, tripID string, hints string) (jobID string, err error)
	Refine(ctx context.Context, planID string, instruction string) (jobID string, err error)
}
