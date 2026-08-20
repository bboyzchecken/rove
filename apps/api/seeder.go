package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	bookingstore "github.com/bboyzchecken/rove/apps/api/pkg/store/booking"
	characterstore "github.com/bboyzchecken/rove/apps/api/pkg/store/character"
	poistore "github.com/bboyzchecken/rove/apps/api/pkg/store/poi"
)

// Seeding is idempotent by design (D0.2 / D0.7): rows are matched on their
// natural key and updated, so re-running after editing the CSV is the normal
// way to publish a content change.

// runSeed loads every seed dataset. `go run . seed pois` runs just one.
func runSeed(cfg core.Config, only string) {
	db, err := core.NewDatabase(cfg)
	if err != nil {
		logger.L().WithError(err).Fatal("connect mysql")
	}
	if err := core.Migrate(db); err != nil {
		logger.L().WithError(err).Fatal("migrate")
	}

	ctx := context.Background()
	steps := map[string]func(context.Context, *gorm.DB) error{
		"pois":       seedPOIs,
		"characters": seedCharacters,
		"partners":   seedPartners,
	}
	order := []string{"characters", "partners", "pois"}

	for _, name := range order {
		if only != "" && only != name {
			continue
		}
		if err := steps[name](ctx, db); err != nil {
			logger.L().WithError(err).Fatalf("seed %s", name)
		}
	}
	logger.L().Info("seed complete")
}

// --- POIs -------------------------------------------------------------------

// poiColumns is the CSV contract. A missing column is a hard error rather than
// a silently empty field, because a shifted column would corrupt the catalogue.
var poiColumns = []string{
	"name_th", "name_en", "name_ja", "city", "area", "category", "tags",
	"lat", "lng", "google_place_id", "open_hours", "closed_days",
	"avg_visit_min", "avg_cost_jpy", "cost_note", "tips", "image_url",
	"quality_score", "source",
}

func seedPOIs(ctx context.Context, db *gorm.DB) error {
	path := filepath.Join("data", "poi", "jp.csv")
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.L().Warnf("%s not found — nothing to seed (see DEV_SPEC D0.2)", path)
			return nil
		}
		return err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("read header: %w", err)
	}
	index, err := indexColumns(header, poiColumns)
	if err != nil {
		return err
	}

	store := poistore.New(db)
	var imported, skipped int
	problems := []string{}

	for line := 2; ; line++ {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("line %d: %w", line, err)
		}

		poi, issues := parsePOI(record, index)
		if len(issues) > 0 {
			skipped++
			problems = append(problems, fmt.Sprintf("line %d: %s", line, strings.Join(issues, "; ")))
			continue
		}

		// The natural key is the name, since most seed rows have no place id
		// yet — that arrives with the Google enrichment pass (D0.4).
		var existing models.POI
		err = db.WithContext(ctx).
			Where("name_th = ? AND city = ?", poi.NameTH, poi.City).
			First(&existing).Error
		if err == nil {
			poi.ID = existing.ID
			poi.CreatedAt = existing.CreatedAt
			// Never clobber enrichment with an empty CSV cell.
			if poi.GooglePlaceID == "" {
				poi.GooglePlaceID = existing.GooglePlaceID
			}
			if poi.Lat == nil {
				poi.Lat, poi.Lng = existing.Lat, existing.Lng
			}
			if err := store.Update(ctx, poi); err != nil {
				return fmt.Errorf("line %d: %w", line, err)
			}
		} else if err := store.Create(ctx, poi); err != nil {
			return fmt.Errorf("line %d: %w", line, err)
		}
		imported++
	}

	for _, p := range problems {
		logger.L().Warnf("poi csv %s", p)
	}
	total, _ := store.Count(ctx)
	logger.L().Infof("pois: %d imported, %d skipped, %d in db", imported, skipped, total)

	// D0.3 sets the Phase 0 bar at 300; falling under it means the AI has too
	// thin a catalogue to plan from, which is worth shouting about.
	if total < 300 {
		logger.L().Warnf("poi catalogue is below the 300-point target (D0.3): %d", total)
	}
	return nil
}

