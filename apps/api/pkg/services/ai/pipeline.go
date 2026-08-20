package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
)

// Pipeline is the ordered set of steps that turns a trip + wishlists into a
// persisted plan. Each step is separately testable and separately retryable.
//
//	buildFrame  anchors: dates, party size, cities, zone per day
//	generate    -> PlanDraft (schemas.go)
//	validate    pkg/domain.ValidatePlan — pure, no model involved
//	repair      feed issues back to the model, at most 2 loops
//	explain     -> rationales + open questions
//
// The steps are deliberately not collapsed into one prompt: validation is
// deterministic Go code, and the model never gets to mark its own homework.
type Pipeline interface {
	Generate(ctx context.Context, in GenerateInput, onStep StepFunc) (*DraftResult, error)
	ParseTicket(ctx context.Context, text string) (*ParsedTicket, error)
}

// StepFunc reports progress so the SSE stream can show what is happening.
// `progress` is 0..1.
type StepFunc func(step string, progress float64)

type GenerateInput struct {
	Trip    models.Trip
	Members []models.User
	Wishes  []models.WishlistItem
	Brief   string
	Pace    string // relaxed | balanced | packed
}

type DraftItem struct {
	Type      string   `json:"type"`
	Title     string   `json:"title"`
	Area      string   `json:"area"`
	StartTime string   `json:"start_time"`
	EndTime   string   `json:"end_time"`
	CostJPY   float64  `json:"cost_jpy"`
	TravelMin int      `json:"travel_minutes"`
	TravelMode string  `json:"travel_mode"`
	OpenHours string   `json:"open_hours"`
	POIID     *string  `json:"poi_id"`
	ForUsers  []string `json:"for_user_ids"`
	Note      string   `json:"note"`
	Bookable  bool     `json:"bookable"`
}

type DraftDay struct {
	Date        time.Time   `json:"date"`
	Label       string      `json:"label"`
	City        string      `json:"city"`
	WeatherIcon string      `json:"weather_icon"`
	WeatherHigh float64     `json:"weather_high"`
	WeatherLow  float64     `json:"weather_low"`
	WeatherText string      `json:"weather_text"`
	Items       []DraftItem `json:"items"`
}

type DraftResult struct {
	Days          []DraftDay `json:"days"`
	Rationales    []string   `json:"rationales"`
	OpenQuestions []string   `json:"open_questions"`
	Usage         Usage      `json:"-"`
	Simulated     bool       `json:"simulated"`
}

type pipeline struct {
	cfg     core.Config
	client  Client
	pois    models.POIStore
	weather weather.Service
}

func NewPipeline(
	cfg core.Config,
	client Client,
	pois models.POIStore,
	wx weather.Service,
) Pipeline {
	return &pipeline{cfg: cfg, client: client, pois: pois, weather: wx}
}

var _ = uberfx.Provide

// itemsPerDay is how many stops a day gets at each pace. Packed is not
// "everything we can fit": a day with more than five stops stops being a
// holiday and starts being a schedule.
var itemsPerDay = map[string]int{"relaxed": 3, "balanced": 4, "packed": 5}

func (p *pipeline) Generate(ctx context.Context, in GenerateInput, onStep StepFunc) (*DraftResult, error) {
	step := func(label string, progress float64) {
		if onStep != nil {
			onStep(label, progress)
		}
	}

	step("อ่านที่อยากไปของทุกคน", 0.1)
	frame, err := p.buildFrame(ctx, in)
	if err != nil {
		return nil, err
	}

	step("จับกลุ่มสถานที่ตามโซน", 0.3)

	var result *DraftResult
	if p.cfg.UseMock() || p.cfg.Anthropic.ApiKey == "" {
		// The simulated path builds a real plan out of real POIs — it just does
		// the arranging in Go instead of asking a model. Everything downstream
		// (validation, persistence, coverage) runs exactly as it does live.
		result = p.simulate(frame)
		result.Simulated = true
	} else {
		step("ให้ AI จัดวันและมื้ออาหาร", 0.45)
		result, err = p.generateWithModel(ctx, frame)
		if err != nil {
			logger.L().WithError(err).Warn("ai: model draft failed, falling back to the deterministic planner")
			result = p.simulate(frame)
			result.Simulated = true
		}
	}

	step("เช็กเวลาเปิด-ปิดและเวลาเดินทาง", 0.7)
	result.Days = p.applyValidation(result.Days, in)

	step("ดูพยากรณ์อากาศรายวัน", 0.85)
	p.attachWeather(ctx, result.Days, frame)

	step("เขียนเหตุผลกำกับแต่ละวัน", 0.95)
	if len(result.Rationales) == 0 {
		result.Rationales = explain(result.Days, in)
	}
	if len(result.OpenQuestions) == 0 {
		result.OpenQuestions = openQuestions(in)
	}

	step("เสร็จแล้ว", 1)
	return result, nil
}

