package domain

import "strings"

// Prep categories, mirrored by pkg/models/prep.go. Written out rather than
// imported: pkg/domain has no dependencies, and six string constants are a
// cheaper price for that than an import edge.
const (
	PrepDocument = "document"
	PrepPacking  = "packing"
	PrepBooking  = "booking"
	PrepMoney    = "money"
	PrepHealth   = "health"
	PrepOther    = "other"
)

// Country prep checklists (A8.3, extended to a second country in Phase 3).
//
// These are country templates, not a generic packing list: the whole value is
// in the item that catches people out — "Visit Japan Web" for Japan, "K-ETA"
// for Korea. A shared list of "passport, insurance, adapter" would be true
// everywhere and useful nowhere, so the common items are stated once and the
// country-specific ones are what each list actually leads with.

// PrepTemplateItem is one line of a checklist, in both languages the product
// speaks. The English is not a translation exercise: a Thai group planning
// with a non-Thai friend is exactly who a second language is for.
type PrepTemplateItem struct {
	TitleTH  string `json:"title_th"`
	TitleEN  string `json:"title_en"`
	Category string `json:"category"`
}

// Title picks the language. Anything other than "en" gets Thai, which is the
// product's first language and the safer default for a missing translation.
func (i PrepTemplateItem) Title(locale string) string {
	if strings.EqualFold(locale, "en") && i.TitleEN != "" {
		return i.TitleEN
	}
	return i.TitleTH
}

// prepCommon is what every trip abroad needs. Ordered by when a person
// actually does it: documents first because they have the longest lead time.
var prepCommon = []PrepTemplateItem{
	{"เช็กวันหมดอายุพาสปอร์ต (เหลือ > 6 เดือน)", "Check the passport expiry (more than 6 months left)", PrepDocument},
	{"ซื้อประกันเดินทาง", "Buy travel insurance", PrepHealth},
	{"ซื้อ eSIM / pocket wifi", "Buy an eSIM or pocket wifi", PrepBooking},
	{"จองที่พักให้ครบทุกคืน", "Book a room for every night", PrepBooking},
	{"เตรียมยาประจำตัว + ยาแก้หวัด", "Pack regular medication and something for a cold", PrepHealth},
	{"ตั้งกลุ่มแชร์ตำแหน่งไว้ใช้ตอนหลง", "Start a location-sharing group for when somebody gets lost", PrepOther},
}

// prepByCountry is what changes with the destination — the entry rules, the
// money, and the plug on the wall.
var prepByCountry = map[string][]PrepTemplateItem{
	"JP": {
		{"ลงทะเบียน Visit Japan Web ล่วงหน้า", "Register on Visit Japan Web before you fly", PrepDocument},
		{"แลกเงินเยน / เปิดบัตรที่กดเงินต่างประเทศได้", "Get yen, or a card that withdraws abroad", PrepMoney},
		{"ปลั๊กแปลง Type A + power bank", "Type A plug adapter and a power bank", PrepPacking},
		{"เตรียมเสื้อกันหนาว / ร่มพับ", "Warm layers and a folding umbrella", PrepPacking},
		{"เช็กว่าต้องซื้อ JR Pass / IC card ไหม", "Decide on a JR Pass, and pick up an IC card", PrepBooking},
	},
	"KR": {
		{"เช็ก K-ETA ว่าต้องยื่นไหม (ไทยยกเว้นเป็นช่วง ๆ)", "Check whether K-ETA applies — the Thai exemption comes and goes", PrepDocument},
		{"กรอก Q-CODE ด้านสุขภาพก่อนถึงสนามบิน", "Fill in the Q-CODE health form before landing", PrepDocument},
		{"แลกเงินวอน / เตรียมบัตรที่รูดได้ทุกที่", "Get won, and a card that works everywhere", PrepMoney},
		{"ปลั๊กแปลง Type C/F 220V", "Type C/F plug adapter, 220V", PrepPacking},
		{"เตรียมเสื้อกันลม — โซลลมแรงกว่าที่คิด", "Bring a windbreaker — Seoul is windier than it looks", PrepPacking},
		{"ซื้อบัตร T-money ไว้ขึ้นรถไฟ/รถเมล์", "Buy a T-money card for the subway and buses", PrepBooking},
	},
}

// PrepTemplateFor returns the checklist for a destination: the country's own
// items first, then the ones every trip needs.
//
// An unknown country still gets the common list. A group going somewhere this
// product has never heard of should get six useful lines, not an empty tab.
func PrepTemplateFor(country string) []PrepTemplateItem {
	code := strings.ToUpper(strings.TrimSpace(country))

	specific := prepByCountry[code]
	out := make([]PrepTemplateItem, 0, len(specific)+len(prepCommon))
	out = append(out, specific...)
	out = append(out, prepCommon...)
	return out
}

// PrepTemplateCountries is which destinations have a tailored list, for the
// admin screen and for anyone wondering what "supported" means here.
func PrepTemplateCountries() []string {
	out := make([]string, 0, len(prepByCountry))
	for code := range prepByCountry {
		out = append(out, code)
	}
	return out
}
