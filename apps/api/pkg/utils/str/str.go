// Package str holds small string helpers with no external dependencies.
package str

import (
	"regexp"
	"strings"
)

var nonSlug = regexp.MustCompile(`[^a-z0-9ก-๙]+`)

// Slugify builds the public plan slug (/p/[slug]). Thai characters are kept
// because most trip titles are Thai.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// Truncate cuts a string to n runes, appending an ellipsis when it was cut.
func Truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func Ptr[T any](v T) *T { return &v }

func Deref[T any](p *T, fallback T) T {
	if p == nil {
		return fallback
	}
	return *p
}
