// Package tests holds the behavioural authorization suite.
//
// It lives in its own package, not alongside the handlers, so it can only reach
// the API the way a client does: over HTTP, through the real router and the
// real middleware. Anything it proves is therefore true for callers, not just
// for code that happens to sit in the same package.
package tests