/* ------------------------------------------------------------ buildFrame -- */

// frame is everything the planner needs that is *not* negotiable: the dates,
// who is going, which cities, and the POI shortlist their wishes point at.
type frame struct {
	start     time.Time
	days      int
	partySize int
	cities    []string
	pace      string
	brief     string
	wishes    []models.WishlistItem
	// candidates are POIs pulled from our own table, grouped by city.
	candidates map[string][]models.POI
	memberIDs  []string
}

func (p *pipeline) buildFrame(ctx context.Context, in GenerateInput) (*frame, error) {
	if in.Trip.StartDate == nil || in.Trip.EndDate == nil {
		return nil, fmt.Errorf("ทริปนี้ยังไม่มีวันเดินทาง — ล็อควันก่อนถึงจะร่างแพลนได้")
	}

	days := domain.DaysBetween(*in.Trip.StartDate, *in.Trip.EndDate)
	if days < 1 {
		days = 1
	}

	var cities []string
	if len(in.Trip.DestinationCities) > 0 {
		_ = json.Unmarshal(in.Trip.DestinationCities, &cities)
	}
	if len(cities) == 0 {
		cities = []string{"โตเกียว"}
	}

	pace := in.Pace
	if _, ok := itemsPerDay[pace]; !ok {
		pace = "balanced"
	}

	f := &frame{
		start:      domain.Day(*in.Trip.StartDate),
		days:       days,
		partySize:  in.Trip.PartySize,
		cities:     cities,
		pace:       pace,
		brief:      in.Brief,
		wishes:     in.Wishes,
		candidates: map[string][]models.POI{},
	}
	for _, m := range in.Members {
		f.memberIDs = append(f.memberIDs, m.ID)
	}

	// Wishes first: a POI someone actually asked for outranks anything the
	// catalogue would have suggested on its own.
	seen := map[string]bool{}
	for _, wish := range in.Wishes {
		if wish.Kind == models.WishAvoid {
			continue
		}
		found, err := p.pois.Search(ctx, wish.Title, "", "", 3)
		if err != nil {
			continue
		}
		for _, poi := range found {
			if seen[poi.ID] {
				continue
			}
			seen[poi.ID] = true
			f.candidates[poi.City] = append(f.candidates[poi.City], poi)
		}
	}

	// Then fill each city up to a workable shortlist.
	for _, city := range cities {
		need := f.days*itemsPerDay[pace] + 4
		if len(f.candidates[city]) >= need {
			continue
		}
		found, err := p.pois.Search(ctx, "", city, "", need)
		if err != nil {
			continue
		}
		for _, poi := range found {
			if seen[poi.ID] {
				continue
			}
			seen[poi.ID] = true
			f.candidates[city] = append(f.candidates[city], poi)
		}
	}

	return f, nil
}

/* -------------------------------------------------------------- simulate -- */