// parsePOI validates one row and returns every problem at once, so fixing a
// spreadsheet is one pass rather than one error per run.
func parsePOI(record []string, index map[string]int) (*models.POI, []string) {
	get := func(col string) string {
		i, ok := index[col]
		if !ok || i >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[i])
	}

	issues := []string{}
	name := get("name_th")
	if name == "" {
		name = get("name_en")
	}
	if name == "" {
		issues = append(issues, "ต้องมี name_th หรือ name_en")
	}

	city := strings.ToLower(get("city"))
	if city == "" {
		issues = append(issues, "ต้องมี city")
	}

	area := strings.ToLower(get("area"))
	if area != "" {
		if _, ok := domain.ZoneByCode(area); !ok {
			issues = append(issues, fmt.Sprintf("area %q ไม่มีใน pkg/domain/zones.go", area))
		}
	}

	poi := &models.POI{
		NameTH:        get("name_th"),
		NameEN:        get("name_en"),
		NameJA:        get("name_ja"),
		Country:       "JP",
		City:          city,
		Area:          area,
		Category:      strings.ToLower(get("category")),
		GooglePlaceID: get("google_place_id"),
		CostNote:      get("cost_note"),
		Tips:          get("tips"),
		ImageURL:      get("image_url"),
		IsActive:      true,
		Source:        orDefault(get("source"), "seed"),
	}
	if poi.NameTH == "" {
		poi.NameTH = name
	}

	if lat, lng, ok, err := parseLatLng(get("lat"), get("lng")); err != "" {
		issues = append(issues, err)
	} else if ok {
		poi.Lat, poi.Lng = &lat, &lng
	}

	if tags := splitList(get("tags")); len(tags) > 0 {
		poi.Tags = mustJSON(tags)
	}
	if hours := parseHours(get("open_hours")); len(hours) > 0 {
		poi.OpenHours = mustJSON(hours)
	}
	if closed := splitList(get("closed_days")); len(closed) > 0 {
		for _, d := range closed {
			if !validWeekday(d) {
				issues = append(issues, fmt.Sprintf("closed_days %q ต้องเป็นชื่อวันภาษาอังกฤษตัวเล็ก", d))
			}
		}
		poi.ClosedDays = mustJSON(closed)
	}

	if v := get("avg_visit_min"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 1440 {
			issues = append(issues, "avg_visit_min ต้องเป็นตัวเลข 0-1440")
		} else {
			poi.AvgVisitMin = n
		}
	}
	if v := get("avg_cost_jpy"); v != "" {
		n, err := strconv.ParseFloat(v, 64)
		if err != nil || n < 0 {
			issues = append(issues, "avg_cost_jpy ต้องเป็นตัวเลขไม่ติดลบ")
		} else {
			poi.AvgCostJPY = &n
		}
	}
	if v := get("quality_score"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 100 {
			issues = append(issues, "quality_score ต้องเป็น 0-100")
		} else {
			poi.QualityScore = n
		}
	}

	return poi, issues
}

// parseHours reads "mon-sun=09:00-17:00|sat=10:00-18:00" into a per-weekday map.
func parseHours(raw string) map[string]string {
	if raw == "" {
		return nil
	}
	out := map[string]string{}
	for _, part := range strings.Split(raw, "|") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		days, window := strings.ToLower(strings.TrimSpace(kv[0])), strings.TrimSpace(kv[1])
		if days == "mon-sun" || days == "daily" {
			for _, d := range weekdays {
				out[d] = window
			}
			continue
		}
		for _, d := range strings.Split(days, ",") {
			if d = strings.TrimSpace(d); validWeekday(d) {
				out[d] = window
			}
		}
	}
	return out
}

var weekdays = []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

func validWeekday(d string) bool {
	for _, w := range weekdays {
		if w == strings.ToLower(strings.TrimSpace(d)) {
			return true
		}
	}
	return false
}

func parseLatLng(latRaw, lngRaw string) (lat, lng float64, ok bool, problem string) {
	if latRaw == "" && lngRaw == "" {
		// Blank is legitimate: enrichment (D0.4) fills it in. A guessed
		// coordinate would silently corrupt every travel-time check.
		return 0, 0, false, ""
	}
	if latRaw == "" || lngRaw == "" {
		return 0, 0, false, "lat และ lng ต้องใส่คู่กัน"
	}
	lat, err := strconv.ParseFloat(latRaw, 64)
	if err != nil || lat < -90 || lat > 90 {
		return 0, 0, false, "lat ต้องอยู่ระหว่าง -90 ถึง 90"
	}
	lng, err = strconv.ParseFloat(lngRaw, 64)
	if err != nil || lng < -180 || lng > 180 {
		return 0, 0, false, "lng ต้องอยู่ระหว่าง -180 ถึง 180"
	}
	return lat, lng, true, ""
}

// --- characters -------------------------------------------------------------

func seedCharacters(ctx context.Context, db *gorm.DB) error {
	path := filepath.Join("data", "characters.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.L().Warnf("%s not found — nothing to seed (see DEV_SPEC D0.7)", path)
			return nil
		}
		return err
	}

	var characters []models.Character
	if err := json.Unmarshal(raw, &characters); err != nil {
		return fmt.Errorf("parse characters.json: %w", err)
	}

	store := characterstore.New(db)
	for i := range characters {
		if characters[i].ID == 0 {
			return fmt.Errorf("character %q has no id — ids are stable and referenced by users.character_id", characters[i].Name)
		}
		if err := store.Upsert(ctx, &characters[i]); err != nil {
			return err
		}
	}
	logger.L().Infof("characters: %d upserted", len(characters))
	return nil
}

