package domain

// ROVE points (DEV_SPEC §6.5).
//
// Points are earned for bringing people in and for trips other people actually
// book from, and spent on extra AI drafts. Every rate lives here so the paywall
// copy, the ledger and the admin dashboard cannot drift apart.

const (
	// PointsPerReferral is paid when someone you invited joins their first trip.
	PointsPerReferral = 150
	// PointsPerBooking is paid when a booking is confirmed from a trip you
	// published — the only revenue-linked award.
	PointsPerBooking = 480
	// PointsPerClone is paid when someone copies your public trip.
	PointsPerClone = 260
	// PointsPerPublish is a one-off for opening your first trip to the public.
	PointsPerPublish = 500
	// PointsPerAIDraft is what an extra draft costs.
	PointsPerAIDraft = 300
	// PricePerDraftTHB is the cash alternative (§16).
	PricePerDraftTHB = 39
)

// PayChannels — see billing.go: what a draft can be paid with is a billing
// fact, and it grew an id once receipts had to name the method (M20).

// CanAffordDraft reports whether a balance covers one extra draft.
func CanAffordDraft(balance int) bool { return balance >= PointsPerAIDraft }
