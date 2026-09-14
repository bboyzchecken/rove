package domain

import (
	"hash/crc32"
	"math/rand"
)

// Trip colour (Feedback #2 — D-3, ROVE_BRAND_SPEC §2.7).
//
// Every trip carries one of the six brand pairs, by NAME rather than by hex:
// the web side resolves "blue" to its light and solid halves through the
// brand tokens, so a palette change moves every trip with it.
//
// This file is the server-side twin of `apps/web/lib/trip-color.ts`. The two
// lists must stay identical and in the same order, because `ColorFromID`
// hashes into the list by position and mock mode does the same hash.
var TripColors = []string{"blue", "pink", "yellow", "green", "orange", "purple"}

func IsTripColor(s string) bool {
	for _, c := range TripColors {
		if c == s {
			return true
		}
	}
	return false
}

// ColorFromID gives a trip created before colours existed a stable one, the
// same one every time it is read, without a write.
func ColorFromID(id string) string {
	return TripColors[crc32.ChecksumIEEE([]byte(id))%uint32(len(TripColors))]
}

// RandomTripColor picks one at creation, avoiding `exclude` — the colour of
// the creator's most recent trip — so two rooms someone is planning at once do
// not come out the same colour by chance.
func RandomTripColor(exclude string) string {
	pool := make([]string, 0, len(TripColors))
	for _, c := range TripColors {
		if c != exclude {
			pool = append(pool, c)
		}
	}
	return pool[rand.Intn(len(pool))]
}
