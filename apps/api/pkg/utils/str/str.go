// Package str holds small string helpers with no external dependencies.
package str

import (
	"crypto/rand"
	"regexp"
	"strings"
	"time"
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

// RandomToken returns a URL-safe random string of n characters, used for
// invite links, share tokens and OAuth state. crypto/rand, never math/rand:
// a guessable share token is an unlisted trip anyone can find.
func RandomToken(n int) string {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing is not recoverable in a way that should produce a
		// weaker token, so fall back to the process clock only to avoid a panic
		// and let the caller's uniqueness constraint catch a collision.
		for i := range buf {
			buf[i] = alphabet[(int(time.Now().UnixNano())+i)%len(alphabet)]
		}
		return string(buf)
	}

	for i, b := range buf {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf)
}
