// Package prep builds the "before you fly" cards: weather, what to pack, the
// documents you need, and the rules that catch people out (DEV_SPEC M8).
//
// The packing list is rule-based rather than model-generated: a list that
// changes every time you open it is not a list anyone trusts. The AI's job is
// to add colour to the text, not to decide what goes in the bag.
package prep

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
)

type Service interface {
	// Generate rebuilds every system block for a trip. Custom blocks written by
	// members are untouched.
	Generate(ctx context.Context, trip *models.Trip, profiles []models.MemberProfile, itemTags []string) ([]models.PrepBlock, error)
}

type service struct {
	weather weather.Service
}

func New(w weather.Service) Service { return &service{weather: w} }

var Module = fx.Module("services.prep", fx.Provide(New))

// Tokyo, used for the trip-level forecast. Phase 1 is Japan-only and a
// city-level forecast is all a packing list needs.
const (
	tokyoLat = 35.6762
	tokyoLng = 139.6503
)

func (s *service) Generate(ctx context.Context, trip *models.Trip, profiles []models.MemberProfile, itemTags []string) ([]models.PrepBlock, error) {
	blocks := []models.PrepBlock{}
	sortOrder := 0
	next := func() int { sortOrder++; return sortOrder - 1 }

	forecasts := s.forecast(ctx, trip)
	if b, ok := weatherBlock(trip, forecasts, next()); ok {
		blocks = append(blocks, b)
	}
	blocks = append(blocks, packingBlock(trip, forecasts, itemTags, next()))
	blocks = append(blocks, docsBlock(trip, profiles, next()))
	blocks = append(blocks, rulesBlock(next()))

	return blocks, nil
}

func (s *service) forecast(ctx context.Context, trip *models.Trip) []weather.Forecast {
	if trip.StartDate == nil || trip.EndDate == nil {
		return nil
	}
	f, err := s.weather.Daily(ctx, tokyoLat, tokyoLng, *trip.StartDate, *trip.EndDate)
	if err != nil {
		return nil
	}
	return f
}

func weatherBlock(trip *models.Trip, forecasts []weather.Forecast, order int) (models.PrepBlock, bool) {
	if len(forecasts) == 0 {
		// Beyond the forecast horizon we say what season it is rather than
		// inventing a temperature.
		if trip.StartDate == nil {
			return models.PrepBlock{}, false
		}
		return models.PrepBlock{
			Type:        models.PrepWeather,
			Title:       "อากาศช่วงที่ไป",
			Trigger:     "season",
			ContentMD:   seasonNote(*trip.StartDate),
			SortOrder:   order,
			GeneratedBy: "system",
		}, true
	}

	var b strings.Builder
	b.WriteString("| วันที่ | ต่ำสุด | สูงสุด | โอกาสฝน | สภาพอากาศ |\n")
	b.WriteString("|---|---|---|---|---|\n")
	for _, f := range forecasts {
		fmt.Fprintf(&b, "| %s | %.0f°C | %.0f°C | %.0f%% | %s |\n",
			f.Date.Format("2 Jan"), f.TempMinC, f.TempMaxC, f.RainChance, f.Summary)
	}

	return models.PrepBlock{
		Type:        models.PrepWeather,
		Title:       "พยากรณ์อากาศ",
		Trigger:     "forecast",
		ContentMD:   b.String(),
		SortOrder:   order,
		GeneratedBy: "system",
	}, true
}

// TempBand groups a forecast into what it means for a suitcase.
type TempBand string

const (
	BandFreezing TempBand = "freezing" // below 5°C
	BandCold     TempBand = "cold"     // 5–15°C
	BandMild     TempBand = "mild"     // 15–24°C
	BandHot      TempBand = "hot"      // above 24°C
)

