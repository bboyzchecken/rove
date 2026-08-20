package domain

import "testing"

func TestNormalizeNameIgnoresSpacingAndPunctuation(t *testing.T) {
	cases := [][2]string{
		{"Tokyo Skytree", "tokyoskytree"},
		{"  tokyo  skytree ", "tokyoskytree"},
		{"teamLab Planets!", "teamlabplanets"},
		{"โตเกียว สกายทรี", "โตเกียวสกายทรี"},
	}
	for _, c := range cases {
		if got := NormalizeName(c[0]); got != c[1] {
			t.Errorf("NormalizeName(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

func TestTagOverlapIsJaccard(t *testing.T) {
	if got := TagOverlap([]string{"ของกิน", "ตลาด"}, []string{"ของกิน", "ตลาด"}); got != 1 {
		t.Errorf("identical sets = %v, want 1", got)
	}
	if got := TagOverlap([]string{"ของกิน"}, []string{"วัด"}); got != 0 {
		t.Errorf("disjoint sets = %v, want 0", got)
	}
	// One shared tag out of three distinct ones.
	if got := TagOverlap([]string{"ของกิน", "ตลาด"}, []string{"ของกิน"}); got != 0.5 {
		t.Errorf("half overlap = %v, want 0.5", got)
	}
	if got := TagOverlap(nil, []string{"ของกิน"}); got != 0 {
		t.Errorf("empty set = %v, want 0", got)
	}
}

func TestComputeCoverageMatchesByPOIFirst(t *testing.T) {
	wishes := []WishInput{{ID: "w1", Kind: "must", Text: "ไปดูวิว", POIID: "poi-1"}}
	items := []PlanItemInput{{ID: "i1", Title: "Shibuya Sky", POIID: "poi-1"}}

	got := ComputeCoverage(wishes, items)
	if got[0].Status != CoverageCovered || got[0].CoveredByItemID[0] != "i1" {
		t.Fatalf("got %+v, want covered by i1", got[0])
	}
}

func TestComputeCoverageMatchesBySubstringName(t *testing.T) {
	wishes := []WishInput{{ID: "w1", Kind: "must", Text: "ฟุชิมิอินาริ"}}
	items := []PlanItemInput{{ID: "i1", Title: "ศาลเจ้าฟุชิมิอินาริ"}}

	if got := ComputeCoverage(wishes, items); got[0].Status != CoverageCovered {
		t.Fatalf("status = %v, want covered", got[0].Status)
	}
}

func TestComputeCoverageTagMatchStrengths(t *testing.T) {
	// One tag shared out of four distinct ones (Jaccard 0.25) is a hint, not an
	// answer: the board says "มีของคล้ายกัน" rather than ticking the wish off.
	weak := ComputeCoverage(
		[]WishInput{{ID: "w1", Kind: "nice", Text: "อยากกินของอร่อย", Tags: []string{"ของกิน", "ตลาด"}}},
		[]PlanItemInput{{ID: "i1", Title: "โดทงโบริ", Tags: []string{"ของกิน", "ย่าน", "ช้อป"}}},
	)
	if weak[0].Status != CoveragePartial {
		t.Errorf("weak overlap = %v, want partial", weak[0].Status)
	}

	// Sharing most of a small tag set is real evidence.
	strong := ComputeCoverage(
		[]WishInput{{ID: "w1", Kind: "nice", Text: "ตลาดเช้า", Tags: []string{"ของกิน", "เช้า"}}},
		[]PlanItemInput{{ID: "i1", Title: "ตลาดสึกิจิ", Tags: []string{"ของกิน", "เช้า"}}},
	)
	if strong[0].Status != CoverageCovered {
		t.Errorf("strong overlap = %v, want covered", strong[0].Status)
	}

	// A single shared tag buried in a long list is noise.
	noise := ComputeCoverage(
		[]WishInput{{ID: "w1", Kind: "nice", Text: "อะไรก็ได้", Tags: []string{"ของกิน", "ตลาด", "เช้า"}}},
		[]PlanItemInput{{ID: "i1", Title: "โดทงโบริ", Tags: []string{"ของกิน", "กลางคืน", "ย่าน", "ช้อป"}}},
	)
	if noise[0].Status != CoverageUncovered {
		t.Errorf("one tag in six = %v, want uncovered", noise[0].Status)
	}
}

func TestComputeCoverageAvoidInverts(t *testing.T) {
	wishes := []WishInput{{ID: "w1", Kind: "avoid", Text: "ยูนิเวอร์แซล"}}

	clean := ComputeCoverage(wishes, []PlanItemInput{{ID: "i1", Title: "ปราสาทโอซาก้า"}})
	if clean[0].Status != CoverageNA {
		t.Errorf("nothing to conflict with = %v, want na", clean[0].Status)
	}

	conflict := ComputeCoverage(wishes, []PlanItemInput{{ID: "i1", Title: "ยูนิเวอร์แซลสตูดิโอ"}})
	if conflict[0].Status != CoveragePartial || conflict[0].Note == "" {
		t.Errorf("conflict = %+v, want partial with a note", conflict[0])
	}
}

func TestSummariseCoverageExcludesNotApplicable(t *testing.T) {
	wishes := []WishInput{
		{ID: "w1", Kind: "must", Text: "ฟุชิมิอินาริ"},
		{ID: "w2", Kind: "nice", Text: "ไม่มีในแพลน"},
		{ID: "w3", Kind: "avoid", Text: "สวนสนุก"},
	}
	items := []PlanItemInput{{ID: "i1", Title: "ศาลเจ้าฟุชิมิอินาริ"}}

	summary := SummariseCoverage(wishes, ComputeCoverage(wishes, items))

	if summary.Total != 2 {
		t.Errorf("total = %d, want 2 (the avoid wish is not applicable)", summary.Total)
	}
	if summary.Covered != 1 || summary.Uncovered != 1 {
		t.Errorf("covered/uncovered = %d/%d, want 1/1", summary.Covered, summary.Uncovered)
	}
	if summary.MustCovered != 1 || summary.MustTotal != 1 {
		t.Errorf("must = %d/%d, want 1/1", summary.MustCovered, summary.MustTotal)
	}
	if summary.Percent != 50 {
		t.Errorf("percent = %d, want 50", summary.Percent)
	}
}
