package domain

// Photo Book V2 (DEV_SPEC Phase 3): auto-layout, cover design, custom theme.
//
// V1 printed every day as the same two-column grid, which makes a day with one
// photo look like a mistake and a day with nine look like a contact sheet. The
// rules below are what a person laying out a page does by eye — give a single
// picture the whole width, let the first of an odd set lead — written down so
// the same trip always prints the same book.

// PhotoSlot is one picture's place on the page. `Span` is how many of the six
// grid columns it takes; `Tall` doubles its row so a mosaic has a shape.
type PhotoSlot struct {
	Span int  `json:"span"`
	Tall bool `json:"tall"`
}

// photoBookColumns is the grid every layout divides. Six because it is the
// smallest number that divides cleanly by two and three, which is what lets
// the same grid hold pairs, triples and a hero without a second stylesheet.
const photoBookColumns = 6

// PhotoBookLayout arranges one day's photos.
//
// The shapes, in order of how many pictures there are:
//
//	1     one full-width hero — a lone photo is the point of the page
//	2     side by side
//	3     a tall lead with two stacked beside it
//	4     two by two
//	5     a lead pair, then three across
//	6+    three across, with the leftovers filling the last row evenly
func PhotoBookLayout(count int) []PhotoSlot {
	if count <= 0 {
		return nil
	}

	switch count {
	case 1:
		return []PhotoSlot{{Span: photoBookColumns}}
	case 2:
		return []PhotoSlot{{Span: 3}, {Span: 3}}
	case 3:
		return []PhotoSlot{{Span: 4, Tall: true}, {Span: 2}, {Span: 2}}
	case 4:
		return []PhotoSlot{{Span: 3}, {Span: 3}, {Span: 3}, {Span: 3}}
	case 5:
		return []PhotoSlot{{Span: 3}, {Span: 3}, {Span: 2}, {Span: 2}, {Span: 2}}
	}

	// Everything above five is three across, except the final row, which is
	// split evenly rather than left with one orphan stretched to a third of
	// the page and two gaps beside it.
	out := make([]PhotoSlot, 0, count)
	full := (count / 3) * 3
	for i := 0; i < full; i++ {
		out = append(out, PhotoSlot{Span: 2})
	}
	switch count - full {
	case 1:
		out = append(out, PhotoSlot{Span: photoBookColumns})
	case 2:
		out = append(out, PhotoSlot{Span: 3}, PhotoSlot{Span: 3})
	}
	return out
}

// PhotoBookTheme is a named palette. Themes are code rather than configuration
// because each one is a set of colours that have to work together in print —
// a free-text hex field produces books nobody wants to hold.
type PhotoBookTheme struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Paper  string `json:"paper"`
	Ink    string `json:"ink"`
	Muted  string `json:"muted"`
	Accent string `json:"accent"`
	// CoverInk is the type colour over the cover photo, which is always dark.
	CoverInk string `json:"cover_ink"`
}

// PhotoBookThemes is the catalogue, first entry is the default.
var PhotoBookThemes = []PhotoBookTheme{
	{
		ID: "paper", Name: "กระดาษ",
		Paper: "#FFFFFF", Ink: "#3D2B24", Muted: "#6B5B4E",
		Accent: "#D9714E", CoverInk: "#FFFFFF",
	},
	{
		ID: "ink", Name: "หมึกเข้ม",
		Paper: "#1C1714", Ink: "#F5EFE9", Muted: "#A2938A",
		Accent: "#E49A81", CoverInk: "#FFFFFF",
	},
	{
		ID: "film", Name: "ฟิล์ม",
		Paper: "#F3EEE5", Ink: "#2E2A24", Muted: "#7A7266",
		Accent: "#8BA07A", CoverInk: "#FFFFFF",
	},
}

// PhotoBookThemeByID falls back to the first theme rather than erroring: a
// mistyped query parameter should print the default book, not nothing.
func PhotoBookThemeByID(id string) PhotoBookTheme {
	for _, theme := range PhotoBookThemes {
		if theme.ID == id {
			return theme
		}
	}
	return PhotoBookThemes[0]
}