// BandFor returns the band for the coldest night and hottest day of a trip —
// packing has to cover both ends, not the average.
func BandFor(forecasts []weather.Forecast) (low, high TempBand) {
	if len(forecasts) == 0 {
		return BandMild, BandMild
	}
	minC, maxC := forecasts[0].TempMinC, forecasts[0].TempMaxC
	for _, f := range forecasts[1:] {
		if f.TempMinC < minC {
			minC = f.TempMinC
		}
		if f.TempMaxC > maxC {
			maxC = f.TempMaxC
		}
	}
	return bandOf(minC), bandOf(maxC)
}

func bandOf(c float64) TempBand {
	switch {
	case c < 5:
		return BandFreezing
	case c < 15:
		return BandCold
	case c < 24:
		return BandMild
	default:
		return BandHot
	}
}

var bandItems = map[TempBand][]string{
	BandFreezing: {"เสื้อโค้ทกันหนาว", "ฮีทเทค", "ถุงมือ + หมวกไหมพรม", "แผ่นแปะร้อน (คairo)"},
	BandCold:     {"เสื้อแจ็คเก็ตกันลม", "ฮีทเทคบาง", "ผ้าพันคอ"},
	BandMild:     {"เสื้อแขนยาวบาง", "เสื้อคลุมตัวนอก"},
	BandHot:      {"เสื้อผ้าระบายอากาศ", "หมวกกันแดด", "ครีมกันแดด"},
}

// tagItems maps what the group planned to do onto things to bring.
var tagItems = map[string][]string{
	"onsen":      {"ผ้าเช็ดตัวผืนเล็ก", "ยางรัดผม"},
	"theme_park": {"รองเท้าที่ใส่เดินได้ทั้งวัน", "พาวเวอร์แบงก์", "เสื้อกันฝนแบบพับได้"},
	"hiking":     {"รองเท้าผ้าใบพื้นหนา", "ขวดน้ำ"},
	"nature":     {"ยากันยุง"},
	"shopping":   {"กระเป๋าพับสำรอง", "พาสปอร์ตสำหรับ tax free"},
	"photo":      {"แบตเตอรี่กล้องสำรอง", "การ์ดความจำสำรอง"},
	"ski":        {"ถุงเท้ากันหนาว", "แว่นกันแดด"},
}

// alwaysItems are the ones people forget every single trip.
var alwaysItems = []string{
	"พาสปอร์ต (เหลืออายุเกิน 6 เดือน)",
	"ปลั๊กแปลง Type A",
	"พาวเวอร์แบงก์ (ถือขึ้นเครื่องเท่านั้น)",
	"ยาประจำตัว",
	"บัตรเครดิตที่เปิดใช้ต่างประเทศแล้ว",
	"เงินเยนสด (ร้านเล็กหลายที่ยังรับแต่เงินสด)",
}

func packingBlock(trip *models.Trip, forecasts []weather.Forecast, itemTags []string, order int) models.PrepBlock {
	low, high := BandFor(forecasts)

	seen := map[string]bool{}
	list := []string{}
	add := func(items []string) {
		for _, i := range items {
			if !seen[i] {
				seen[i] = true
				list = append(list, i)
			}
		}
	}

	add(alwaysItems)
	add(bandItems[low])
	if high != low {
		add(bandItems[high])
	}

	tags := append([]string(nil), itemTags...)
	sort.Strings(tags)
	for _, t := range tags {
		add(tagItems[strings.ToLower(t)])
	}
	if rainy(forecasts) {
		add([]string{"ร่มพับ"})
	}

	checklist := make([]models.ChecklistEntry, 0, len(list))
	for i, label := range list {
		checklist = append(checklist, models.ChecklistEntry{
			ID: fmt.Sprintf("pack-%d", i), Label: label,
		})
	}
	raw, _ := json.Marshal(checklist)

	return models.PrepBlock{
		Type:        models.PrepPacking,
		Title:       "ของที่ต้องเตรียม",
		Trigger:     string(low) + "/" + string(high),
		ContentMD:   "ติ๊กร่วมกันได้ทั้งกลุ่ม — ใครเตรียมแล้วคนอื่นเห็น",
		Checklist:   raw,
		SortOrder:   order,
		GeneratedBy: "system",
	}
}