// simulate lays out the shortlist without a model: one anchor in the morning,
// lunch, one or two in the afternoon, dinner. It is what MOCK_MODE runs, and
// what a model failure falls back to — a plan that is merely sensible is far
// better than an error page.
func (p *pipeline) simulate(f *frame) *DraftResult {
	perDay := itemsPerDay[f.pace]
	result := &DraftResult{Days: make([]DraftDay, 0, f.days)}

	// Cities are visited in order, splitting the trip evenly between them.
	cityForDay := func(index int) string {
		if len(f.cities) == 0 {
			return ""
		}
		slot := index * len(f.cities) / f.days
		if slot >= len(f.cities) {
			slot = len(f.cities) - 1
		}
		return f.cities[slot]
	}

	used := map[string]bool{}
	wishOwners := wishOwnersByTitle(f.wishes)

	for i := 0; i < f.days; i++ {
		city := cityForDay(i)
		day := DraftDay{
			Date:  f.start.AddDate(0, 0, i),
			Label: fmt.Sprintf("วันที่ %d", i+1),
			City:  city,
		}

		pool := f.candidates[city]
		if len(pool) == 0 {
			for _, list := range f.candidates {
				pool = append(pool, list...)
			}
		}

		clock := 9 * 60
		placed := 0

		for _, poi := range pool {
			if placed >= perDay {
				break
			}
			if used[poi.ID] {
				continue
			}
			used[poi.ID] = true

			visit := poi.AvgVisitMin
			if visit <= 0 {
				visit = 90
			}
			cost := 0.0
			if poi.AvgCostJPY != nil {
				cost = *poi.AvgCostJPY
			}

			poiID := poi.ID
			item := DraftItem{
				Type:       models.ItemPOI,
				Title:      poi.NameTH,
				Area:       poi.Area,
				StartTime:  clockString(clock),
				EndTime:    clockString(clock + visit),
				CostJPY:    cost,
				TravelMin:  25,
				TravelMode: "train",
				POIID:      &poiID,
				ForUsers:   wishOwners[domain.NormalizeName(poi.NameTH)],
				Bookable:   strings.Contains(poi.Tips, "จอง") || cost > 2000,
			}
			day.Items = append(day.Items, item)
			clock += visit + 25
			placed++

			// A meal after the late-morning stop, and another in the evening.
			if clock >= 12*60 && clock < 14*60 {
				day.Items = append(day.Items, DraftItem{
					Type:       models.ItemMeal,
					Title:      "ข้าวเที่ยงแถว" + orDefault(poi.Area, city),
					Area:       orDefault(poi.Area, city),
					StartTime:  clockString(clock),
					EndTime:    clockString(clock + 60),
					CostJPY:    1500,
					TravelMin:  15,
					TravelMode: "walk",
				})
				clock += 75
			}
		}

		if clock < 18*60 {
			clock = 18 * 60
		}
		day.Items = append(day.Items, DraftItem{
			Type:      models.ItemMeal,
			Title:     "ข้าวเย็นแถว" + city,
			Area:      city,
			StartTime: clockString(clock),
			EndTime:   clockString(clock + 90),
			CostJPY:   2200,
		})

		result.Days = append(result.Days, day)
	}

	return result
}

func wishOwnersByTitle(wishes []models.WishlistItem) map[string][]string {
	out := map[string][]string{}
	for _, w := range wishes {
		if w.Kind == models.WishAvoid {
			continue
		}
		key := domain.NormalizeName(w.Title)
		out[key] = append(out[key], w.UserID)
	}
	return out
}

/* ----------------------------------------------------------- model path -- */

const plannerSystem = `คุณคือผู้ช่วยวางแผนทริปของ ROVE สำหรับกลุ่มเพื่อนชาวไทย

กติกาที่ห้ามฝ่าฝืน:
- ตอบกลับเป็น JSON เท่านั้น ตาม schema ที่กำหนด ห้ามมีข้อความอื่นนอก JSON
- ห้ามแต่งเวลาเปิด-ปิด ราคา หรือเวลาเดินทางเอง ถ้าไม่มีข้อมูลให้เว้นว่าง
- ใช้เฉพาะสถานที่จากรายการที่ให้มา ถ้าจำเป็นต้องเพิ่มให้ใส่ poi_id เป็น null
- เวลาเป็นเวลาท้องถิ่นปลายทาง รูปแบบ "HH:mm"
- เขียนชื่อและโน้ตเป็นภาษาไทย
- อย่าจัดวันจนแน่นเกินไป เผื่อเวลาเดินทางและเวลาพักเสมอ`

