package domain

import (
	"fmt"
	"math"
	"strings"
	"time"
	"unicode"
)

// Matching helpers shared by coverage (A3.4) and the AI POI resolver (A4.2):
// normalising Thai/English/Japanese names and scoring tag overlap.

// NormalizeName lowercases, strips punctuation and collapses whitespace so
// "Tokyo Skytree", "โตเกียวสกายทรี" and "tokyo skytree " compare sensibly.
//
// Thai has no word spacing, so removing whitespace entirely — rather than
// collapsing it to single spaces — is what makes "โตเกียว สกายทรี" and
// "โตเกียวสกายทรี" the same string. For Latin text the effect is the same
// comparison with the spaces gone, which is fine for equality checks.
func NormalizeName(s string) string {
	var b strings.Builder
	b.Grow(len(s))

	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case unicode.IsSpace(r):
			continue
		case unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r):
			b.WriteRune(r)
		default:
			// Punctuation, dashes, quotes, emoji: dropped.
		}
	}
	return b.String()
}

// TagOverlap returns the Jaccard similarity of two tag sets, 0..1.
//
// Jaccard rather than raw hit count on purpose: an item tagged with fifteen
// things should not "cover" every wish that happens to share one of them.
func TagOverlap(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	left := tagSet(a)
	right := tagSet(b)
	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	shared := 0
	for tag := range left {
		if right[tag] {
			shared++
		}
	}
	if shared == 0 {
		return 0
	}

	union := len(left) + len(right) - shared
	return float64(shared) / float64(union)
}

func tagSet(tags []string) map[string]bool {
	out := make(map[string]bool, len(tags))
	for _, tag := range tags {
		if n := NormalizeName(tag); n != "" {
			out[n] = true
		}
	}
	return out
}

/* --------------------------------------------- trip match score (A11.3) -- */

// A published trip and a traveller looking for one are described with the same
// shape. Scoring is symmetric except where it should not be — a trip that costs
// less than the budget still fits, a trip that costs more does not — and the
// asymmetries are spelled out below rather than hidden in the arithmetic.
type MatchProfile struct {
	Country            string
	StartDate          *time.Time
	EndDate            *time.Time
	Days               int
	BudgetPerPersonTHB float64
	PartySize          int
	// Free-form signals: item types, areas, cities, wishlist tags.
	Tags []string
}

// MatchResult is a percentage plus the sentences the card shows underneath it.
// A number with no reason next to it is a number nobody trusts.
type MatchResult struct {
	Score   int      `json:"score"`
	Reasons []string `json:"reasons"`
}

// The four things a traveller actually compares, weighted by how much each one
// changes the answer. They add up to 100 so the score reads as a percentage.
const (
	matchWeightDates  = 30.0
	matchWeightBudget = 25.0
	matchWeightTags   = 25.0
	matchWeightParty  = 20.0
)

// neutral is what an unknown component scores. Half marks, not zero: a trip
// whose owner never set a budget should not be punished for it, and it should
// not win either.
const matchNeutral = 0.5

// ScoreMatch rates how well a published trip fits what someone is looking for
// (DEV_SPEC A11.3).
//
// A different country is not a low score, it is not a match at all: nobody
// browsing plans for Japan wants a well-fitting week in Korea ranked above a
// decent one in Osaka.
func ScoreMatch(want, have MatchProfile) MatchResult {
	if want.Country != "" && have.Country != "" && !strings.EqualFold(want.Country, have.Country) {
		return MatchResult{Score: 0}
	}

	res := MatchResult{}
	total := 0.0

	dates := matchDates(want, have)
	total += dates * matchWeightDates

	budget := matchBudget(want.BudgetPerPersonTHB, have.BudgetPerPersonTHB)
	total += budget * matchWeightBudget

	tags := TagCoverage(want.Tags, have.Tags)
	if len(want.Tags) == 0 || len(have.Tags) == 0 {
		tags = matchNeutral
	}
	total += tags * matchWeightTags

	party := matchParty(want.PartySize, have.PartySize)
	total += party * matchWeightParty

	res.Score = int(math.Round(total))

	// Only components that genuinely agree earn a line. "ตรงกัน 62%" with four
	// bullet points explaining near-misses reads as an excuse, not a reason.
	if dates >= 0.75 {
		res.Reasons = append(res.Reasons, matchDatesReason(want, have))
	}
	if budget >= 0.75 && want.BudgetPerPersonTHB > 0 && have.BudgetPerPersonTHB > 0 {
		res.Reasons = append(res.Reasons, "งบใกล้เคียงกับที่ตั้งไว้")
	}
	if tags >= 0.5 && len(want.Tags) > 0 && len(have.Tags) > 0 {
		if shared := SharedTags(want.Tags, have.Tags); len(shared) > 0 {
			res.Reasons = append(res.Reasons, "มีที่อยากไปตรงกัน: "+strings.Join(shared, ", "))
		}
	}
	if party >= 0.8 && want.PartySize > 0 && have.PartySize > 0 {
		res.Reasons = append(res.Reasons, fmt.Sprintf("กลุ่มขนาดใกล้กัน (%d คน)", have.PartySize))
	}

	return res
}

