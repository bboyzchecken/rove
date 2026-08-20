package domain

import (
	"strings"
	"unicode"
)

// Matching helpers shared by coverage (A3.4) and the AI POI resolver (A4.2):
// normalising Thai/English/Japanese names and scoring tag overlap.

// NormalizeName lowercases, strips punctuation and collapses whitespace so
// "Tokyo Skytree", "โตเกียวสกายทรี" and "tokyo skytree " compare sensibly.
//
// Thai has no word spacing, so removing whitespace entirely — rather than
// collapsing it to single spaces — is what makes "โตเกียว สกายทรี" and
// "โตเกียวสกายทรี" the same string. For Latin text the effect is the same
// comparison with the spaces gone, which is fine for equality checks.
func NormalizeName(s string) string {
	var b strings.Builder
	b.Grow(len(s))

	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case unicode.IsSpace(r):
			continue
		case unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r):
			b.WriteRune(r)
		default:
			// Punctuation, dashes, quotes, emoji: dropped.
		}
	}
	return b.String()
}

// TagOverlap returns the Jaccard similarity of two tag sets, 0..1.
//
// Jaccard rather than raw hit count on purpose: an item tagged with fifteen
// things should not "cover" every wish that happens to share one of them.
func TagOverlap(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	left := tagSet(a)
	right := tagSet(b)
	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	shared := 0
	for tag := range left {
		if right[tag] {
			shared++
		}
	}
	if shared == 0 {
		return 0
	}

	union := len(left) + len(right) - shared
	return float64(shared) / float64(union)
}

func tagSet(tags []string) map[string]bool {
	out := make(map[string]bool, len(tags))
	for _, tag := range tags {
		if n := NormalizeName(tag); n != "" {
			out[n] = true
		}
	}
	return out
}