func (p *pipeline) generateWithModel(ctx context.Context, f *frame) (*DraftResult, error) {
	prompt := buildPrompt(f)

	var lastErr error
	// Two attempts: the second one is told exactly what was wrong with the
	// first. A third would cost more than it is worth (A4.6).
	for attempt := 0; attempt < 2; attempt++ {
		msgs := []Message{{Role: "user", Content: prompt}}
		if lastErr != nil {
			msgs = append(msgs, Message{
				Role:    "user",
				Content: "ร่างก่อนหน้าใช้ไม่ได้เพราะ: " + lastErr.Error() + " — กรุณาส่ง JSON ใหม่ให้ถูก schema",
			})
		}

		res, err := p.client.Complete(ctx, p.cfg.Anthropic.ModelPlanner, plannerSystem, msgs, p.cfg.Anthropic.MaxTokens)
		if err != nil {
			return nil, err
		}
		if res.Simulated || strings.TrimSpace(res.Text) == "" {
			return nil, fmt.Errorf("ai: empty completion")
		}

		draft, err := parseDraft(res.Text, f)
		if err != nil {
			lastErr = err
			continue
		}
		draft.Usage = res.Usage
		return draft, nil
	}

	return nil, lastErr
}

func buildPrompt(f *frame) string {
	var b strings.Builder

	fmt.Fprintf(&b, "ทริป %d วัน เริ่ม %s\n", f.days, f.start.Format("2006-01-02"))
	fmt.Fprintf(&b, "ไปกัน %d คน เมือง: %s\n", f.partySize, strings.Join(f.cities, ", "))
	fmt.Fprintf(&b, "จังหวะการเที่ยว: %s (ประมาณ %d ที่ต่อวัน)\n\n", f.pace, itemsPerDay[f.pace])

	if f.brief != "" {
		fmt.Fprintf(&b, "สิ่งที่กลุ่มขอเพิ่ม: %s\n\n", f.brief)
	}

	b.WriteString("ที่อยากไปของสมาชิก:\n")
	for _, w := range f.wishes {
		label := map[string]string{"must": "ต้องไป", "nice": "ไปได้ก็ดี", "avoid": "ไม่เอา"}[w.Kind]
		fmt.Fprintf(&b, "- [%s] %s (ของ %s)\n", label, w.Title, w.UserID)
	}

	b.WriteString("\nสถานที่ที่เลือกได้ (ใช้ poi_id นี้เท่านั้น):\n")
	for city, pois := range f.candidates {
		fmt.Fprintf(&b, "เมือง %s:\n", city)
		for _, poi := range pois {
			cost := 0.0
			if poi.AvgCostJPY != nil {
				cost = *poi.AvgCostJPY
			}
			fmt.Fprintf(&b, "  - id=%s | %s | ย่าน %s | ใช้เวลา %d นาที | ราคา %.0f เยน\n",
				poi.ID, poi.NameTH, poi.Area, poi.AvgVisitMin, cost)
		}
	}

	b.WriteString(`
ส่งกลับ JSON รูปแบบนี้:
{"days":[{"date":"YYYY-MM-DD","label":"วันที่ 1","city":"โตเกียว","items":[
 {"type":"poi|meal|transport|stay|free","title":"...","area":"...","start_time":"09:00","end_time":"11:00",
  "cost_jpy":0,"travel_minutes":20,"travel_mode":"train|walk|bus|car","poi_id":"...หรือ null","note":""}]}],
 "rationales":["เหตุผลที่จัดแบบนี้"],"open_questions":["คำถามกลับถึงกลุ่ม"]}`)

	return b.String()
}