func rainy(forecasts []weather.Forecast) bool {
	for _, f := range forecasts {
		if f.RainChance >= 40 {
			return true
		}
	}
	return false
}

func docsBlock(trip *models.Trip, profiles []models.MemberProfile, order int) models.PrepBlock {
	docs := []string{
		"พาสปอร์ต",
		"Visit Japan Web — ลงทะเบียนล่วงหน้าและเซฟ QR ไว้",
		"ประกันเดินทาง",
		"eSIM หรือ pocket wifi",
		"ตั๋วเครื่องบิน (ขาไป-ขากลับ)",
		"ที่อยู่ที่พักสำหรับกรอก ตม.",
	}

	// An international driving permit only matters if somebody is actually
	// driving, so the card does not nag groups taking the train.
	for _, p := range profiles {
		if p.CanDrive {
			docs = append(docs, "ใบขับขี่สากล (IDP) + ใบขับขี่ไทย")
			break
		}
	}

	checklist := make([]models.ChecklistEntry, 0, len(docs))
	for i, label := range docs {
		checklist = append(checklist, models.ChecklistEntry{
			ID: fmt.Sprintf("doc-%d", i), Label: label,
		})
	}
	raw, _ := json.Marshal(checklist)

	return models.PrepBlock{
		Type:        models.PrepDocs,
		Title:       "เอกสารที่ต้องมี",
		Trigger:     "always",
		ContentMD:   "เช็กให้ครบก่อนออกจากบ้าน",
		Checklist:   raw,
		SortOrder:   order,
		GeneratedBy: "system",
	}
}

func rulesBlock(order int) models.PrepBlock {
	return models.PrepBlock{
		Type:    models.PrepRule,
		Title:   "เรื่องที่คนไทยมักพลาดที่ญี่ปุ่น",
		Trigger: "jp",
		ContentMD: strings.Join([]string{
			"- **พาวเวอร์แบงก์ห้ามโหลดใต้ท้องเครื่อง** ต้องถือขึ้นเครื่องเท่านั้น",
			"- **ขยะไม่มีถังทิ้ง** ตามถนน เตรียมถุงเล็กไว้เก็บกลับที่พัก",
			"- **บนรถไฟไม่คุยโทรศัพท์** และเปิดโหมดปิดเสียง",
			"- **ร้านเล็กหลายร้านรับแต่เงินสด** อย่าพกแต่บัตร",
			"- **IC card (Suica/Pasmo)** ใช้ได้ทั้งรถไฟและร้านสะดวกซื้อ",
			"- **Tax free ต้องใช้พาสปอร์ตตัวจริง** ยอดขั้นต่ำ 5,000 เยนต่อร้าน",
			"- **สูบบุหรี่ต้องอยู่ในจุดที่กำหนด** เดินสูบบนถนนมีค่าปรับ",
		}, "\n"),
		SortOrder:   order,
		GeneratedBy: "system",
	}
}

func seasonNote(start time.Time) string {
	switch start.Month() {
	case time.December, time.January, time.February:
		return "ช่วงนี้เป็นฤดูหนาว โตเกียวราว 2–12°C กลางคืนหนาวจัด เตรียมเสื้อกันหนาวหนา ๆ"
	case time.March, time.April, time.May:
		return "ช่วงนี้เป็นฤดูใบไม้ผลิ ราว 10–22°C ซากุระบานปลายมีนาคมถึงต้นเมษายน อากาศเปลี่ยนเร็ว เตรียมเสื้อคลุม"
	case time.June, time.July, time.August:
		return "ช่วงนี้ร้อนและชื้น ราว 24–34°C มิถุนายนเป็นหน้าฝน (สึยุ) เตรียมร่มและเสื้อผ้าระบายอากาศ"
	default:
		return "ช่วงนี้เป็นฤดูใบไม้ร่วง ราว 12–24°C อากาศดีที่สุดของปี ใบไม้เปลี่ยนสีปลายพฤศจิกายน"
	}
}
