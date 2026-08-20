package domain

import "math"

// Money rules, in one place so the API, the export and the PDF all agree to the
// last baht (DEV_SPEC §4.1: DECIMAL(12,2) in the DB, never a float).
//
// Everything here rounds half-up at 2 decimals. Currency conversion happens
// exactly once per amount — converting a rounded total again compounds error.

// Round2 rounds half-away-from-zero to 2 decimals.
func Round2(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return math.Round(v*100) / 100
}

// Convert applies an FX rate, returning the amount unchanged when the currency
// already matches or the rate is unusable. A missing rate must never silently
// zero out someone's budget.
func Convert(amount float64, from, to string, rate float64) float64 {
	if from == to || rate <= 0 {
		return Round2(amount)
	}
	return Round2(amount * rate)
}

// CurrencyPair is the fx_cache key format: "JPY_THB".
func CurrencyPair(from, to string) string { return from + "_" + to }
