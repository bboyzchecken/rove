package domain

import (
	"fmt"
	"sort"
)

// Destination suggestions for a locked window (M2.5 — A2.6).
//
// Twin of `rankDestinations` in apps/web/lib/data/mock/catalog.ts. Three things
// decide the order, in the order a group actually argues about them: does the
// trip fit the days we got, is this the right season, and can we afford it.
// Flight time only breaks ties, and only on short trips, where a six-hour
// flight really does cost a day of the five.

type Destination struct {
	ID           string   `json:"id"`
	Country      string   `json:"country"`
	Flag         string   `json:"flag"`
	Name         string   `json:"name"`
	Cities       []string `json:"cities"`
	Subtitle     string   `json:"subtitle"`
	Pill         string   `json:"pill"`
	Accent       string   `json:"accent"`
	BudgetMinTHB int      `json:"budget_min_thb"`
	BudgetMaxTHB int      `json:"budget_max_thb"`
	Reason       string   `json:"reason"`
	Fit          int      `json:"fit"`
	Recommended  bool     `json:"recommended"`
	FlightHours  float64  `json:"flight_hours"`
	WeatherHigh  int      `json:"weather_high"`
	WeatherLow   int      `json:"weather_low"`
	WeatherText  string   `json:"weather_text"`
}

type destinationSeed struct {
	Destination
	idealMin, idealMax int
	bestMonths         []int
	reasonShort        string
	reasonLong         string
}

var destinationSeeds = []destinationSeed{
	{
		Destination: Destination{
			ID: "japan", Country: "JP", Flag: "🇯🇵", Name: "ญี่ปุ่น",
			Cities: []string{"โตเกียว", "โยโกฮาม่า"}, Subtitle: "โตเกียว · โยโกฮาม่า",
			Accent: "primary", BudgetMinTHB: 35000, BudgetMaxTHB: 55000, FlightHours: 6,
			WeatherHigh: 12, WeatherLow: 4, WeatherText: "หนาวแห้ง ท้องฟ้าใส",
		},
		idealMin: 4, idealMax: 8, bestMonths: []int{3, 4, 10, 11, 12},
		reasonShort: "Tokyo loop จบใน 4–5 วันได้พอดี ไม่ต้องเร่ง",
		reasonLong:  "มีเวลาพอต่อเกียวโตหรือคาวากูจิโกะได้อีกขา",
	},
	{
		Destination: Destination{
			ID: "korea", Country: "KR", Flag: "🇰🇷", Name: "เกาหลีใต้",
			Cities: []string{"โซล", "นัมซาน"}, Subtitle: "โซล · นัมซาน",
			Accent: "blue", BudgetMinTHB: 28000, BudgetMaxTHB: 40000, FlightHours: 5.5,
			WeatherHigh: 6, WeatherLow: -2, WeatherText: "มีโอกาสเจอหิมะแรกของปี",
		},
		idealMin: 3, idealMax: 6, bestMonths: []int{4, 5, 10, 11, 12},
		reasonShort: "โซลเที่ยวได้ครบใน 3–4 วัน เดินทางในเมืองง่าย",
		reasonLong:  "ต่อปูซานหรือคังวอนโดได้ถ้ามีวันเหลือ",
	},
	{
		Destination: Destination{
			ID: "taiwan", Country: "TW", Flag: "🇹🇼", Name: "ไต้หวัน",
			Cities: []string{"ไทเป", "จิ่วเฟิ่น"}, Subtitle: "ไทเป · จิ่วเฟิ่น",
			Accent: "green", BudgetMinTHB: 18000, BudgetMaxTHB: 28000, FlightHours: 3.75,
			WeatherHigh: 20, WeatherLow: 14, WeatherText: "เย็นสบาย ไม่หนาวจัด",
		},
		idealMin: 3, idealMax: 5, bestMonths: []int{10, 11, 12, 1, 2, 3},
		reasonShort: "บินสั้น งบเบาที่สุดในกลุ่มนี้ กิน-ช้อปครบ",
		reasonLong:  "พอไปฮวาเหลียนหรือไถจงเพิ่มได้อีกวัน",
	},
	{
		Destination: Destination{
			ID: "vietnam", Country: "VN", Flag: "🇻🇳", Name: "เวียดนาม",
			Cities: []string{"ฮานอย", "ซาปา"}, Subtitle: "ฮานอย · ซาปา",
			Accent: "yellow", BudgetMinTHB: 12000, BudgetMaxTHB: 20000, FlightHours: 1.75,
			WeatherHigh: 19, WeatherLow: 13, WeatherText: "เย็นชื้น หมอกลงที่ซาปา",
		},
		idealMin: 3, idealMax: 5, bestMonths: []int{11, 12, 1, 2, 3},
		reasonShort: "บินไม่ถึง 2 ชม. เหมาะกับทริปสั้นที่ไม่อยากเสียวันไปกับการเดินทาง",
		reasonLong:  "ต่อฮาลองเบย์ค้างคืนได้สบาย",
	},
	{
		Destination: Destination{
			ID: "hongkong", Country: "HK", Flag: "🇭🇰", Name: "ฮ่องกง",
			Cities: []string{"ฮ่องกง", "มาเก๊า"}, Subtitle: "ฮ่องกง · มาเก๊า",
			Accent: "pink", BudgetMinTHB: 20000, BudgetMaxTHB: 32000, FlightHours: 2.75,
			WeatherHigh: 21, WeatherLow: 16, WeatherText: "อากาศดีที่สุดของปี",
		},
		idealMin: 3, idealMax: 4, bestMonths: []int{10, 11, 12, 1},
		reasonShort: "เมืองเดียวจบ เดินทางในเมืองไม่กินเวลา",
		reasonLong:  "ข้ามไปมาเก๊าได้อีกวันด้วยเรือ 1 ชม.",
	},
}

