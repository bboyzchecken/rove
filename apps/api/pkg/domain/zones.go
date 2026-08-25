// Package domain holds pure business logic: no database, no HTTP, no external
// calls. Everything here is unit-testable in isolation and MUST have tests
// (DEV_SPEC §6.2).
package domain

import "strings"

// Zone is a planning region. The AI groups a day's items inside one zone to keep
// travel time realistic, so these codes are part of the prompt contract — adding
// one means updating the planner prompt too.
type Zone struct {
	Code string `json:"code"`
	// The ISO country the zone belongs to. Zone codes are unique across
	// countries, but a planner only ever offers the ones for where the trip is
	// going — "seoul_north" has no business appearing in a Tokyo prompt.
	Country string `json:"country"`
	NameTH  string `json:"name_th"`
	NameEN  string `json:"name_en"`
	City    string `json:"city"`
	// NeighbourCodes are zones that can reasonably share a day.
	NeighbourCodes []string `json:"neighbour_codes"`
}

// Zones covers Japan (D0.1) and, from Phase 3, the second country.
//
// "Can these two share a day" is the only question these neighbour lists
// answer, and the honest test is whether a group would actually do both
// without spending the day on trains — not whether a map says they are close.
var Zones = []Zone{
	/* ------------------------------------------------------------ Japan -- */
	{Code: "tokyo_east", Country: "JP", NameTH: "โตเกียวฝั่งตะวันออก (อาซากุสะ/อุเอโนะ/อากิบะ)", NameEN: "East Tokyo (Asakusa/Ueno/Akihabara)", City: "tokyo", NeighbourCodes: []string{"tokyo_bay", "tokyo_west"}},
	{Code: "tokyo_west", Country: "JP", NameTH: "โตเกียวฝั่งตะวันตก (ชินจูกุ/ชิบูย่า/ฮาราจูกุ)", NameEN: "West Tokyo (Shinjuku/Shibuya/Harajuku)", City: "tokyo", NeighbourCodes: []string{"tokyo_east", "tokyo_bay", "kawagoe"}},
	{Code: "tokyo_bay", Country: "JP", NameTH: "อ่าวโตเกียว (โอไดบะ/ดิสนีย์/โทโยสุ)", NameEN: "Tokyo Bay (Odaiba/Disney/Toyosu)", City: "tokyo", NeighbourCodes: []string{"tokyo_east", "tokyo_west", "yokohama"}},
	{Code: "yokohama", Country: "JP", NameTH: "โยโกฮาม่า", NameEN: "Yokohama", City: "yokohama", NeighbourCodes: []string{"kamakura", "tokyo_bay"}},
	{Code: "kamakura", Country: "JP", NameTH: "คามาคุระ/เอโนชิมะ", NameEN: "Kamakura/Enoshima", City: "kamakura", NeighbourCodes: []string{"yokohama"}},
	{Code: "fuji", Country: "JP", NameTH: "ฟูจิ/คาวากุจิโกะ", NameEN: "Fuji/Kawaguchiko", City: "fujikawaguchiko", NeighbourCodes: []string{"hakone"}},
	{Code: "kawagoe", Country: "JP", NameTH: "คาวาโกเอะ", NameEN: "Kawagoe", City: "kawagoe", NeighbourCodes: []string{"tokyo_west"}},
	{Code: "hakone", Country: "JP", NameTH: "ฮาโกเน่", NameEN: "Hakone", City: "hakone", NeighbourCodes: []string{"fuji"}},
	{Code: "nikko", Country: "JP", NameTH: "นิกโก้", NameEN: "Nikko", City: "nikko", NeighbourCodes: []string{}},

	/* ------------------------------------------------ South Korea (M23) -- */
	{Code: "seoul_north", Country: "KR", NameTH: "โซลเหนือ (คยองบก/บุกชอน/อินซาดง)", NameEN: "North Seoul (Gyeongbok/Bukchon/Insadong)", City: "seoul", NeighbourCodes: []string{"seoul_central", "seoul_east"}},
	{Code: "seoul_central", Country: "KR", NameTH: "โซลกลาง (มยองดง/นัมซาน/ทงแดมุน)", NameEN: "Central Seoul (Myeongdong/Namsan/Dongdaemun)", City: "seoul", NeighbourCodes: []string{"seoul_north", "seoul_east", "seoul_south", "seoul_west"}},
	{Code: "seoul_south", Country: "KR", NameTH: "กังนัม (กังนัม/ยออีโด/ซองซู)", NameEN: "Gangnam (Gangnam/Yeouido/Seongsu)", City: "seoul", NeighbourCodes: []string{"seoul_central", "seoul_west"}},
	{Code: "seoul_west", Country: "KR", NameTH: "โซลตะวันตก (ฮงแด/ยอนนัมดง/อีแด)", NameEN: "West Seoul (Hongdae/Yeonnam/Edae)", City: "seoul", NeighbourCodes: []string{"seoul_central", "seoul_south"}},
	{Code: "seoul_east", Country: "KR", NameTH: "โซลตะวันออก (ทงแดมุน/คอนแด/ซองซู)", NameEN: "East Seoul (Dongdaemun/Konkuk/Seongsu)", City: "seoul", NeighbourCodes: []string{"seoul_central", "seoul_north"}},
	// A day trip, not a zone of Seoul: an hour each way is the whole reason it
	// shares a day with nothing.
	{Code: "nami_petite", Country: "KR", NameTH: "เกาะนามิ/สวนสนุกเปอตีต์ฟรองซ์", NameEN: "Nami Island/Petite France", City: "chuncheon", NeighbourCodes: []string{}},
	{Code: "incheon", Country: "KR", NameTH: "อินชอน (ไชน่าทาวน์/ซงโด)", NameEN: "Incheon (Chinatown/Songdo)", City: "incheon", NeighbourCodes: []string{}},
	{Code: "suwon", Country: "KR", NameTH: "ซูวอน (ป้อมฮวาซอง)", NameEN: "Suwon (Hwaseong Fortress)", City: "suwon", NeighbourCodes: []string{}},
	{Code: "busan_coast", Country: "KR", NameTH: "ปูซานชายทะเล (แฮอุนแด/กวางอัลลี)", NameEN: "Busan Coast (Haeundae/Gwangalli)", City: "busan", NeighbourCodes: []string{"busan_old"}},
	{Code: "busan_old", Country: "KR", NameTH: "ปูซานเมืองเก่า (กัมชอน/จากัลชี)", NameEN: "Old Busan (Gamcheon/Jagalchi)", City: "busan", NeighbourCodes: []string{"busan_coast"}},
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

// ZonesForCountry is what a planner may use for a given trip. An unknown
// country returns nothing rather than everything: offering Tokyo zones for a
// trip to Vietnam is worse than offering none.
func ZonesForCountry(country string) []Zone {
	code := strings.ToUpper(strings.TrimSpace(country))
	out := make([]Zone, 0, 12)
	for _, z := range Zones {
		if z.Country == code {
			out = append(out, z)
		}
	}
	return out
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
