package domain

import (
	"fmt"
	"math"
)

// Adapting a copied plan (DEV_SPEC A11.4).
//
// Somebody publishes six days in Kansai for four people on ฿45,000. Somebody
// else has four days, two people and ฿30,000, and wants that plan anyway. This
// file is what happens in between: the itinerary is reshaped to the second
// group's frame, and every change is reported so the diff preview can show what
// it is about to do before anything is written.
//
// The reshaping is deterministic rather than a model call. Dropping the fifth
// stop of a day and the priciest optional ticket is arithmetic, not judgement;
// keeping it in Go means it runs offline, in mock mode, and the same way twice
// — which is what a preview has to promise (Decision Log 25 ส.ค.).

// AdaptItem is one stop, reduced to what reshaping needs.
type AdaptItem struct {
	ID       string
	Title    string
	Type     string
	CostDest float64
	Bookable bool
	HasPOI   bool
}

// anchored items are the skeleton of a day — where you sleep and how you get
// there. They are never dropped to save money or time, because a plan missing
// its hotel is not a cheaper plan, it is a broken one.
func (i AdaptItem) anchored() bool {
	switch i.Type {
	case "stay", "flight", "transport":
		return true
	}
	return false
}

// highlight is what makes a day worth keeping: a real place, something
// bookable, or something worth paying for.
func (i AdaptItem) highlight() bool {
	return i.HasPOI || i.Bookable || i.CostDest > 0
}

type AdaptDay struct {
	Label string
	City  string
	Items []AdaptItem
}

func (d AdaptDay) highlights() int {
	n := 0
	for _, item := range d.Items {
		if item.highlight() {
			n++
		}
	}
	return n
}

// AdaptOptions is the frame the copy has to fit.
//
// A zero means "leave this alone", so a traveller who only wants a shorter trip
// does not have to restate the budget and the party size to get one.
type AdaptOptions struct {
	Days                int
	PartySize           int
	FromPartySize       int
	BudgetPerPersonDest float64
}

// Change kinds.
const (
	AdaptDayAdded    = "day_added"
	AdaptDayRemoved  = "day_removed"
	AdaptItemRemoved = "item_removed"
	AdaptItemMoved   = "item_moved"
)

// AdaptChange is one line of the diff preview.
type AdaptChange struct {
	Kind          string  `json:"kind"`
	DayLabel      string  `json:"day_label"`
	ItemTitle     string  `json:"item_title"`
	Reason        string  `json:"reason"`
	CostDeltaDest float64 `json:"cost_delta_dest"`
}

type AdaptTotals struct {
	Days              int     `json:"days"`
	Items             int     `json:"items"`
	CostPerPersonDest float64 `json:"cost_per_person_dest"`
}

type AdaptResult struct {
	Days    []AdaptDay    `json:"-"`
	Changes []AdaptChange `json:"changes"`
	Before  AdaptTotals   `json:"before"`
	After   AdaptTotals   `json:"after"`
	// What the adapter could not do, said plainly rather than left for the
	// traveller to discover on the trip.
	Warnings []string `json:"warnings"`
}

// maxItemsPerDay is the ceiling a rescued item may push a day to. Five stops is
// where a day stops being a holiday and starts being a schedule — the same
// number the AI pipeline paces to.
const maxItemsPerDay = 5

// AdaptPlan reshapes a published itinerary to fit a different group.
//
// The order matters and is not arbitrary: length first (it decides which days
// exist at all), then pace (a bigger group covers less ground), then budget
// (what is left has to be affordable). Doing budget first would spend the cuts
// on days that are about to be removed anyway.
func AdaptPlan(source []AdaptDay, opt AdaptOptions) AdaptResult {
	days := cloneDays(source)

	res := AdaptResult{Before: totalsOf(days)}

	days = adaptLength(days, opt.Days, &res)
	days = adaptPace(days, opt, &res)
	days = adaptBudget(days, opt.BudgetPerPersonDest, &res)

	relabel(days)

	res.Days = days
	res.After = totalsOf(days)
	return res
}

/* ---------------------------------------------------------------- length -- */

