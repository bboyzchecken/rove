package domain

import "testing"

func statusOf(results []CoverageResult, wishID string) CoverageStatus {
	for _, r := range results {
		if r.WishlistItemID == wishID {
			return r.Status
		}
	}
	return ""
}

func TestComputeCoverage(t *testing.T) {
	items := []PlanItemInput{
		{ID: "i1", Title: "Tokyo Skytree", POIID: "poi-skytree", Tags: []string{"view", "landmark"}},
		{ID: "i2", Title: "Ichiran Shinjuku", Tags: []string{"food", "ramen"}},
		{ID: "i3", Title: "อิสระตามอัธยาศัย", Tags: nil},
	}

	cases := []struct {
		name string
		wish WishInput
		want CoverageStatus
	}{
		{
			name: "poi id match is covered",
			wish: WishInput{ID: "w1", Kind: KindMust, Text: "อยากขึ้นตึกสูง", POIID: "poi-skytree"},
			want: CoverageCovered,
		},
		{
			name: "title text match is covered",
			wish: WishInput{ID: "w2", Kind: KindNice, Text: "Tokyo Skytree"},
			want: CoverageCovered,
		},
		{
			name: "tag overlap only is partial",
			wish: WishInput{ID: "w3", Kind: KindMust, Text: "กินราเมงร้านดัง", Tags: []string{"ramen", "food"}},
			want: CoveragePartial,
		},
		{
			name: "no signal is uncovered",
			wish: WishInput{ID: "w4", Kind: KindMust, Text: "ดูซากุระที่เมกุโระ", Tags: []string{"sakura"}},
			want: CoverageUncovered,
		},
		{
			name: "avoid respected is na",
			wish: WishInput{ID: "w5", Kind: KindAvoid, Text: "ไม่เอาพิพิธภัณฑ์", Tags: []string{"museum"}},
			want: CoverageNA,
		},
		{
			name: "avoid violated is uncovered",
			wish: WishInput{ID: "w6", Kind: KindAvoid, Text: "ไม่เอาร้านราเมง", Tags: []string{"ramen"}},
			want: CoverageUncovered,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeCoverage([]WishInput{tc.wish}, items)
			if len(got) != 1 {
				t.Fatalf("expected 1 result, got %d", len(got))
			}
			if s := statusOf(got, tc.wish.ID); s != tc.want {
				t.Errorf("status = %q, want %q", s, tc.want)
			}
		})
	}
}

func TestComputeCoverageEmptyPlan(t *testing.T) {
	wishes := []WishInput{
		{ID: "w1", Kind: KindMust, Text: "Disney Sea"},
		{ID: "w2", Kind: KindAvoid, Text: "ตลาดปลา"},
	}
	got := ComputeCoverage(wishes, nil)

	if statusOf(got, "w1") != CoverageUncovered {
		t.Errorf("must wish against empty plan should be uncovered")
	}
	if statusOf(got, "w2") != CoverageNA {
		t.Errorf("avoid wish against empty plan should be na")
	}
}

func TestComputeCoverageReportsCoveringItems(t *testing.T) {
	items := []PlanItemInput{{ID: "i1", Title: "Tokyo Skytree", POIID: "poi-skytree"}}
	got := ComputeCoverage([]WishInput{{ID: "w1", Kind: KindMust, POIID: "poi-skytree"}}, items)

	if len(got[0].CoveredByItemID) != 1 || got[0].CoveredByItemID[0] != "i1" {
		t.Fatalf("expected covering item i1, got %v", got[0].CoveredByItemID)
	}
}

func TestSummarizeCoverage(t *testing.T) {
	wishes := []WishInput{
		{ID: "w1", Kind: KindMust},
		{ID: "w2", Kind: KindNice},
		{ID: "w3", Kind: KindMust},
		{ID: "w4", Kind: KindAvoid},
	}
	results := []CoverageResult{
		{WishlistItemID: "w1", Status: CoverageCovered},
		{WishlistItemID: "w2", Status: CoveragePartial},
		{WishlistItemID: "w3", Status: CoverageUncovered},
		{WishlistItemID: "w4", Status: CoverageNA},
	}

	got := SummarizeCoverage(wishes, results)

	if got.Total != 3 {
		t.Errorf("Total = %d, want 3 (na excluded)", got.Total)
	}
	if got.MustUncovered != 1 {
		t.Errorf("MustUncovered = %d, want 1", got.MustUncovered)
	}
	// (1 covered + 0.5 partial) / 3 = 50%
	if got.CoveredPercent < 49.9 || got.CoveredPercent > 50.1 {
		t.Errorf("CoveredPercent = %v, want 50", got.CoveredPercent)
	}
}
