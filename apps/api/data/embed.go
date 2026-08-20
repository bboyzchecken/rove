// Package data embeds the reference datasets the API answers requests from.
//
// Only the files that are read per request live here as embedded bytes; the
// seed inputs (characters.json, poi/*.csv, templates/) stay plain files because
// they are read once, by `go run . seed`.
package data

import _ "embed"

// AirportsJSON is the worldwide airport index built by scripts/gen-airports.mjs.
//
//go:embed airports.json
var AirportsJSON []byte