// matchDates blends when the trip happens with how long it is. Both are "when",
// and splitting them into two weights would make the season count twice.
func matchDates(want, have MatchProfile) float64 {
	season := matchNeutral
	if want.StartDate != nil && have.StartDate != nil {
		switch monthDistance(want.StartDate.Month(), have.StartDate.Month()) {
		case 0:
			season = 1
		case 1:
			season = 0.6
		case 2:
			season = 0.3
		default:
			season = 0
		}
	}

	length := matchNeutral
	if want.Days > 0 && have.Days > 0 {
		diff := want.Days - have.Days
		if diff < 0 {
			diff = -diff
		}
		longest := want.Days
		if have.Days > longest {
			longest = have.Days
		}
		length = 1 - float64(diff)/float64(longest)
		if length < 0 {
			length = 0
		}
	}

	return 0.6*season + 0.4*length
}

func matchDatesReason(want, have MatchProfile) string {
	if want.StartDate != nil && have.StartDate != nil &&
		want.StartDate.Month() == have.StartDate.Month() {
		return "ไปเดือนเดียวกัน — " + thaiMonthsShort[have.StartDate.Month()-1]
	}
	if have.Days > 0 {
		return fmt.Sprintf("ยาว %d วัน เท่ากับที่วางไว้", have.Days)
	}
	return "ช่วงเวลาใกล้เคียงกัน"
}

// monthDistance is circular: December and January are one month apart, which is
// the whole point of comparing seasons rather than calendar numbers.
func monthDistance(a, b time.Month) int {
	d := int(a) - int(b)
	if d < 0 {
		d = -d
	}
	if d > 6 {
		d = 12 - d
	}
	return d
}

// matchBudget is the one deliberately lopsided component. Coming in under
// budget is a good outcome; going over it is the thing the traveller asked us
// to avoid, so the score falls away linearly and hits zero at double.
func matchBudget(want, have float64) float64 {
	if want <= 0 || have <= 0 {
		return matchNeutral
	}

	ratio := have / want
	if ratio <= 1 {
		// Far cheaper is still a fit, just a different kind of trip.
		return 0.7 + 0.3*ratio
	}
	if score := 1 - (ratio - 1); score > 0 {
		return score
	}
	return 0
}

// matchParty walks down a step per person. Two people reading a plan built for
// four is fine; two reading one built for twelve is a different holiday.
func matchParty(want, have int) float64 {
	if want <= 0 || have <= 0 {
		return matchNeutral
	}
	diff := want - have
	if diff < 0 {
		diff = -diff
	}
	if score := 1 - 0.2*float64(diff); score > 0.2 {
		return score
	}
	return 0.2
}

// TagCoverage answers "how much of what I want does this trip have", which is
// not the same question as TagOverlap's "how alike are these two sets". A trip
// with fifty tags that includes all five of mine is a perfect match for me and
// a poor Jaccard score.
func TagCoverage(want, have []string) float64 {
	if len(want) == 0 || len(have) == 0 {
		return 0
	}
	left, right := tagSet(want), tagSet(have)
	if len(left) == 0 {
		return 0
	}

	shared := 0
	for tag := range left {
		if right[tag] {
			shared++
		}
	}
	return float64(shared) / float64(len(left))
}

// SharedTags returns the overlap in the caller's original spelling, capped at
// three: the card has one line for this, not a paragraph.
func SharedTags(want, have []string) []string {
	right := tagSet(have)
	seen := map[string]bool{}
	out := make([]string, 0, 3)

	for _, tag := range want {
		key := NormalizeName(tag)
		if key == "" || seen[key] || !right[key] {
			continue
		}
		seen[key] = true
		out = append(out, tag)
		if len(out) == 3 {
			break
		}
	}
	return out
}
