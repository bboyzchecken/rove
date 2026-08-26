package domain

// ROVE points (DEV_SPEC §6.5).
//
// Points are earned for bringing people in and for trips other people actually
// book from. Every rate lives here so the paywall copy, the ledger and the
// admin dashboard cannot drift apart.
//
// What points *buy* moved in M26. There is no longer a per-draft price for
// them to be an alternative to: drafting is free up to the trip's quota and
// unmetered under a Trip Pass. The way out of the points economy is the
// discount code (A12.10, revenue.go), which now applies to the pass — so the
// far end of a referral is ฿299 off a trip rather than one more draft.

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
)

// PayChannels — see billing.go: what a purchase can be paid with is a billing
// fact, and it grew an id once receipts had to name the method (M20).
