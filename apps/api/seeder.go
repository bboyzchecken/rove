package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	characterstore "github.com/bboyzchecken/rove/apps/api/pkg/store/character"
	poistore "github.com/bboyzchecken/rove/apps/api/pkg/store/poi"
)

// Seeding (D0.2 / D0.3 / D0.7).
//
// Both seeds are upserts keyed on a stable id, so `go run . seed` is safe to
// run on every deploy: it fills a fresh database and repairs a drifted one
// without touching anything a user created.

func runSeed(cfg core.Config) {
	db, err := core.NewDatabase(cfg)
	if err != nil {
		logger.L().WithError(err).Fatal("connect mysql")
	}
	if err := core.Migrate(db); err != nil {
		logger.L().WithError(err).Fatal("migrate")
	}

	ctx := context.Background()
	if err := seedCharacters(ctx, db); err != nil {
		logger.L().WithError(err).Fatal("seed characters")
	}
	if err := seedPOIs(ctx, db); err != nil {
		logger.L().WithError(err).Fatal("seed pois")
	}
	logger.L().Info("seed complete")
}

/* ----------------------------------------------------------- characters -- */

type characterSeed struct {
	ID        string `json:"id"`
	NameTH    string `json:"name_th"`
	ImageURL  string `json:"image_url"`
	Accent    string `json:"accent"`
	SortOrder int    `json:"sort_order"`
}

// seedCharacters loads data/characters.json. The ids are slugs shared with the
// web app's static asset list — both sides have to agree on "shiba" without a
// lookup, so the file is the contract.
func seedCharacters(ctx context.Context, db *gorm.DB) error {
	path := filepath.Join("data", "characters.json")

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.L().Warnf("%s not found — skipping characters (see DEV_SPEC D0.7)", path)
			return nil
		}
		return err
	}

	var seeds []characterSeed
	if err := json.Unmarshal(raw, &seeds); err != nil {
		return fmt.Errorf("characters.json: %w", err)
	}

	store := characterstore.New(db)
	for _, seed := range seeds {
		if seed.ID == "" || seed.NameTH == "" {
			continue
		}
		err := store.Upsert(ctx, &models.Character{
			ID:        seed.ID,
			NameTH:    seed.NameTH,
			ImageURL:  seed.ImageURL,
			Accent:    firstNonEmpty(seed.Accent, "primary"),
			SortOrder: seed.SortOrder,
			IsActive:  true,
		})
		if err != nil {
			return err
		}
	}

	n, _ := store.Count(ctx)
	logger.L().Infof("characters seeded: %d rows", n)
	return nil
}

/* ------------------------------------------------------------------ poi -- */

// poiColumns is the CSV contract. A header the importer does not recognise is
// ignored rather than guessed at; a missing required column fails loudly.
const (
	colID       = "id"
	colNameTH   = "name_th"
	colNameEN   = "name_en"
	colNameJA   = "name_ja"
	colCity     = "city"
	colArea     = "area"
	colCategory = "category"
	colTags     = "tags"
	colLat      = "lat"
	colLng      = "lng"
	colOpen     = "open_hours"
	colClosed   = "closed_days"
	colVisitMin = "avg_visit_min"
	colCostJPY  = "avg_cost_jpy"
	colTips     = "tips"
	colImage    = "image_url"
	colQuality  = "quality_score"
)

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
	reader.FieldsPerRecord = -1 // tolerate trailing empty columns

	rows, err := reader.ReadAll()
	if err != nil {
		return err
	}
	if len(rows) < 2 {
		logger.L().Warn("poi csv has no data rows")
		return nil
	}

	index := map[string]int{}
	for i, name := range rows[0] {
		index[strings.TrimSpace(strings.ToLower(name))] = i
	}
	for _, required := range []string{colID, colNameTH, colCity} {
		if _, ok := index[required]; !ok {
			return fmt.Errorf("poi csv: missing required column %q", required)
		}
	}

	get := func(row []string, col string) string {
		i, ok := index[col]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	store := poistore.New(db)
	imported, skipped := 0, 0

	for _, row := range rows[1:] {
		id := get(row, colID)
		name := get(row, colNameTH)
		if id == "" || name == "" {
			skipped++
			continue
		}

		poi := models.POI{
			NameTH:       name,
			NameEN:       get(row, colNameEN),
			NameJA:       get(row, colNameJA),
			Country:      "JP",
			City:         get(row, colCity),
			Area:         get(row, colArea),
			Category:     firstNonEmpty(get(row, colCategory), "อื่นๆ"),
			Tags:         jsonList(get(row, colTags)),
			Lat:          parseFloat(get(row, colLat)),
			Lng:          parseFloat(get(row, colLng)),
			OpenHours:    jsonHours(get(row, colOpen)),
			ClosedDays:   jsonList(get(row, colClosed)),
			AvgVisitMin:  parseInt(get(row, colVisitMin)),
			AvgCostJPY:   parseFloat(get(row, colCostJPY)),
			Tips:         get(row, colTips),
			ImageURL:     get(row, colImage),
			QualityScore: parseInt(get(row, colQuality)),
			Source:       "csv",
			IsActive:     true,
		}
		poi.ID = id

		if err := store.Upsert(ctx, &poi); err != nil {
			return fmt.Errorf("poi %s: %w", id, err)
		}
		imported++
	}

	total, _ := store.Count(ctx)
	logger.L().Infof("pois seeded: %d imported, %d skipped, %d in db", imported, skipped, total)
	return nil
}

/* ----------------------------------------------------------------- util -- */

// jsonList splits "a|b|c" into a JSON array. Pipes rather than commas because
// Thai POI tags contain commas often enough to matter.
func jsonList(value string) datatypes.JSON {
	items := make([]string, 0, 4)
	for _, part := range strings.Split(value, "|") {
		if p := strings.TrimSpace(part); p != "" {
			items = append(items, p)
		}
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return datatypes.JSON("[]")
	}
	return datatypes.JSON(raw)
}

// jsonHours stores the single opening-hours string under "all". The per-weekday
// shape stays available for the Google enrichment (D0.4) to fill in later.
func jsonHours(value string) datatypes.JSON {
	if strings.TrimSpace(value) == "" {
		return datatypes.JSON("{}")
	}
	raw, err := json.Marshal(map[string]string{"all": strings.TrimSpace(value)})
	if err != nil {
		return datatypes.JSON("{}")
	}
	return datatypes.JSON(raw)
}

func parseFloat(value string) *float64 {
	if value == "" {
		return nil
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &f
}

func parseInt(value string) int {
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return n
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
