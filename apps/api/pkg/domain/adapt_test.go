package domain

import "testing"

// sixDays is a plan with an obviously quiet middle: day 3 has one cheap stop
// and nothing worth travelling for.
func sixDays() []AdaptDay {
	return []AdaptDay{
		{Label: "วันที่ 1", City: "โตเกียว", Items: []AdaptItem{
			{ID: "a1", Title: "เช็คอินโรงแรม", Type: "stay", CostDest: 6000},
			{ID: "a2", Title: "ชิบูย่าสกาย", Type: "poi", CostDest: 2500, HasPOI: true, Bookable: true},
		}},
		{Label: "วันที่ 2", City: "โตเกียว", Items: []AdaptItem{
			{ID: "b1", Title: "teamLab", Type: "poi", CostDest: 3800, HasPOI: true, Bookable: true},
			{ID: "b2", Title: "ราเมงอิจิรัน", Type: "meal", CostDest: 1200},
		}},
		{Label: "วันที่ 3", City: "โตเกียว", Items: []AdaptItem{
			{ID: "c1", Title: "เดินเล่นย่านบ้าน", Type: "free"},
		}},
		{Label: "วันที่ 4", City: "เกียวโต", Items: []AdaptItem{
			{ID: "d1", Title: "ชินคันเซ็น", Type: "transport", CostDest: 13000},
			{ID: "d2", Title: "ฟุชิมิอินาริ", Type: "poi", HasPOI: true},
		}},
		{Label: "วันที่ 5", City: "เกียวโต", Items: []AdaptItem{
			{ID: "e1", Title: "อาราชิยามะ", Type: "poi", CostDest: 800, HasPOI: true},
			{ID: "e2", Title: "ไคเซกิ", Type: "meal", CostDest: 4500},
		}},
		{Label: "วันที่ 6", City: "โอซาก้า", Items: []AdaptItem{
			{ID: "f1", Title: "บินกลับ", Type: "flight"},
		}},
	}
}

func TestAdaptPlanUntouchedWhenNothingIsAsked(t *testing.T) {
	got := AdaptPlan(sixDays(), AdaptOptions{})

	if len(got.Changes) != 0 {
		t.Fatalf("changes = %+v, want none", got.Changes)
	}
	if got.Before != got.After {
		t.Fatalf("before %+v != after %+v", got.Before, got.After)
	}
}

func TestAdaptPlanShrinksFromTheQuietestMiddleDay(t *testing.T) {
	got := AdaptPlan(sixDays(), AdaptOptions{Days: 5})

	if len(got.Days) != 5 {
		t.Fatalf("days = %d, want 5", len(got.Days))
	}
	// The arrival day and the flight home both survive.
	if got.Days[0].Items[0].ID != "a1" {
		t.Fatalf("first day = %+v, want the hotel check-in", got.Days[0].Items)
	}
	if last := got.Days[len(got.Days)-1]; last.Items[0].ID != "f1" {
		t.Fatalf("last day = %+v, want the flight home", last.Items)
	}
	// Day 3 was the one with nothing in it.
	for _, day := range got.Days {
		for _, item := range day.Items {
			if item.ID == "c1" {
				t.Fatal("the quiet day survived and a busier one did not")
			}
		}
	}
	if got.Changes[0].Kind != AdaptDayRemoved || got.Changes[0].DayLabel != "วันที่ 3" {
		t.Fatalf("first change = %+v, want day 3 removed", got.Changes[0])
	}
}