// adaptLength grows or shrinks the itinerary.
//
// The first and last days are structural — you arrive on one and leave on the
// other — so shrinking eats the quietest day in the middle and stretching
// inserts free days before the last one.
func adaptLength(days []AdaptDay, target int, res *AdaptResult) []AdaptDay {
	if target <= 0 || target == len(days) || len(days) == 0 {
		return days
	}

	for target < len(days) {
		idx := quietestInteriorDay(days)
		removed := days[idx]

		days = append(days[:idx:idx], days[idx+1:]...)
		res.Changes = append(res.Changes, AdaptChange{
			Kind:          AdaptDayRemoved,
			DayLabel:      removed.Label,
			Reason:        "ทริปคุณสั้นกว่า",
			CostDeltaDest: -costOf(removed.Items),
		})

		days = rescue(days, removed, res)
	}

	for target > len(days) {
		insertAt := len(days) - 1
		if insertAt < 1 {
			insertAt = len(days)
		}
		city := ""
		if insertAt > 0 {
			city = days[insertAt-1].City
		}
		blank := AdaptDay{Label: "วันว่าง", City: city}

		days = append(days[:insertAt], append([]AdaptDay{blank}, days[insertAt:]...)...)
		res.Changes = append(res.Changes, AdaptChange{
			Kind:     AdaptDayAdded,
			DayLabel: blank.Label,
			Reason:   "ทริปคุณยาวกว่า — เติมเองหรือให้ AI ช่วยร่างต่อได้",
		})
	}

	return days
}

// quietestInteriorDay is the day with the fewest highlights, ties broken by the
// fewest stops. Never the first or the last unless there is nothing else.
func quietestInteriorDay(days []AdaptDay) int {
	if len(days) <= 2 {
		return len(days) - 1
	}

	best := 1
	for i := 2; i < len(days)-1; i++ {
		switch {
		case days[i].highlights() < days[best].highlights():
			best = i
		case days[i].highlights() == days[best].highlights() && len(days[i].Items) < len(days[best].Items):
			best = i
		}
	}
	return best
}

// rescue moves the highlights off a removed day into whichever day has room, so
// shrinking a trip loses days rather than losing the reason to go.
func rescue(days []AdaptDay, removed AdaptDay, res *AdaptResult) []AdaptDay {
	for _, item := range removed.Items {
		if !item.highlight() || item.anchored() {
			continue
		}

		host := roomiestDay(days)
		if host < 0 {
			res.Changes = append(res.Changes, AdaptChange{
				Kind:          AdaptItemRemoved,
				DayLabel:      removed.Label,
				ItemTitle:     item.Title,
				Reason:        "ไม่มีวันไหนเหลือที่ว่างให้",
				CostDeltaDest: -item.CostDest,
			})
			continue
		}

		days[host].Items = append(days[host].Items, item)
		res.Changes = append(res.Changes, AdaptChange{
			Kind:          AdaptItemMoved,
			DayLabel:      days[host].Label,
			ItemTitle:     item.Title,
			Reason:        "ย้ายมาจาก " + removed.Label,
			CostDeltaDest: item.CostDest,
		})
	}
	return days
}

func roomiestDay(days []AdaptDay) int {
	best := -1
	for i := range days {
		if len(days[i].Items) >= maxItemsPerDay {
			continue
		}
		if best < 0 || len(days[i].Items) < len(days[best].Items) {
			best = i
		}
	}
	return best
}

/* ------------------------------------------------------------------ pace -- */

// paceCap is how many stops a group of this size gets through in a day. Twelve
// people do not queue, order and leave as fast as two, and a plan that pretends
// otherwise is the plan that runs an hour late by lunch.
func paceCap(party int) int {
	switch {
	case party <= 4:
		return maxItemsPerDay
	case party <= 8:
		return 4
	default:
		return 3
	}
}

