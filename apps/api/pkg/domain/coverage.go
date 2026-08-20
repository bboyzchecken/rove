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

// CoverageSummary is the headline the Overview and the Wishlist tab share.
type CoverageSummary struct {
	Covered     int `json:"covered"`
	Partial     int `json:"partial"`
	Uncovered   int `json:"uncovered"`
	Total       int `json:"total"`
	MustCovered int `json:"must_covered"`
	MustTotal   int `json:"must_total"`
	Percent     int `json:"percent"`
}

// Matching thresholds. A tag overlap alone is weak evidence — "ของกิน" matches
// half the plan — so it only ever produces `partial`, never `covered`.
const (
	strongTagOverlap = 0.6
	weakTagOverlap   = 0.25
)

// ComputeCoverage matches wishes against plan items, best evidence first:
// the same POI, then a name match, then tag overlap.
//
// 'avoid' inverts: an item that matches it is a conflict the group needs to see,
// not coverage. It is reported as `partial` with a note rather than as a silent
// pass, because "you said no theme parks and the plan has one" is exactly the
// kind of thing this board exists to surface.
func ComputeCoverage(wishes []WishInput, items []PlanItemInput) []CoverageResult {
	out := make([]CoverageResult, 0, len(wishes))

	for _, w := range wishes {
		result := CoverageResult{WishlistItemID: w.ID, Status: CoverageUncovered}
		wishName := NormalizeName(w.Text)

		var (
			exact   []string
			partial []string
		)

		for _, item := range items {
			switch {
			case w.POIID != "" && item.POIID != "" && w.POIID == item.POIID:
				exact = append(exact, item.ID)

			case wishName != "" && namesMatch(wishName, NormalizeName(item.Title)):
				exact = append(exact, item.ID)

			case TagOverlap(w.Tags, item.Tags) >= strongTagOverlap:
				exact = append(exact, item.ID)

			case TagOverlap(w.Tags, item.Tags) >= weakTagOverlap:
				partial = append(partial, item.ID)
			}
		}

		if w.Kind == "avoid" {
			if len(exact) > 0 || len(partial) > 0 {
				result.Status = CoveragePartial
				result.CoveredByItemID = append(exact, partial...)
				result.Note = "แพลนมีสิ่งที่บอกว่าไม่เอา — ลองดูอีกที"
			} else {
				result.Status = CoverageNA
			}
			out = append(out, result)
			continue
		}

		switch {
		case len(exact) > 0:
			result.Status = CoverageCovered
			result.CoveredByItemID = exact
		case len(partial) > 0:
			result.Status = CoveragePartial
			result.CoveredByItemID = partial
			result.Note = "มีของคล้ายกันในแพลน แต่ยังไม่ตรงเป๊ะ"
		}

		out = append(out, result)
	}

	return out
}

// SummariseCoverage counts the results the way both tabs display them. An
// 'avoid' wish with nothing to conflict with is not "covered" — it is simply
// not applicable, so it stays out of the percentage entirely.
func SummariseCoverage(wishes []WishInput, results []CoverageResult) CoverageSummary {
	kind := make(map[string]string, len(wishes))
	for _, w := range wishes {
		kind[w.ID] = w.Kind
	}

	summary := CoverageSummary{}
	for _, r := range results {
		if kind[r.WishlistItemID] == "must" {
			summary.MustTotal++
			if r.Status == CoverageCovered {
				summary.MustCovered++
			}
		}
		if r.Status == CoverageNA {
			continue
		}
		summary.Total++
		switch r.Status {
		case CoverageCovered:
			summary.Covered++
		case CoveragePartial:
			summary.Partial++
		default:
			summary.Uncovered++
		}
	}

	if summary.Total > 0 {
		summary.Percent = int(roundHalfUp(float64(summary.Covered) / float64(summary.Total) * 100))
	}
	return summary
}

// namesMatch is deliberately loose in one direction only: "ฟุชิมิอินาริ" should
// match "ศาลเจ้าฟุชิมิอินาริ", but two unrelated names sharing a common word
// should not.
func namesMatch(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	if a == b {
		return true
	}
	if len(a) >= 6 && contains(b, a) {
		return true
	}
	if len(b) >= 6 && contains(a, b) {
		return true
	}
	return false
}

func contains(haystack, needle string) bool {
	if len(needle) > len(haystack) {
		return false
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
