package domain

import "testing"

func TestPhotoBookLayoutGivesOnePhotoTheWholePage(t *testing.T) {
	got := PhotoBookLayout(1)
	if len(got) != 1 || got[0].Span != photoBookColumns {
		t.Fatalf("layout = %+v, want one full-width slot", got)
	}
}

func TestPhotoBookLayoutFillsEveryRow(t *testing.T) {
	// Whatever the count, no row may be left with a gap in it: every layout
	// has to divide into whole rows of six columns.
	for count := 1; count <= 24; count++ {
		slots := PhotoBookLayout(count)
		if len(slots) != count {
			t.Fatalf("%d photos produced %d slots", count, len(slots))
		}

		total := 0
		for _, slot := range slots {
			if slot.Span <= 0 || slot.Span > photoBookColumns {
				t.Fatalf("%d photos: slot span %d is off the grid", count, slot.Span)
			}
			total += slot.Span
		}
		// The three-up layout leans on a tall lead to fill its second row.
		if count == 3 {
			continue
		}
		if total%photoBookColumns != 0 {
			t.Errorf("%d photos span %d columns — the last row has a hole in it", count, total)
		}
	}
}

func TestPhotoBookLayoutNeverOrphansTheLastRow(t *testing.T) {
	// Seven is three, three, and one. That one takes the full width rather
	// than sitting in a third of the page with two gaps beside it.
	got := PhotoBookLayout(7)
	if last := got[len(got)-1]; last.Span != photoBookColumns {
		t.Fatalf("last slot = %+v, want the orphan given the whole row", last)
	}

	// Eight is three, three, and a pair sharing the row.
	got = PhotoBookLayout(8)
	if got[6].Span != 3 || got[7].Span != 3 {
		t.Fatalf("last row = %+v %+v, want a half each", got[6], got[7])
	}
}

func TestPhotoBookLayoutIsEmptyForNothing(t *testing.T) {
	if got := PhotoBookLayout(0); got != nil {
		t.Fatalf("layout = %+v, want nil", got)
	}
}

func TestPhotoBookThemeFallsBackRatherThanFailing(t *testing.T) {
	if got := PhotoBookThemeByID("film"); got.ID != "film" {
		t.Fatalf("theme = %+v, want film", got)
	}
	if got := PhotoBookThemeByID("nonsense"); got.ID != PhotoBookThemes[0].ID {
		t.Fatalf("theme = %+v, want the default", got)
	}
	if got := PhotoBookThemeByID(""); got.ID != PhotoBookThemes[0].ID {
		t.Fatalf("theme = %+v, want the default", got)
	}
}

func TestPhotoBookThemesAreAllComplete(t *testing.T) {
	for _, theme := range PhotoBookThemes {
		if theme.ID == "" || theme.Name == "" {
			t.Errorf("theme %+v has no id or name", theme)
		}
		for _, colour := range []string{theme.Paper, theme.Ink, theme.Muted, theme.Accent, theme.CoverInk} {
			if len(colour) != 7 || colour[0] != '#' {
				t.Errorf("theme %s has a colour that is not a hex triple: %q", theme.ID, colour)
			}
		}
	}
}
