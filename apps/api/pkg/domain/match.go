package domain

import (
	"strings"
	"unicode"
)

// Matching helpers shared by coverage (A3.4) and the AI POI resolver (A4.2).
//
// Thai has no word separators and our data mixes Thai, English and Japanese
// names for the same place, so "matching" here is deliberately fuzzy and
// deliberately cheap — the authoritative link is always poi_id.

// NormalizeName lowercases, drops punctuation and collapses whitespace so
// "Tokyo Skytree", "โตเกียว สกายทรี" and "tokyo skytree " compare sensibly.
func NormalizeName(s string) string {
	var b strings.Builder
	b.Grow(len(s))

	lastSpace := true
	for _, r := range strings.ToLower(s) {
		switch {
		// Marks matter: Thai vowels and tone marks are Mn, not letters, and
		// dropping them turns "โตเกียว" into "โตเกยว".
		case unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r):
			b.WriteRune(r)
			lastSpace = false
		case unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r):
			// Collapse any run of separators into a single space, and never
			// start the string with one.
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

// TagOverlap returns the Jaccard similarity of two tag sets, 0..1.
// Empty on either side is 0 — "no tags" must never look like a perfect match.
func TagOverlap(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	setA := make(map[string]struct{}, len(a))
	for _, t := range a {
		if n := NormalizeName(t); n != "" {
			setA[n] = struct{}{}
		}
	}
	setB := make(map[string]struct{}, len(b))
	for _, t := range b {
		if n := NormalizeName(t); n != "" {
			setB[n] = struct{}{}
		}
	}
	if len(setA) == 0 || len(setB) == 0 {
		return 0
	}

	inter := 0
	for t := range setA {
		if _, ok := setB[t]; ok {
			inter++
		}
	}
	union := len(setA) + len(setB) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

// TextSimilar reports whether two names are close enough to treat as the same
// place. It is intentionally conservative: exact normalised equality, or one
// containing the other with enough length to not be a coincidence.
func TextSimilar(a, b string) bool {
	na, nb := NormalizeName(a), NormalizeName(b)
	if na == "" || nb == "" {
		return false
	}
	if na == nb {
		return true
	}

	shorter, longer := na, nb
	if len(shorter) > len(longer) {
		shorter, longer = longer, shorter
	}
	// Below this length, substring matching produces nonsense ("bar" matching
	// "barbecue"), so require an exact hit instead.
	const minSubstringLen = 8
	return len(shorter) >= minSubstringLen && strings.Contains(longer, shorter)
}
