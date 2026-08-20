package domain

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Plan validation catches the mistakes an LLM reliably makes. Every rule here
// runs on the persisted plan, not on the model output, so a hand-edited plan is
// checked the same way (DEV_SPEC §6.3 / A4.5).

type IssueSeverity string

const (
	SeverityError   IssueSeverity = "error"
	SeverityWarning IssueSeverity = "warning"
)

type Issue struct {
	Code     string        `json:"code"`
	Severity IssueSeverity `json:"severity"`
	Message  string        `json:"message"`
	DayIndex *int          `json:"day_index,omitempty"`
	ItemID   string        `json:"item_id,omitempty"`
}

// Issue codes — keep in sync with the frontend warning strings.
const (
	IssueClosedDay         = "closed_day"         // POI is shut that weekday
	IssueOutsideHours      = "outside_hours"      // visit falls outside opening hours
	IssueDayTooLong        = "day_too_long"       // exceeds the member's pace setting
	IssueTravelUnrealistic = "travel_unrealistic" // travel_min below the real distance
	IssueMustDoMissing     = "must_do_missing"    // a 'must' wish never made it in
	IssueDuplicatePOI      = "duplicate_poi"      // same POI twice in one plan
	IssueZoneHop           = "zone_hop"           // day crosses non-neighbouring zones
)

// ValidationItem is one itinerary item with everything the rules need.
type ValidationItem struct {
	ID        string
	Title     string
	POIID     string
	StartTime string // "HH:MM" in Asia/Tokyo
	EndTime   string
	TravelMin int
	// TravelMinRealistic is the distance-service answer for the hop into this
	// item. Zero means "we never looked it up" and the rule is skipped.
	TravelMinRealistic int
	Zone               string
}

// ValidationDay is one day of the plan.
type ValidationDay struct {
	Index int
	Date  time.Time
	Items []ValidationItem
}

// POIFacts is the subset of a POI the rules consult. It always comes from our
// catalogue or a tool call — never from the model (DEV_SPEC §6.3).
type POIFacts struct {
	ID   string
	Name string
	// ClosedDays are lowercase English weekday names: "monday", "tuesday", ...
	ClosedDays []string
	// OpenHours maps a weekday to "HH:MM-HH:MM". An absent day means unknown,
	// which is not the same as closed.
	OpenHours map[string]string
	Zone      string
}

// ValidationInput is everything ValidatePlan needs, with no DB access.
type ValidationInput struct {
	Days   []ValidationDay
	POIs   map[string]POIFacts
	Wishes []WishInput
	// MaxItemsPerDay comes from the strictest member profile's pace.
	MaxItemsPerDay int
	// TravelSlackMin is how far below the real travel time a plan may claim
	// before it is called unrealistic.
	TravelSlackMin int
}

// DefaultTravelSlackMin allows for the model rounding a 23-minute hop to 20.
const DefaultTravelSlackMin = 10

// ValidatePlan returns every issue found, ordered by day then by rule.
func ValidatePlan(in ValidationInput) []Issue {
	issues := []Issue{}
	issues = append(issues, checkDays(in)...)
	issues = append(issues, checkDuplicatePOIs(in)...)
	issues = append(issues, checkMustDos(in)...)
	return issues
}

func checkDays(in ValidationInput) []Issue {
	issues := []Issue{}
	maxItems := in.MaxItemsPerDay
	slack := in.TravelSlackMin
	if slack <= 0 {
		slack = DefaultTravelSlackMin
	}

	for _, day := range in.Days {
		dayIdx := day.Index

		if maxItems > 0 && len(day.Items) > maxItems {
			issues = append(issues, Issue{
				Code:     IssueDayTooLong,
				Severity: SeverityWarning,
				Message: fmt.Sprintf("วันที่ %d มี %d รายการ เกินจังหวะที่ตั้งไว้ (%d)",
					dayIdx+1, len(day.Items), maxItems),
				DayIndex: intPtr(dayIdx),
			})
		}

		issues = append(issues, checkDayZones(day)...)

		for _, it := range day.Items {
			if it.TravelMinRealistic > 0 && it.TravelMin > 0 &&
				it.TravelMin+slack < it.TravelMinRealistic {
				issues = append(issues, Issue{
					Code:     IssueTravelUnrealistic,
					Severity: SeverityWarning,
					Message: fmt.Sprintf("%s: เผื่อเวลาเดินทาง %d นาที แต่จริง ๆ ราว %d นาที",
						it.Title, it.TravelMin, it.TravelMinRealistic),
					DayIndex: intPtr(dayIdx),
					ItemID:   it.ID,
				})
			}

			poi, ok := in.POIs[it.POIID]
			if !ok || it.POIID == "" {
				continue
			}
			if iss, bad := checkClosedDay(poi, it, day); bad {
				issues = append(issues, iss)
				// A closed day makes the opening-hours check meaningless.
				continue
			}
			if iss, bad := checkOpenHours(poi, it, day); bad {
				issues = append(issues, iss)
			}
		}
	}
	return issues
}

// checkDayZones flags a day that hops between zones which cannot reasonably
// share a day (e.g. Fuji in the morning, Kamakura in the afternoon).
func checkDayZones(day ValidationDay) []Issue {
	issues := []Issue{}
	prev := ""
	for _, it := range day.Items {
		if it.Zone == "" {
			continue
		}
		if prev != "" && !CanShareDay(prev, it.Zone) {
			issues = append(issues, Issue{
				Code:     IssueZoneHop,
				Severity: SeverityWarning,
				Message: fmt.Sprintf("วันที่ %d ข้ามโซน %s → %s ในวันเดียว",
					day.Index+1, prev, it.Zone),
				DayIndex: intPtr(day.Index),
				ItemID:   it.ID,
			})
		}
		prev = it.Zone
	}
	return issues
}