func TestAdaptPlanRescuesHighlightsOffARemovedDay(t *testing.T) {
	days := sixDays()
	// Make day 3 the quietest by count but give it one thing worth keeping.
	days[2].Items = []AdaptItem{{ID: "c1", Title: "ตลาดปลา", Type: "poi", CostDest: 500, HasPOI: true}}

	got := AdaptPlan(days, AdaptOptions{Days: 5})

	found := false
	for _, day := range got.Days {
		for _, item := range day.Items {
			if item.ID == "c1" {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("the highlight was dropped with its day instead of being moved")
	}

	moved := 0
	for _, ch := range got.Changes {
		if ch.Kind == AdaptItemMoved && ch.ItemTitle == "ตลาดปลา" {
			moved++
		}
	}
	if moved != 1 {
		t.Fatalf("moves = %d, want exactly one reported", moved)
	}
}

func TestAdaptPlanStretchesWithFreeDaysBeforeTheLast(t *testing.T) {
	got := AdaptPlan(sixDays(), AdaptOptions{Days: 8})

	if len(got.Days) != 8 {
		t.Fatalf("days = %d, want 8", len(got.Days))
	}
	if last := got.Days[7]; len(last.Items) != 1 || last.Items[0].ID != "f1" {
		t.Fatalf("last day = %+v, want the flight home still last", last.Items)
	}
	if len(got.Days[6].Items) != 0 || len(got.Days[5].Items) != 0 {
		t.Fatal("the added days should be empty, not filled with guesses")
	}
	if got.Days[3].Label != "วันที่ 4" {
		t.Fatalf("label = %q, want the days renumbered", got.Days[3].Label)
	}
}

func TestAdaptPlanCutsToBudgetButNeverTheHotelOrTheMeals(t *testing.T) {
	// The plan costs 31,800 per person and 24,700 of that is hotel, shinkansen
	// and meals — so 26,000 is reachable only by cutting optional stops.
	got := AdaptPlan(sixDays(), AdaptOptions{BudgetPerPersonDest: 26000})

	if got.After.CostPerPersonDest > 26000 {
		t.Fatalf("after = %.0f, want within 26000", got.After.CostPerPersonDest)
	}
	// teamLab is the priciest optional stop, so it goes first.
	if hasItem(got.Days, "b1") {
		t.Fatal("the most expensive optional stop survived the budget cut")
	}
	// The hotel, the shinkansen and both meals are still there.
	for _, id := range []string{"a1", "d1", "b2", "e2"} {
		if !hasItem(got.Days, id) {
			t.Fatalf("%s was cut — anchors and meals are not optional", id)
		}
	}
	// And nothing was cut that did not need to be.
	if !hasItem(got.Days, "e1") {
		t.Fatal("a cheap stop was cut after the budget was already met")
	}
}

func TestAdaptPlanSaysWhenItCannotReachTheBudget(t *testing.T) {
	got := AdaptPlan(sixDays(), AdaptOptions{BudgetPerPersonDest: 1000})

	if len(got.Warnings) != 1 {
		t.Fatalf("warnings = %v, want one honest line", got.Warnings)
	}
	if got.After.CostPerPersonDest <= 1000 {
		t.Fatal("the fixture cannot reach 1000 — the test is no longer testing anything")
	}
}

func TestAdaptPlanSlowsDownForABiggerGroup(t *testing.T) {
	days := sixDays()
	days[1].Items = append(days[1].Items,
		AdaptItem{ID: "b3", Title: "ตลาดอะเมโยโกะ", Type: "poi", CostDest: 100, HasPOI: true},
		AdaptItem{ID: "b4", Title: "อาซากุสะ", Type: "poi", CostDest: 200, HasPOI: true},
		AdaptItem{ID: "b5", Title: "ล่องเรือ", Type: "poi", CostDest: 900, HasPOI: true},
	)

	got := AdaptPlan(days, AdaptOptions{PartySize: 10, FromPartySize: 4})

	for _, day := range got.Days {
		if countUnanchored(day.Items) > 3 {
			t.Fatalf("day %q keeps %d stops, want at most 3 for ten people", day.Label, countUnanchored(day.Items))
		}
	}
	// The cheapest optional went first; the pricier ones stayed.
	if hasItem(got.Days, "b3") {
		t.Fatal("the cheapest stop should have been the first to go")
	}
}

func TestAdaptPlanLeavesASmallerGroupAlone(t *testing.T) {
	got := AdaptPlan(sixDays(), AdaptOptions{PartySize: 2, FromPartySize: 6})

	if len(got.Changes) != 0 {
		t.Fatalf("changes = %+v, want none — fewer people does not mean a different plan", got.Changes)
	}
}

func TestAdaptPlanDoesNotMutateTheSource(t *testing.T) {
	source := sixDays()
	AdaptPlan(source, AdaptOptions{Days: 3, BudgetPerPersonDest: 5000})

	if len(source) != 6 || len(source[1].Items) != 2 {
		t.Fatal("the published plan was edited in place")
	}
}

func hasItem(days []AdaptDay, id string) bool {
	for _, day := range days {
		for _, item := range day.Items {
			if item.ID == id {
				return true
			}
		}
	}
	return false
}
