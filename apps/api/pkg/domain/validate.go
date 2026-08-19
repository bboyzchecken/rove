package domain

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

// ValidatePlan returns every issue found, ordered by day.
//
// TODO(A4.5): implement each rule above, one function per rule, each with its
// own table-driven test. repairPlan (A4.6) feeds these messages back to the
// model, so the wording matters.
func ValidatePlan(_ any) []Issue { return nil }
