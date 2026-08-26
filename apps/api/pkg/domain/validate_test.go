package domain

import "testing"

// A4.5 — every rule in ValidatePlan, exercised one at a time. Each case builds
// the smallest plan that can trip the rule, so a failure names the rule and not
// a pile of interacting inputs.

func findIssue(issues []Issue, code string) *Issue {
	for i := range issues {
		if issues[i].Code == code {
			return &issues[i]
		}
	}
	return nil
}

func TestValidatePlanEmptyPlanHasNoIssues(t *testing.T) {
	if got := ValidatePlan(ValidateInput{}); len(got) != 0 {
		t.Fatalf("empty plan = %d issues, want none", len(got))
	}
	// A must-wish against an empty item list is also silent: the plan does not
	// exist yet, so there is nothing to warn about.
	if got := ValidatePlan(ValidateInput{MustWishes: []string{"Disneyland"}}); len(got) != 0 {
		t.Fatalf("must-wish with no items = %d issues, want none", len(got))
	}
}

func TestValidatePlanTravelUnrealistic(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		// Leaves at 10:00, needs 60 minutes, but the next stop starts 10:30.
		{ID: "a", DayIndex: 1, Title: "Sensoji", StartTime: "09:00", EndTime: "10:00", TravelMin: 60},
		{ID: "b", DayIndex: 1, Title: "Skytree", StartTime: "10:30"},
	}})

	issue := findIssue(issues, IssueTravelUnrealistic)
	if issue == nil {
		t.Fatal("want travel_unrealistic issue")
	}
	if issue.ItemID != "b" {
		t.Errorf("issue lands on %q, want the stop that cannot be reached", issue.ItemID)
	}
	if issue.DayIndex == nil || *issue.DayIndex != 1 {
		t.Errorf("day index = %v, want 1", issue.DayIndex)
	}
}

func TestValidatePlanTravelUsesStartWhenEndMissing(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		// No EndTime: the check falls back to StartTime, so 09:00 + 30 = 09:30
		// which is still before 10:00 — no issue.
		{ID: "a", DayIndex: 1, Title: "Sensoji", StartTime: "09:00", TravelMin: 30},
		{ID: "b", DayIndex: 1, Title: "Skytree", StartTime: "10:00"},
	}})
	if findIssue(issues, IssueTravelUnrealistic) != nil {
		t.Fatal("reachable stop flagged as unreachable")
	}
}

func TestValidatePlanOutsideHours(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "early", DayIndex: 1, Title: "พิพิธภัณฑ์", StartTime: "07:00", OpenHours: "09:00–16:00"},
		{ID: "late", DayIndex: 2, Title: "ตลาด", StartTime: "17:00", OpenHours: "06:00-14:00"},
	}})

	early := findIssue(issues, IssueOutsideHours)
	if early == nil || early.ItemID != "early" {
		t.Fatalf("visit before opening not flagged: %+v", issues)
	}

	var late *Issue
	for i := range issues {
		if issues[i].Code == IssueOutsideHours && issues[i].ItemID == "late" {
			late = &issues[i]
		}
	}
	if late == nil {
		t.Fatalf("visit after closing not flagged: %+v", issues)
	}
}

func TestValidatePlanFreeTextHoursAreNotAConstraint(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "คอมบินิ", StartTime: "03:00", OpenHours: "เปิด 24 ชม."},
	}})
	if findIssue(issues, IssueOutsideHours) != nil {
		t.Fatal("unparseable hours produced a false warning")
	}
}

func TestValidatePlanDuplicatePOI(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "Sensoji", StartTime: "09:00", POIID: "poi-1"},
		{ID: "b", DayIndex: 3, Title: "Sensoji อีกรอบ", StartTime: "09:00", POIID: "poi-1"},
		// No POI id on either side never counts as a duplicate.
		{ID: "c", DayIndex: 1, Title: "เดินเล่น", StartTime: "11:00"},
		{ID: "d", DayIndex: 2, Title: "เดินเล่น", StartTime: "11:00"},
	}})

	issue := findIssue(issues, IssueDuplicatePOI)
	if issue == nil {
		t.Fatal("same POI twice not flagged")
	}
	if issue.ItemID != "b" {
		t.Errorf("issue lands on %q, want the second visit", issue.ItemID)
	}
	count := 0
	for _, i := range issues {
		if i.Code == IssueDuplicatePOI {
			count++
		}
	}
	if count != 1 {
		t.Errorf("%d duplicate issues, want exactly 1", count)
	}
}

func TestValidatePlanDayTooLong(t *testing.T) {
	long := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "เริ่ม", StartTime: "07:00"},
		{ID: "b", DayIndex: 1, Title: "จบ", StartTime: "21:00", EndTime: "22:00"},
	}})
	if findIssue(long, IssueDayTooLong) == nil {
		t.Fatal("15-hour day not flagged against the 12-hour default")
	}

	// A custom pace stretches the limit.
	relaxed := ValidatePlan(ValidateInput{
		MaxDayMinutes: 16 * 60,
		Items: []ValidateItem{
			{ID: "a", DayIndex: 1, Title: "เริ่ม", StartTime: "07:00"},
			{ID: "b", DayIndex: 1, Title: "จบ", StartTime: "21:00", EndTime: "22:00"},
		},
	})
	if findIssue(relaxed, IssueDayTooLong) != nil {
		t.Fatal("day within a custom MaxDayMinutes still flagged")
	}

	// A single stop is never "a long day", whatever its times say.
	single := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "ทั้งวัน", StartTime: "06:00", EndTime: "23:00"},
	}})
	if findIssue(single, IssueDayTooLong) != nil {
		t.Fatal("single-item day flagged as too long")
	}
}

