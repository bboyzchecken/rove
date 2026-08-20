package domain

// Coverage answers the question the whole product is built around: "did my
// wish actually make it into the plan?" (DEV_SPEC M3 / A3.4).
type CoverageStatus string

const (
	CoverageCovered   CoverageStatus = "covered"
	CoveragePartial   CoverageStatus = "partial"
	CoverageUncovered CoverageStatus = "uncovered"
	CoverageNA        CoverageStatus = "na" // an 'avoid' wish with nothing to flag
)

// Wish kinds, mirroring models.Wish*.
const (
	KindMust  = "must"
	KindNice  = "nice"
	KindAvoid = "avoid"
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

// partialTagThreshold is the tag overlap at which we say "something like this
// is in the plan, but not exactly what you asked for".
const partialTagThreshold = 0.34

// ComputeCoverage matches every wish against the plan's items.
//
// Match strength, strongest first:
//  1. same poi_id            — unambiguous, always "covered"
//  2. similar title text     — the wish was free text and an item names it
//  3. tag overlap            — "ramen" wish, "Ichiran Shinjuku" item → partial
//
// 'avoid' wishes invert: a match is a CONFLICT, not coverage. They are reported
// as uncovered (with a note naming the offending items) so the board shows a
// red flag, and as 'na' when the plan respects them.
func ComputeCoverage(wishes []WishInput, items []PlanItemInput) []CoverageResult {
	out := make([]CoverageResult, 0, len(wishes))

	for _, w := range wishes {
		exact, partial := matchItems(w, items)

		if w.Kind == KindAvoid {
			if len(exact) > 0 || len(partial) > 0 {
				out = append(out, CoverageResult{
					WishlistItemID:  w.ID,
					Status:          CoverageUncovered,
					CoveredByItemID: append(exact, partial...),
					Note:            "แพลนมีรายการที่ขอเลี่ยงไว้",
				})
				continue
			}
			out = append(out, CoverageResult{
				WishlistItemID: w.ID,
				Status:         CoverageNA,
				Note:           "แพลนไม่มีรายการที่ขอเลี่ยง",
			})
			continue
		}

		switch {
		case len(exact) > 0:
			out = append(out, CoverageResult{
				WishlistItemID:  w.ID,
				Status:          CoverageCovered,
				CoveredByItemID: exact,
			})
		case len(partial) > 0:
			out = append(out, CoverageResult{
				WishlistItemID:  w.ID,
				Status:          CoveragePartial,
				CoveredByItemID: partial,
				Note:            "มีรายการใกล้เคียง แต่ไม่ตรงที่ขอไว้",
			})
		default:
			out = append(out, CoverageResult{
				WishlistItemID: w.ID,
				Status:         CoverageUncovered,
			})
		}
	}

	return out
}

// matchItems splits the plan's items into exact and partial matches for a wish.
func matchItems(w WishInput, items []PlanItemInput) (exact, partial []string) {
	for _, it := range items {
		switch {
		case w.POIID != "" && it.POIID != "" && w.POIID == it.POIID:
			exact = append(exact, it.ID)
		case TextSimilar(w.Text, it.Title):
			exact = append(exact, it.ID)
		case TagOverlap(w.Tags, it.Tags) >= partialTagThreshold:
			partial = append(partial, it.ID)
		}
	}
	return exact, partial
}

// CoverageStats summarises a board into the percentage shown on the Overview
// tab and used by the AI eval set (A4.12).
type CoverageStats struct {
	Total          int     `json:"total"`
	Covered        int     `json:"covered"`
	Partial        int     `json:"partial"`
	Uncovered      int     `json:"uncovered"`
	MustUncovered  int     `json:"must_uncovered"`
	CoveredPercent float64 `json:"covered_percent"`
}

// SummarizeCoverage weights a partial as half a covered wish. 'na' rows are
// excluded from the denominator — an avoided place was never something to cover.
func SummarizeCoverage(wishes []WishInput, results []CoverageResult) CoverageStats {
	kind := make(map[string]string, len(wishes))
	for _, w := range wishes {
		kind[w.ID] = w.Kind
	}

	var s CoverageStats
	for _, r := range results {
		if r.Status == CoverageNA {
			continue
		}
		s.Total++
		switch r.Status {
		case CoverageCovered:
			s.Covered++
		case CoveragePartial:
			s.Partial++
		case CoverageUncovered:
			s.Uncovered++
			if kind[r.WishlistItemID] == KindMust {
				s.MustUncovered++
			}
		}
	}
	if s.Total > 0 {
		s.CoveredPercent = (float64(s.Covered) + 0.5*float64(s.Partial)) / float64(s.Total) * 100
	}
	return s
}