// adaptPace only ever slows a plan down. A smaller group inherits the original
// pace: nobody asked for two extra stops a day, and the adapter has nothing to
// fill them with anyway.
func adaptPace(days []AdaptDay, opt AdaptOptions, res *AdaptResult) []AdaptDay {
	if opt.PartySize <= 0 || opt.PartySize <= opt.FromPartySize {
		return days
	}
	limit := paceCap(opt.PartySize)

	for i := range days {
		for countUnanchored(days[i].Items) > limit {
			drop := cheapestOptional(days[i].Items)
			if drop < 0 {
				break
			}
			item := days[i].Items[drop]
			days[i].Items = append(days[i].Items[:drop:drop], days[i].Items[drop+1:]...)
			res.Changes = append(res.Changes, AdaptChange{
				Kind:          AdaptItemRemoved,
				DayLabel:      days[i].Label,
				ItemTitle:     item.Title,
				Reason:        fmt.Sprintf("กลุ่ม %d คนเดินช้ากว่า — วันละ %d ที่พอ", opt.PartySize, limit),
				CostDeltaDest: -item.CostDest,
			})
		}
	}
	return days
}

func countUnanchored(items []AdaptItem) int {
	n := 0
	for _, item := range items {
		if !item.anchored() {
			n++
		}
	}
	return n
}

/* ---------------------------------------------------------------- budget -- */

// optionalItem reports whether a stop may be cut to hit a budget. Meals are not
// optional: a day without lunch is a saving nobody asked for.
func optionalItem(i AdaptItem) bool {
	return !i.anchored() && i.Type != "meal"
}

// adaptBudget drops the most expensive optional stops until the plan fits, and
// says so when it cannot. It never silently rewrites a price.
func adaptBudget(days []AdaptDay, budget float64, res *AdaptResult) []AdaptDay {
	if budget <= 0 {
		return days
	}

	for costOfDays(days) > budget {
		dayIdx, itemIdx := dearestOptional(days)
		if dayIdx < 0 {
			break
		}

		item := days[dayIdx].Items[itemIdx]
		days[dayIdx].Items = append(days[dayIdx].Items[:itemIdx:itemIdx], days[dayIdx].Items[itemIdx+1:]...)
		res.Changes = append(res.Changes, AdaptChange{
			Kind:          AdaptItemRemoved,
			DayLabel:      days[dayIdx].Label,
			ItemTitle:     item.Title,
			Reason:        "ตัดให้เข้างบ",
			CostDeltaDest: -item.CostDest,
		})
	}

	if over := costOfDays(days) - budget; over > 0 {
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"ตัดได้เท่าที่ตัดได้แล้ว ยังเกินงบอยู่ประมาณ %.0f ต่อคน — ที่เหลือเป็นที่พัก เดินทาง และมื้ออาหาร",
			math.Round(over)))
	}

	return days
}

func dearestOptional(days []AdaptDay) (int, int) {
	dayIdx, itemIdx, best := -1, -1, 0.0
	for d := range days {
		for i, item := range days[d].Items {
			if optionalItem(item) && item.CostDest > best {
				dayIdx, itemIdx, best = d, i, item.CostDest
			}
		}
	}
	return dayIdx, itemIdx
}

func cheapestOptional(items []AdaptItem) int {
	idx, best := -1, math.MaxFloat64
	for i, item := range items {
		if optionalItem(item) && item.CostDest < best {
			idx, best = i, item.CostDest
		}
	}
	return idx
}

/* ------------------------------------------------------------------ misc -- */

func cloneDays(src []AdaptDay) []AdaptDay {
	out := make([]AdaptDay, len(src))
	for i, day := range src {
		out[i] = day
		out[i].Items = append([]AdaptItem(nil), day.Items...)
	}
	return out
}

// relabel renumbers what is left. Keeping "วันที่ 5" on the fourth day is the
// kind of detail that makes a group stop trusting the whole copy.
func relabel(days []AdaptDay) {
	for i := range days {
		days[i].Label = fmt.Sprintf("วันที่ %d", i+1)
	}
}

func costOf(items []AdaptItem) float64 {
	total := 0.0
	for _, item := range items {
		total += item.CostDest
	}
	return math.Round(total)
}

func costOfDays(days []AdaptDay) float64 {
	total := 0.0
	for _, day := range days {
		total += costOf(day.Items)
	}
	return total
}

func totalsOf(days []AdaptDay) AdaptTotals {
	t := AdaptTotals{Days: len(days)}
	for _, day := range days {
		t.Items += len(day.Items)
	}
	t.CostPerPersonDest = costOfDays(days)
	return t
}