func TestValidatePlanZoneHop(t *testing.T) {
	issues := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "หนึ่ง", StartTime: "09:00", Zone: "tokyo_east"},
		{ID: "b", DayIndex: 1, Title: "สอง", StartTime: "11:00", Zone: "tokyo_west"},
		{ID: "c", DayIndex: 1, Title: "สาม", StartTime: "13:00", Zone: "yokohama"},
	}})
	if findIssue(issues, IssueZoneHop) == nil {
		t.Fatal("three zones in one day not flagged")
	}

	twoZones := ValidatePlan(ValidateInput{Items: []ValidateItem{
		{ID: "a", DayIndex: 1, Title: "หนึ่ง", StartTime: "09:00", Zone: "tokyo_east"},
		{ID: "b", DayIndex: 1, Title: "สอง", StartTime: "11:00", Zone: "tokyo_west"},
	}})
	if findIssue(twoZones, IssueZoneHop) != nil {
		t.Fatal("two zones is a normal day, not a zig-zag")
	}
}

func TestValidatePlanMustDoMissingIsAnError(t *testing.T) {
	issues := ValidatePlan(ValidateInput{
		Items: []ValidateItem{
			{ID: "a", DayIndex: 1, Title: "Shibuya Sky", StartTime: "09:00"},
		},
		MustWishes: []string{"Shibuya Sky", "DisneySea"},
	})

	issue := findIssue(issues, IssueMustDoMissing)
	if issue == nil {
		t.Fatal("dropped must-wish not reported")
	}
	if issue.Severity != SeverityError {
		t.Errorf("severity = %q — a dropped must-do is the one thing that blocks", issue.Severity)
	}
	// The satisfied wish is matched by name, spacing and case ignored.
	for _, i := range issues {
		if i.Code == IssueMustDoMissing && i.Message != issue.Message {
			t.Errorf("satisfied wish also reported: %q", i.Message)
		}
	}
}

func TestWarningsByItemFirstIssueWins(t *testing.T) {
	day := 1
	warnings := WarningsByItem([]Issue{
		{Code: IssueOutsideHours, ItemID: "a", Message: "ยังไม่เปิด"},
		{Code: IssueDuplicatePOI, ItemID: "a", Message: "ซ้ำ"},
		{Code: IssueDayTooLong, DayIndex: &day, Message: "วันยาว"}, // no item — day-level
	})

	if warnings["a"] != "ยังไม่เปิด" {
		t.Errorf("warnings[a] = %q, want the first issue", warnings["a"])
	}
	if len(warnings) != 1 {
		t.Errorf("%d warnings, want 1 — day-level issues have no card to land on", len(warnings))
	}
}

/* ----------------------------------------------------------------- time -- */

func TestParseClock(t *testing.T) {
	if v, ok := parseClock("09:30"); !ok || v != 9*60+30 {
		t.Errorf("parseClock(09:30) = %d, %v", v, ok)
	}
	for _, bad := range []string{"", "9", "25:00", "12:60", "ao:oo", "12.30"} {
		if _, ok := parseClock(bad); ok {
			t.Errorf("parseClock(%q) accepted", bad)
		}
	}
}

func TestAddMinutesWrapsPastMidnight(t *testing.T) {
	if got, _ := addMinutes("23:30", 45); got != "00:15" {
		t.Errorf("23:30 + 45m = %q, want 00:15", got)
	}
	if got, _ := addMinutes("10:00", 0); got != "10:00" {
		t.Errorf("10:00 + 0m = %q", got)
	}
}

func TestMinutesBetweenRunsPastMidnight(t *testing.T) {
	if got, _ := minutesBetween("22:00", "01:00"); got != 180 {
		t.Errorf("22:00→01:00 = %d, want 180", got)
	}
	if got, _ := minutesBetween("09:00", "17:30"); got != 510 {
		t.Errorf("09:00→17:30 = %d, want 510", got)
	}
}

func TestParseHoursAcceptsEveryDash(t *testing.T) {
	for _, s := range []string{"09:00–16:00", "09:00-16:00", "09:00—16:00", " 09:00 – 16:00 "} {
		open, close, ok := parseHours(s)
		if !ok || open != "09:00" || close != "16:00" {
			t.Errorf("parseHours(%q) = %q, %q, %v", s, open, close, ok)
		}
	}
	for _, s := range []string{"เปิด 24 ชม.", "ตลอดวัน", "", "09:00"} {
		if _, _, ok := parseHours(s); ok {
			t.Errorf("parseHours(%q) pretended to understand", s)
		}
	}
}
