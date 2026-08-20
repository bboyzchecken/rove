// Package domain holds pure business logic: no database, no HTTP, no external
// calls. Everything here is unit-testable in isolation and MUST have tests
// (DEV_SPEC §6.2).
package domain

// Zone is a planning region. The AI groups a day's items inside one zone to keep
// travel time realistic, so these codes are part of the prompt contract — adding
// one means updating the planner prompt too.
type Zone struct {
	Code   string
	NameTH string
	City   string
	// NeighbourCodes are zones that can reasonably share a day.
	NeighbourCodes []string
}

// Zones covers the Phase 1 scope: Tokyo and the day trips around it (D0.1).
var Zones = []Zone{
	{Code: "tokyo_east", NameTH: "โตเกียวฝั่งตะวันออก (อาซากุสะ/อุเอโนะ/อากิบะ)", City: "tokyo", NeighbourCodes: []string{"tokyo_bay", "tokyo_west"}},
	{Code: "tokyo_west", NameTH: "โตเกียวฝั่งตะวันตก (ชินจูกุ/ชิบูย่า/ฮาราจูกุ)", City: "tokyo", NeighbourCodes: []string{"tokyo_east", "tokyo_bay"}},
	{Code: "tokyo_bay", NameTH: "อ่าวโตเกียว (โอไดบะ/ดิสนีย์/โทโยสุ)", City: "tokyo", NeighbourCodes: []string{"tokyo_east", "tokyo_west"}},
	{Code: "yokohama", NameTH: "โยโกฮาม่า", City: "yokohama", NeighbourCodes: []string{"kamakura", "tokyo_bay"}},
	{Code: "kamakura", NameTH: "คามาคุระ/เอโนชิมะ", City: "kamakura", NeighbourCodes: []string{"yokohama"}},
	{Code: "fuji", NameTH: "ฟูจิ/คาวากุจิโกะ", City: "fujikawaguchiko", NeighbourCodes: []string{}},
	{Code: "kawagoe", NameTH: "คาวาโกเอะ", City: "kawagoe", NeighbourCodes: []string{"tokyo_west"}},
	{Code: "hakone", NameTH: "ฮาโกเน่", City: "hakone", NeighbourCodes: []string{"fuji"}},
	{Code: "nikko", NameTH: "นิกโก้", City: "nikko", NeighbourCodes: []string{}},
}

var zoneByCode = func() map[string]Zone {
	m := make(map[string]Zone, len(Zones))
	for _, z := range Zones {
		m[z.Code] = z
	}
	return m
}()

func ZoneByCode(code string) (Zone, bool) {
	z, ok := zoneByCode[code]
	return z, ok
}

// CanShareDay reports whether two zones are close enough to visit on one day.
func CanShareDay(a, b string) bool {
	if a == b {
		return true
	}
	za, ok := zoneByCode[a]
	if !ok {
		return false
	}
	for _, n := range za.NeighbourCodes {
		if n == b {
			return true
		}
	}
	return false
}