// --- affiliate partners -----------------------------------------------------

// seedPartners writes the D0.6 registry. Templates use the placeholders
// pkg/services/affiliate understands: {target}, {affiliate_id}, {subid}.
//
// The ids themselves come from env (AFFILIATE_*), never from this file, so a
// partner row is safe to commit.
func seedPartners(ctx context.Context, db *gorm.DB) error {
	partners := []models.AffiliatePartner{
		{
			Key: "agoda", Name: "Agoda", Priority: 90, Enabled: true,
			ItemTypes:        mustJSON([]string{"stay"}),
			DeeplinkTemplate: "https://www.agoda.com/partners/partnersearch.aspx?cid={affiliate_id}&tag={subid}&city={destination}&checkIn={checkin}&checkOut={checkout}&adults={adults}",
			SubIDParam:       "tag",
			Notes:            "แข็งแรงที่สุดในเอเชีย คอมมิชชั่นดีสำหรับโรงแรมญี่ปุ่น",
		},
		{
			Key: "booking", Name: "Booking.com", Priority: 80, Enabled: true,
			ItemTypes:        mustJSON([]string{"stay"}),
			DeeplinkTemplate: "https://www.booking.com/searchresults.html?aid={affiliate_id}&label={subid}&ss={destination}&checkin={checkin}&checkout={checkout}&group_adults={adults}",
			SubIDParam:       "label",
			Notes:            "สำรองไว้เมื่อ Agoda ไม่มีที่พักในพื้นที่",
		},
		{
			Key: "klook", Name: "Klook", Priority: 90, Enabled: true,
			ItemTypes:        mustJSON([]string{"place", "transport", "flight"}),
			DeeplinkTemplate: "https://www.klook.com/search/?query={destination}&aid={affiliate_id}&aff_adid={subid}",
			SubIDParam:       "aff_adid",
			Notes:            "ตั๋วเข้าสถานที่และ JR Pass คนไทยคุ้นเคยที่สุด",
		},
		{
			Key: "kkday", Name: "KKday", Priority: 70, Enabled: true,
			ItemTypes:        mustJSON([]string{"place", "transport"}),
			DeeplinkTemplate: "https://www.kkday.com/th/product/productlist?keyword={destination}&cid={affiliate_id}&ud1={subid}",
			SubIDParam:       "ud1",
			Notes:            "บางกิจกรรมถูกกว่า Klook เทียบราคาก่อนแสดง",
		},
		{
			Key: "rentalcars", Name: "Rentalcars", Priority: 60, Enabled: true,
			ItemTypes:        mustJSON([]string{"transport"}),
			DeeplinkTemplate: "https://www.rentalcars.com/SearchResults.do?affiliateCode={affiliate_id}&adplat={subid}&location={destination}&puDay={checkin}",
			SubIDParam:       "adplat",
			Notes:            "ใช้เฉพาะทริปที่มีคนขับรถได้และมี IDP",
		},
		{
			Key: "airalo", Name: "Airalo eSIM", Priority: 50, Enabled: true,
			ItemTypes:        mustJSON([]string{"note", "free"}),
			DeeplinkTemplate: "https://www.airalo.com/japan-esim?rc={affiliate_id}&utm_content={subid}",
			SubIDParam:       "utm_content",
			Notes:            "เสนอในบล็อกเตรียมตัว ไม่ใช่บนรายการในแพลน",
		},
	}

	store := bookingstore.New(db)
	for i := range partners {
		if err := store.UpsertPartner(ctx, &partners[i]); err != nil {
			return err
		}
	}
	logger.L().Infof("affiliate partners: %d upserted", len(partners))
	return nil
}

// --- shared helpers ---------------------------------------------------------

func indexColumns(header []string, required []string) (map[string]int, error) {
	index := make(map[string]int, len(header))
	for i, h := range header {
		index[strings.TrimSpace(strings.ToLower(h))] = i
	}
	missing := []string{}
	for _, col := range required {
		if _, ok := index[col]; !ok {
			missing = append(missing, col)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("csv is missing columns: %s", strings.Join(missing, ", "))
	}
	return index, nil
}

// splitList accepts "a|b|c" or "a,b,c" so a spreadsheet export works either way.
func splitList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	sep := "|"
	if !strings.Contains(raw, "|") {
		sep = ","
	}
	out := []string{}
	for _, p := range strings.Split(raw, sep) {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func mustJSON(v any) datatypes.JSON {
	raw, err := json.Marshal(v)
	if err != nil {
		return datatypes.JSON("null")
	}
	return datatypes.JSON(raw)
}

func orDefault(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