func checkClosedDay(poi POIFacts, it ValidationItem, day ValidationDay) (Issue, bool) {
	weekday := strings.ToLower(day.Date.Weekday().String())
	for _, d := range poi.ClosedDays {
		if strings.ToLower(strings.TrimSpace(d)) != weekday {
			continue
		}
		return Issue{
			Code:     IssueClosedDay,
			Severity: SeverityError,
			Message: fmt.Sprintf("%s ปิดทุกวัน%s — วันที่ %d ตรงกับวันปิด",
				poi.Name, weekday, day.Index+1),
			DayIndex: intPtr(day.Index),
			ItemID:   it.ID,
		}, true
	}
	return Issue{}, false
}

func checkOpenHours(poi POIFacts, it ValidationItem, day ValidationDay) (Issue, bool) {
	if it.StartTime == "" || len(poi.OpenHours) == 0 {
		return Issue{}, false
	}
	weekday := strings.ToLower(day.Date.Weekday().String())
	window, ok := poi.OpenHours[weekday]
	if !ok {
		return Issue{}, false // unknown hours are not a violation
	}

	openMin, closeMin, ok := parseWindow(window)
	if !ok {
		return Issue{}, false
	}
	start, ok := parseHHMM(it.StartTime)
	if !ok {
		return Issue{}, false
	}
	// The end of the visit matters as much as the start; fall back to the start
	// when the item has no end time.
	end := start
	if e, ok := parseHHMM(it.EndTime); ok {
		end = e
	}

	if start >= openMin && end <= closeMin {
		return Issue{}, false
	}
	return Issue{
		Code:     IssueOutsideHours,
		Severity: SeverityWarning,
		Message: fmt.Sprintf("%s เปิด %s แต่แพลนไว้ %s–%s",
			poi.Name, window, it.StartTime, it.EndTime),
		DayIndex: intPtr(day.Index),
		ItemID:   it.ID,
	}, true
}

func checkDuplicatePOIs(in ValidationInput) []Issue {
	issues := []Issue{}
	seen := map[string]bool{}

	for _, day := range in.Days {
		for _, it := range day.Items {
			if it.POIID == "" {
				continue
			}
			if seen[it.POIID] {
				name := it.Title
				if p, ok := in.POIs[it.POIID]; ok && p.Name != "" {
					name = p.Name
				}
				issues = append(issues, Issue{
					Code:     IssueDuplicatePOI,
					Severity: SeverityWarning,
					Message:  fmt.Sprintf("%s ถูกใส่ไว้มากกว่าหนึ่งครั้ง", name),
					DayIndex: intPtr(day.Index),
					ItemID:   it.ID,
				})
				continue
			}
			seen[it.POIID] = true
		}
	}
	return issues
}

// checkMustDos is the rule that matters most to the group: a 'must' wish that
// silently vanished from the plan.
func checkMustDos(in ValidationInput) []Issue {
	if len(in.Wishes) == 0 {
		return []Issue{}
	}

	planItems := []PlanItemInput{}
	for _, day := range in.Days {
		for _, it := range day.Items {
			planItems = append(planItems, PlanItemInput{
				ID: it.ID, Title: it.Title, POIID: it.POIID,
			})
		}
	}

	results := ComputeCoverage(in.Wishes, planItems)
	byWish := make(map[string]CoverageStatus, len(results))
	for _, r := range results {
		byWish[r.WishlistItemID] = r.Status
	}

	issues := []Issue{}
	for _, w := range in.Wishes {
		if w.Kind != KindMust {
			continue
		}
		if byWish[w.ID] == CoverageUncovered {
			issues = append(issues, Issue{
				Code:     IssueMustDoMissing,
				Severity: SeverityError,
				Message:  fmt.Sprintf("รายการที่ต้องไปให้ได้ยังไม่อยู่ในแพลน: %s", w.Text),
			})
		}
	}
	return issues
}

// parseHHMM turns "09:30" into minutes since midnight.
func parseHHMM(s string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, false
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 47 {
		return 0, false
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// parseWindow turns "09:00-17:00" into open and close minutes. A window that
// crosses midnight ("18:00-02:00") is normalised by pushing the close past 24h.
func parseWindow(s string) (open, close int, ok bool) {
	parts := strings.Split(strings.TrimSpace(s), "-")
	if len(parts) != 2 {
		return 0, 0, false
	}
	open, ok = parseHHMM(parts[0])
	if !ok {
		return 0, 0, false
	}
	close, ok = parseHHMM(parts[1])
	if !ok {
		return 0, 0, false
	}
	if close < open {
		close += 24 * 60
	}
	return open, close, true
}

func intPtr(i int) *int { return &i }

// HasErrors reports whether repairPlan (A4.6) should run another loop.
func HasErrors(issues []Issue) bool {
	for _, i := range issues {
		if i.Severity == SeverityError {
			return true
		}
	}
	return false
}

// Pace budgets: how many items a day may hold before it is called overstuffed.
// Owned here rather than in pkg/models so the rule and its tests stay pure.
const (
	MaxChillItems  = 4
	MaxNormalItems = 6
	MaxPackedItems = 9
)
