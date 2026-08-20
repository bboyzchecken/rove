package domain

import (
	"testing"
	"time"
)

// These numbers are pinned in two places on purpose: the same cases live in
// apps/web/lib/__tests__/domain.test.ts. If one side changes, the other has to
// change with it — that is the contract that lets mock mode and live mode be
// swapped by an env var.

func decDays(userID string, days ...int) []AvailabilityInput {
	out := make([]AvailabilityInput, 0, len(days))
	for _, d := range days {
		out = append(out, AvailabilityInput{
			UserID: userID,
			Date:   time.Date(2026, time.December, d, 0, 0, 0, 0, time.UTC),
			Mark:   MarkFree,
		})
	}
	return out
}

var fourMembers = []string{"m1", "m2", "m3", "m4"}

func demoEntries() []AvailabilityInput {
	var out []AvailabilityInput
	out = append(out, decDays("m1", 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22)...)
	out = append(out, decDays("m2", 4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 23, 24, 25)...)
	out = append(out, decDays("m3", 3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22)...)
	out = append(out, decDays("m4", 4, 5, 6, 7, 8, 9, 18, 19, 20, 21, 22, 23, 24)...)
	return out
}

func TestDaysBetweenIsInclusive(t *testing.T) {
	start := time.Date(2026, time.December, 4, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.December, 8, 0, 0, 0, 0, time.UTC)
	if got := DaysBetween(start, end); got != 5 {
		t.Fatalf("DaysBetween = %d, want 5", got)
	}
	if got := DaysBetween(start, start); got != 1 {
		t.Fatalf("DaysBetween same day = %d, want 1", got)
	}
}

func TestComputeWindowsFindsFullGroupOverlaps(t *testing.T) {
	windows := ComputeWindows(demoEntries(), fourMembers, WindowOptions{})

	found := map[string]DateWindow{}
	for _, w := range windows {
		if w.Everyone {
			found[w.StartDate+".."+w.EndDate] = w
		}
	}

	for _, want := range []string{"2026-12-04..2026-12-08", "2026-12-20..2026-12-22"} {
		if _, ok := found[want]; !ok {
			t.Errorf("missing full-group window %s; got %v", want, keysOf(found))
		}
	}
}

func TestComputeWindowsRanksLongestFullGroupFirst(t *testing.T) {
	windows := ComputeWindows(demoEntries(), fourMembers, WindowOptions{})
	if len(windows) == 0 {
		t.Fatal("no windows")
	}
	best := windows[0]
	if best.StartDate != "2026-12-04" || best.Days != 5 || !best.Everyone {
		t.Fatalf("best = %+v, want 2026-12-04 for 5 days with everyone", best)
	}
}

func TestComputeWindowsKeepsOnlyMaximalRuns(t *testing.T) {
	windows := ComputeWindows(demoEntries(), fourMembers, WindowOptions{})

	count := 0
	for _, w := range windows {
		if w.Everyone && w.StartDate == "2026-12-04" {
			count++
			if w.EndDate != "2026-12-08" {
				t.Errorf("kept a contained run: %s..%s", w.StartDate, w.EndDate)
			}
		}
	}
	if count != 1 {
		t.Fatalf("kept %d runs starting 4 Dec, want 1", count)
	}
}

func TestComputeWindowsNeedsTwoPeople(t *testing.T) {
	if got := ComputeWindows(decDays("m1", 1, 2, 3), fourMembers, WindowOptions{}); len(got) != 0 {
		t.Fatalf("windows for a lone member = %d, want 0", len(got))
	}
}

func TestComputeWindowsTreatsMaybeAsFlagged(t *testing.T) {
	entries := append(decDays("m1", 4, 5), decDays("m2", 4, 5)...)
	for _, d := range []int{4, 5} {
		entries = append(entries, AvailabilityInput{
			UserID: "m3",
			Date:   time.Date(2026, time.December, d, 0, 0, 0, 0, time.UTC),
			Mark:   MarkMaybe,
		})
	}

	windows := ComputeWindows(entries, fourMembers, WindowOptions{})
	if len(windows) == 0 {
		t.Fatal("no windows")
	}
	w := windows[0]
	if len(w.MemberIDs) != 2 || w.MemberIDs[0] != "m1" || w.MemberIDs[1] != "m2" {
		t.Errorf("free = %v, want [m1 m2]", w.MemberIDs)
	}
	if len(w.MaybeMemberIDs) != 1 || w.MaybeMemberIDs[0] != "m3" {
		t.Errorf("maybe = %v, want [m3]", w.MaybeMemberIDs)
	}
	if w.Everyone {
		t.Error("a maybe must not count as everyone being free")
	}
}

func TestMembersFreeInRangeRequiresEveryDay(t *testing.T) {
	entries := append(decDays("m1", 4, 5, 6), decDays("m2", 4, 5)...)
	entries = append(entries, decDays("m3", 5, 6)...)

	start := time.Date(2026, time.December, 4, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.December, 6, 0, 0, 0, 0, time.UTC)

	free, _ := MembersFreeInRange(entries, fourMembers, start, end)
	if len(free) != 1 || free[0] != "m1" {
		t.Fatalf("free = %v, want [m1]", free)
	}
}

func TestThaiRangeLabel(t *testing.T) {
	dec4 := time.Date(2026, time.December, 4, 0, 0, 0, 0, time.UTC)
	dec8 := time.Date(2026, time.December, 8, 0, 0, 0, 0, time.UTC)
	jan2 := time.Date(2027, time.January, 2, 0, 0, 0, 0, time.UTC)

	if got := ThaiRangeLabel(dec4, dec8); got != "4–8 ธ.ค." {
		t.Errorf("same month = %q", got)
	}
	if got := ThaiRangeLabel(dec8, jan2); got != "8 ธ.ค. – 2 ม.ค." {
		t.Errorf("across months = %q", got)
	}
}

func keysOf(m map[string]DateWindow) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