// parseDraft is strict about structure and forgiving about wrapping: models
// like to put JSON in a fenced block, and rejecting that would fail a draft
// that is otherwise perfectly good.
func parseDraft(text string, f *frame) (*DraftResult, error) {
	raw := strings.TrimSpace(text)
	if start := strings.Index(raw, "{"); start > 0 {
		raw = raw[start:]
	}
	if end := strings.LastIndex(raw, "}"); end >= 0 && end < len(raw)-1 {
		raw = raw[:end+1]
	}

	var parsed struct {
		Days []struct {
			Date  string      `json:"date"`
			Label string      `json:"label"`
			City  string      `json:"city"`
			Items []DraftItem `json:"items"`
		} `json:"days"`
		Rationales    []string `json:"rationales"`
		OpenQuestions []string `json:"open_questions"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, fmt.Errorf("JSON ไม่ถูกต้อง: %w", err)
	}
	if len(parsed.Days) == 0 {
		return nil, fmt.Errorf("ไม่มีวันในร่าง")
	}

	known := map[string]bool{}
	for _, list := range f.candidates {
		for _, poi := range list {
			known[poi.ID] = true
		}
	}

	out := &DraftResult{
		Rationales:    parsed.Rationales,
		OpenQuestions: parsed.OpenQuestions,
	}

	for i, day := range parsed.Days {
		date, err := time.Parse("2006-01-02", day.Date)
		if err != nil {
			date = f.start.AddDate(0, 0, i)
		}

		items := make([]DraftItem, 0, len(day.Items))
		for _, item := range day.Items {
			// A POI the model invented is kept as free text rather than being
			// written back as if it were catalogued.
			if item.POIID != nil && !known[*item.POIID] {
				item.POIID = nil
			}
			if item.StartTime == "" {
				continue
			}
			items = append(items, item)
		}

		out.Days = append(out.Days, DraftDay{
			Date:  domain.Day(date),
			Label: orDefault(day.Label, fmt.Sprintf("วันที่ %d", i+1)),
			City:  day.City,
			Items: items,
		})
	}

	return out, nil
}

/* ------------------------------------------------------------- validate -- */

// applyValidation runs the deterministic checks and writes the warnings onto
// the draft, so the group sees the same flags whether the plan came from the
// model or from the fallback planner.
func (p *pipeline) applyValidation(days []DraftDay, in GenerateInput) []DraftDay {
	items := make([]domain.ValidateItem, 0)
	index := map[string][2]int{}

	for di, day := range days {
		for ii, item := range day.Items {
			id := fmt.Sprintf("d%di%d", di, ii)
			index[id] = [2]int{di, ii}
			items = append(items, domain.ValidateItem{
				ID:        id,
				DayIndex:  di + 1,
				Title:     item.Title,
				StartTime: item.StartTime,
				EndTime:   item.EndTime,
				OpenHours: item.OpenHours,
				TravelMin: item.TravelMin,
			})
		}
	}

	musts := make([]string, 0)
	for _, w := range in.Wishes {
		if w.Kind == models.WishMust {
			musts = append(musts, w.Title)
		}
	}

	issues := domain.ValidatePlan(domain.ValidateInput{Items: items, MustWishes: musts})
	for id, warning := range domain.WarningsByItem(issues) {
		if pos, ok := index[id]; ok {
			days[pos[0]].Items[pos[1]].Note = joinNote(days[pos[0]].Items[pos[1]].Note, warning)
		}
	}
	return days
}

func joinNote(note, warning string) string {
	if note == "" {
		return warning
	}
	return note + " · " + warning
}

/* --------------------------------------------------------------- weather -- */

func (p *pipeline) attachWeather(ctx context.Context, days []DraftDay, f *frame) {
	if len(days) == 0 {
		return
	}

	// One call for the whole trip rather than one per day.
	lat, lng := 35.6762, 139.6503 // Tokyo, the Phase 1 default
	for _, list := range f.candidates {
		for _, poi := range list {
			if poi.Lat != nil && poi.Lng != nil {
				lat, lng = *poi.Lat, *poi.Lng
				break
			}
		}
		break
	}

	forecasts, err := p.weather.Daily(ctx, lat, lng, days[0].Date, days[len(days)-1].Date)
	if err != nil {
		return
	}

	byDate := map[string]weather.Forecast{}
	for _, f := range forecasts {
		byDate[f.Date.Format("2006-01-02")] = f
	}

	for i := range days {
		f, ok := byDate[days[i].Date.Format("2006-01-02")]
		if !ok {
			continue
		}
		days[i].WeatherHigh = f.TempMaxC
		days[i].WeatherLow = f.TempMinC
		days[i].WeatherText = f.Summary
		days[i].WeatherIcon = weather.Icon(f)
	}
}

/* --------------------------------------------------------------- explain -- */

// explain writes the "ทำไมจัดแบบนี้" lines from the plan itself. When the model
// produced its own, those win — these are the floor, not the ceiling.
func explain(days []DraftDay, in GenerateInput) []string {
	out := make([]string, 0, 4)
	if len(days) == 0 {
		return out
	}

	early := ""
	for _, day := range days {
		for _, item := range day.Items {
			if item.StartTime < "09:00" && item.Type == models.ItemPOI {
				early = item.Title
				break
			}
		}
		if early != "" {
			break
		}
	}
	if early != "" {
		out = append(out, fmt.Sprintf("จัด \"%s\" ไว้เช้าตรู่ เพราะช่วงสายคนเยอะจนถ่ายรูปแทบไม่ได้", early))
	}

	byMember := map[string]int{}
	for _, day := range days {
		for _, item := range day.Items {
			for _, id := range item.ForUsers {
				byMember[id]++
			}
		}
	}
	names := map[string]string{}
	for _, m := range in.Members {
		names[m.ID] = m.DisplayName
	}
	ids := make([]string, 0, len(byMember))
	for id := range byMember {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if name, ok := names[id]; ok {
			out = append(out, fmt.Sprintf("แพลนนี้มีของที่%sอยากไป %d อย่าง", name, byMember[id]))
		}
	}

	total := 0
	for _, day := range days {
		total += len(day.Items)
	}
	out = append(out, fmt.Sprintf("ทั้งทริป %d วัน %d รายการ เฉลี่ยวันละ %d — เผื่อเวลาเดินทางไว้ทุกช่วงแล้ว",
		len(days), total, total/len(days)))

	return out
}

func openQuestions(in GenerateInput) []string {
	out := make([]string, 0, 3)

	missing := 0
	for _, m := range in.Members {
		has := false
		for _, w := range in.Wishes {
			if w.UserID == m.ID {
				has = true
				break
			}
		}
		if !has {
			missing++
			out = append(out, fmt.Sprintf("%s ยังไม่ได้ใส่ที่อยากไป — รอก่อน หรือให้ร่างไปก่อนแล้วค่อยปรับ?", m.DisplayName))
		}
	}

	if in.Trip.BudgetPerPersonTHB > 0 {
		out = append(out, "งบที่ตั้งไว้พอไหม หรืออยากให้ตัดบางอย่างออกเพื่อลดค่าใช้จ่าย?")
	}
	out = append(out, "อยากได้วันไหนเป็นวันพักแบบไม่ต้องตื่นเช้าไหม?")

	if missing == 0 && len(out) > 3 {
		out = out[:3]
	}
	return out
}

/* ---------------------------------------------------------- parse ticket -- */

// ParseTicket reads a pasted booking e-mail. In mock mode — and whenever the
// model is unavailable — it falls back to a regex that handles the shape
// airline confirmations actually use, which is enough to reach a trip frame.
func (p *pipeline) ParseTicket(ctx context.Context, text string) (*ParsedTicket, error) {
	if p.cfg.UseMock() || p.cfg.Anthropic.ApiKey == "" {
		return parseTicketHeuristic(text), nil
	}

	res, err := p.client.Complete(ctx, p.cfg.Anthropic.ModelFast, ticketSystem,
		[]Message{{Role: "user", Content: text}}, 1500)
	if err != nil || res.Simulated || strings.TrimSpace(res.Text) == "" {
		return parseTicketHeuristic(text), nil
	}

	raw := strings.TrimSpace(res.Text)
	if start := strings.Index(raw, "{"); start > 0 {
		raw = raw[start:]
	}
	if end := strings.LastIndex(raw, "}"); end >= 0 && end < len(raw)-1 {
		raw = raw[:end+1]
	}

	var out ParsedTicket
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return parseTicketHeuristic(text), nil
	}
	return &out, nil
}

const ticketSystem = `อ่านอีเมลยืนยันตั๋วเครื่องบิน แล้วตอบกลับเป็น JSON เท่านั้น:
{"flights":[{"direction":"out|back","airline":"","flight_no":"","dep_airport":"","arr_airport":"","dep_at":"YYYY-MM-DDTHH:mm","arr_at":"YYYY-MM-DDTHH:mm"}],
 "suggested_title":"","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}
ถ้าอ่านไม่ออกให้ส่ง flights เป็น []`

/* ----------------------------------------------------------------- util -- */

func clockString(minutes int) string {
	minutes %= 24 * 60
	return fmt.Sprintf("%02d:%02d", minutes/60, minutes%60)
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
