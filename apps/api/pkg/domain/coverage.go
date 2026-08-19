package domain

// Coverage answers the question the whole product is built around: "did my
// wish actually make it into the plan?" (DEV_SPEC M3 / A3.4).
type CoverageStatus string

const (
	CoverageCovered   CoverageStatus = "covered"
	CoveragePartial   CoverageStatus = "partial"
	CoverageUncovered CoverageStatus = "uncovered"
	CoverageNA        CoverageStatus = "na" // e.g. an 'avoid' wish, nothing to cover
)

// WishInput is one wishlist row, flattened for the pure calculation.
type WishInput struct {
	ID    string
	Kind  string // must | nice | avoid
	Text  string
	Tags  []string
	POIID string
}

// PlanItemInput is one itinerary item, flattened the same way.
type PlanItemInput struct {
	ID    string
	Title string
	Tags  []string
	POIID string
}

// CoverageResult is what the Coverage Board renders.
type CoverageResult struct {
	WishlistItemID  string
	Status          CoverageStatus
	CoveredByItemID []string
	Note            string
}

// ComputeCoverage matches wishes against plan items.
//
// TODO(A3.4): implement — match on poi_id first, then tag overlap, then a
// normalised text match. 'avoid' wishes invert: an item that matches them is a
// conflict, not coverage. Write the table-driven tests alongside this.
func ComputeCoverage(wishes []WishInput, items []PlanItemInput) []CoverageResult {
	out := make([]CoverageResult, 0, len(wishes))
	for _, w := range wishes {
		out = append(out, CoverageResult{WishlistItemID: w.ID, Status: CoverageUncovered})
	}
	return out
}
