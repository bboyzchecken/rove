package domain

import "fmt"

// Plan variants (M6). A variant is a full itinerary snapshot the group can
// compare against the live plan before adopting one. The maths that makes two
// variants comparable lives here so the API, the mock repo and the compare
// screen agree on every number (A6.3).

// VariantItemInput is one stop of one candidate itinerary, flattened.
type VariantItemInput struct {
	ID        string
	DayIndex  int
	Title     string
	POIID     string
	Zone      string
	StartTime string
	EndTime   string
	OpenHours string
	CostJPY   float64
	TravelMin int
}

// VariantMetrics is the row of numbers the compare table renders per variant.
type VariantMetrics struct {
	DayCount        int     `json:"day_count"`
	ItemCount       int     `json:"item_count"`
	TotalCostJPY    float64 `json:"total_cost_jpy"`
	PerPersonTHB    float64 `json:"per_person_thb"`
	TravelMinutes   int     `json:"travel_minutes"`
	CoveragePercent int     `json:"coverage_percent"`
	MustCovered     int     `json:"must_covered"`
	MustTotal       int     `json:"must_total"`
	WarningCount    int     `json:"warning_count"`
}

// ComputeVariantMetrics derives every comparable number from an itinerary.
//
// Costs are treated as per-person (the shape AI drafts use), so per-person THB
// is the cost sum converted — and the group total is per-person × party size.
// Coverage and warnings reuse the same domain checks the live plan runs; a
// variant is never scored by softer rules than the plan it wants to replace.
func ComputeVariantMetrics(
	items []VariantItemInput,
	wishes []WishInput,
	partySize int,
	fxRate float64,
) VariantMetrics {
	m := VariantMetrics{}

	days := map[int]bool{}
	planInputs := make([]PlanItemInput, 0, len(items))
	validateInputs := make([]ValidateItem, 0, len(items))

	for _, item := range items {
		days[item.DayIndex] = true
		m.ItemCount++
		m.TotalCostJPY += item.CostJPY
		m.TravelMinutes += item.TravelMin

		planInputs = append(planInputs, PlanItemInput{
			ID:    item.ID,
			Title: item.Title,
			POIID: item.POIID,
		})
		validateInputs = append(validateInputs, ValidateItem{
			ID:        item.ID,
			DayIndex:  item.DayIndex,
			Title:     item.Title,
			StartTime: item.StartTime,
			EndTime:   item.EndTime,
			OpenHours: item.OpenHours,
			TravelMin: item.TravelMin,
			POIID:     item.POIID,
			Zone:      item.Zone,
		})
	}
	m.DayCount = len(days)
	m.PerPersonTHB = ToHomeCurrency(m.TotalCostJPY, fxRate)

	musts := make([]string, 0)
	for _, w := range wishes {
		if w.Kind == "must" {
			musts = append(musts, w.Text)
		}
	}
	m.WarningCount = len(ValidatePlan(ValidateInput{Items: validateInputs, MustWishes: musts}))

	results := ComputeCoverage(wishes, planInputs)
	summary := SummariseCoverage(wishes, results)
	m.CoveragePercent = summary.Percent
	m.MustCovered = summary.MustCovered
	m.MustTotal = summary.MustTotal

	return m
}

/* ---------------------------------------------------- conflicts (A6.5) ---- */

// ConflictProfile is one member's saved trip profile, plus the name the
// message quotes.
type ConflictProfile struct {
	UserID       string
	Name         string
	Pace         string
	WalkLevel    int
	BudgetMinTHB int
	BudgetMaxTHB int
}

// ConflictWish is one wish with its owner's name attached.
type ConflictWish struct {
	Kind      string
	Text      string
	OwnerName string
}

type Conflict struct {
	Kind     string `json:"kind"`     // pace | budget | wish
	Severity string `json:"severity"` // error | warning
	Message  string `json:"message"`
}

// DetectConflicts runs before a draft is generated (A6.5): the model cannot
// satisfy a group that disagrees with itself, so the disagreement is surfaced
// to the humans first.
func DetectConflicts(profiles []ConflictProfile, wishes []ConflictWish) []Conflict {
	conflicts := make([]Conflict, 0)

	// 1. Pace — a relaxed member and a packed member in one room is the single
	// most common reason a draft gets rejected by half the group.
	var relaxed, packed []string
	for _, p := range profiles {
		switch p.Pace {
		case "relaxed":
			relaxed = append(relaxed, p.Name)
		case "packed":
			packed = append(packed, p.Name)
		}
	}
	if len(relaxed) > 0 && len(packed) > 0 {
		conflicts = append(conflicts, Conflict{
			Kind:     "pace",
			Severity: "warning",
			Message: fmt.Sprintf("%s อยากเที่ยวชิลๆ แต่ %s อยากจัดเต็ม — แพลนกลางๆ อาจไม่ถูกใจทั้งคู่ ลองคุยกันก่อน หรือร่างสองแบบมาเทียบ",
				joinNames(relaxed), joinNames(packed)),
		})
	}

	// 2. Budget — ranges that never overlap mean someone pays for a trip they
	// did not agree to, whichever way the plan goes.
	maxOfMins, minOfMaxes := 0, 0
	var minName, maxName string
	for _, p := range profiles {
		if p.BudgetMaxTHB <= 0 {
			continue // unfilled range says nothing
		}
		if p.BudgetMinTHB > maxOfMins {
			maxOfMins = p.BudgetMinTHB
			minName = p.Name
		}
		if minOfMaxes == 0 || p.BudgetMaxTHB < minOfMaxes {
			minOfMaxes = p.BudgetMaxTHB
			maxName = p.Name
		}
	}
	if minOfMaxes > 0 && maxOfMins > minOfMaxes {
		conflicts = append(conflicts, Conflict{
			Kind:     "budget",
			Severity: "error",
			Message: fmt.Sprintf("งบไม่ทับกันเลย — %s ตั้งต้นที่ %s บาท แต่ %s ไปได้สุดแค่ %s บาท ต้องตกลงงบกลางก่อนร่าง",
				minName, formatTHB(maxOfMins), maxName, formatTHB(minOfMaxes)),
		})
	}

	// 3. Wishes — one member's must-do that another member listed as avoid.
	avoids := map[string]ConflictWish{}
	for _, w := range wishes {
		if w.Kind == "avoid" {
			avoids[NormalizeName(w.Text)] = w
		}
	}
	for _, w := range wishes {
		if w.Kind != "must" {
			continue
		}
		normalised := NormalizeName(w.Text)
		for avoidKey, avoid := range avoids {
			if namesMatch(normalised, avoidKey) {
				conflicts = append(conflicts, Conflict{
					Kind:     "wish",
					Severity: "error",
					Message: fmt.Sprintf("\"%s\" เป็นสิ่งที่%sต้องไป แต่%sไม่อยากไป — ต้องเคลียร์กันเองก่อน AI ตัดสินให้ไม่ได้",
						w.Text, w.OwnerName, avoid.OwnerName),
				})
				break
			}
		}
	}

	return conflicts
}

func joinNames(names []string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	default:
		out := names[0]
		for _, n := range names[1:] {
			out += ", " + n
		}
		return out
	}
}

func formatTHB(amount int) string {
	// 45000 → "45,000" without pulling in a locale package.
	s := fmt.Sprintf("%d", amount)
	if len(s) <= 3 {
		return s
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out)
}
