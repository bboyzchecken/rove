package domain

// Matching helpers shared by coverage (A3.4) and the AI POI resolver (A4.2):
// normalising Thai/English/Japanese names and scoring tag overlap.
//
// TODO(A3.4): implement NormalizeName and TagOverlap with tests.

// NormalizeName lowercases, strips punctuation and collapses whitespace so
// "Tokyo Skytree", "โตเกียวสกายทรี" and "tokyo skytree " compare sensibly.
func NormalizeName(s string) string { return s }

// TagOverlap returns the Jaccard similarity of two tag sets, 0..1.
func TagOverlap(a, b []string) float64 { return 0 }