// RankDestinations scores the catalogue for a locked window. `budgetPerPerson`
// of zero means the group has not set a target, in which case price stops
// being a differentiator rather than disqualifying the expensive options.
func RankDestinations(days, month int, budgetPerPersonTHB float64) []Destination {
	out := make([]Destination, 0, len(destinationSeeds))

	for _, seed := range destinationSeeds {
		lengthFit := 100.0
		switch {
		case days < seed.idealMin:
			lengthFit = maxFloat(30, 100-float64(seed.idealMin-days)*22)
		case days > seed.idealMax:
			lengthFit = maxFloat(45, 100-float64(days-seed.idealMax)*12)
		}

		seasonFit := 62.0
		for _, m := range seed.bestMonths {
			if m == month {
				seasonFit = 100
				break
			}
		}

		mid := float64(seed.BudgetMinTHB+seed.BudgetMaxTHB) / 2
		budgetFit := 80.0
		overBudget := false
		if budgetPerPersonTHB > 0 {
			if mid <= budgetPerPersonTHB {
				budgetFit = 88 + minFloat(12, (budgetPerPersonTHB-mid)/budgetPerPersonTHB*40)
			} else {
				overBudget = true
				budgetFit = maxFloat(25, 100-(mid-budgetPerPersonTHB)/budgetPerPersonTHB*130)
			}
		}

		// On a short trip the flight is a bigger share of the holiday.
		flightPenalty := 0.0
		if days <= 4 {
			flightPenalty = seed.FlightHours * 2.2
		}

		fit := int(roundHalfUp(lengthFit*0.44 + seasonFit*0.28 + budgetFit*0.28 - flightPenalty))
		if fit < 1 {
			fit = 1
		}
		if fit > 100 {
			fit = 100
		}

		pill := fmt.Sprintf("%d วันไปได้", days)
		switch {
		case overBudget:
			pill = "เกินงบที่ตั้งไว้"
		case seasonFit == 100:
			pill = "ช่วงนี้สวยที่สุด"
		}

		reason := seed.reasonShort
		if days > seed.idealMax-1 {
			reason = seed.reasonLong
		}

		d := seed.Destination
		d.Fit = fit
		d.Pill = pill
		d.Reason = fmt.Sprintf("%s · งบ %s–%s บาท/คน",
			reason, thousands(seed.BudgetMinTHB), thousands(seed.BudgetMaxTHB))
		out = append(out, d)
	}

	sort.SliceStable(out, func(a, b int) bool { return out[a].Fit > out[b].Fit })
	if len(out) > 0 {
		out[0].Recommended = true
		out[0].Pill = "แนะนำสำหรับกลุ่มนี้"
	}
	return out
}

// FindDestination returns one entry of the catalogue by id.
func FindDestination(id string) (Destination, bool) {
	for _, seed := range destinationSeeds {
		if seed.ID == id {
			return seed.Destination, true
		}
	}
	return Destination{}, false
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func thousands(n int) string {
	s := fmt.Sprintf("%d", n)
	out := ""
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out += ","
		}
		out += string(r)
	}
	return out
}
