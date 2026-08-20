package main

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// The seed data is content, and content rots. These tests are the validator
// D0.2 asks for: they run in CI, so a bad row is caught when it is committed
// rather than when someone runs the importer against production.

func readPOICSV(t *testing.T) ([][]string, map[string]int) {
	t.Helper()

	f, err := os.Open(filepath.Join("data", "poi", "jp.csv"))
	if err != nil {
		t.Fatalf("open jp.csv: %v", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		t.Fatalf("read header: %v", err)
	}
	index, err := indexColumns(header, poiColumns)
	if err != nil {
		t.Fatalf("header: %v", err)
	}

	var rows [][]string
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read row: %v", err)
		}
		rows = append(rows, record)
	}
	return rows, index
}

func TestPOICSVParsesWithoutIssues(t *testing.T) {
	rows, index := readPOICSV(t)

	for i, record := range rows {
		if _, issues := parsePOI(record, index); len(issues) > 0 {
			t.Errorf("line %d (%s): %v", i+2, record[index["name_th"]], issues)
		}
	}
}

// D0.3 sets the bar at 300 points. Below that the AI has too thin a catalogue
// to plan a week from, and it fails in a way that looks like a model problem.
func TestPOICSVMeetsTheSeedTarget(t *testing.T) {
	rows, _ := readPOICSV(t)

	if len(rows) < 300 {
		t.Errorf("catalogue has %d points, D0.3 requires at least 300", len(rows))
	}
}

func TestPOICSVHasNoDuplicates(t *testing.T) {
	rows, index := readPOICSV(t)

	seen := map[string]int{}
	for i, record := range rows {
		key := record[index["name_th"]] + "|" + record[index["city"]]
		if first, dup := seen[key]; dup {
			t.Errorf("line %d duplicates line %d: %s", i+2, first, key)
			continue
		}
		seen[key] = i + 2
	}
}

// Every area must be a zone the planner knows, or the AI's day-grouping and the
// zone-hop validation rule both silently do nothing for those points.
func TestPOICSVAreasAreKnownZones(t *testing.T) {
	rows, index := readPOICSV(t)

	for i, record := range rows {
		area := record[index["area"]]
		if area == "" {
			continue
		}
		if _, ok := domain.ZoneByCode(area); !ok {
			t.Errorf("line %d: area %q is not in pkg/domain/zones.go", i+2, area)
		}
	}
}

func TestPOICSVCoversEveryPhase1Zone(t *testing.T) {
	rows, index := readPOICSV(t)

	found := map[string]int{}
	for _, record := range rows {
		found[record[index["area"]]]++
	}

	// The zones a Phase 1 trip can actually be planned in. A zone with no
	// points is a zone the planner will never choose.
	for _, zone := range []string{
		"tokyo_east", "tokyo_west", "tokyo_bay",
		"yokohama", "kamakura", "fuji", "kawagoe",
	} {
		if found[zone] < 5 {
			t.Errorf("zone %q has only %d points; needs at least 5 to plan a day", zone, found[zone])
		}
	}
}

func TestCharactersSeedIsValid(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("data", "characters.json"))
	if err != nil {
		t.Fatalf("read characters.json: %v", err)
	}

	var characters []models.Character
	if err := json.Unmarshal(raw, &characters); err != nil {
		t.Fatalf("parse characters.json: %v", err)
	}

	// D0.7 asks for 20.
	if len(characters) != 20 {
		t.Errorf("got %d characters, D0.7 specifies 20", len(characters))
	}

	seenID := map[int16]bool{}
	seenName := map[string]bool{}
	for _, c := range characters {
		// Ids are referenced by users.character_id, so a reused or shifted id
		// would silently change what somebody already picked.
		if c.ID == 0 {
			t.Errorf("character %q has no id", c.Name)
		}
		if seenID[c.ID] {
			t.Errorf("duplicate character id %d", c.ID)
		}
		seenID[c.ID] = true

		if c.Name == "" || c.Emoji == "" {
			t.Errorf("character %d is missing a name or emoji", c.ID)
		}
		if seenName[c.Name] {
			t.Errorf("duplicate character name %q", c.Name)
		}
		seenName[c.Name] = true
	}
}

// planTemplate mirrors the shape of data/templates/*.json.
type planTemplate struct {
	Key         string   `json:"key"`
	Name        string   `json:"name"`
	KeyDecision string   `json:"key_decision"`
	Summary     string   `json:"summary"`
	PartySize   int      `json:"party_size"`
	Cities      []string `json:"cities"`
	Pros        []string `json:"pros"`
	Cons        []string `json:"cons"`
	Days        []struct {
		DayIndex int    `json:"day_index"`
		Title    string `json:"title"`
		Theme    string `json:"theme"`
		Items    []struct {
			Type        string `json:"type"`
			Title       string `json:"title"`
			StartTime   string `json:"start_time"`
			DurationMin int    `json:"duration_min"`
			TravelMode  string `json:"travel_mode"`
			TravelMin   int    `json:"travel_min"`
		} `json:"items"`
	} `json:"days"`
}

func TestPlanTemplatesAreValid(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("data", "templates", "*.json"))
	if err != nil {
		t.Fatal(err)
	}

	// D0.5 asks for three starter itineraries.
	if len(paths) < 3 {
		t.Errorf("found %d templates, D0.5 requires 3", len(paths))
	}

	validTypes := map[string]bool{
		models.ItemTypePlace: true, models.ItemTypeFood: true, models.ItemTypeStay: true,
		models.ItemTypeTransport: true, models.ItemTypeFlight: true,
		models.ItemTypeFree: true, models.ItemTypeNote: true,
	}

	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}

			var tpl planTemplate
			if err := json.Unmarshal(raw, &tpl); err != nil {
				t.Fatalf("parse: %v", err)
			}

			if tpl.Key == "" || tpl.Name == "" {
				t.Error("template needs both a key and a name")
			}
			// The key decision is what makes a template arguable rather than
			// magic — the same rule the AI plans under (DEV_SPEC §1).
			if tpl.KeyDecision == "" {
				t.Error("template has no key_decision")
			}
			if len(tpl.Pros) == 0 || len(tpl.Cons) == 0 {
				t.Error("template must state both pros and cons")
			}
			if len(tpl.Days) == 0 {
				t.Fatal("template has no days")
			}

			for i, day := range tpl.Days {
				if day.DayIndex != i {
					t.Errorf("day %d has day_index %d; indexes must be contiguous from 0", i, day.DayIndex)
				}
				if day.Theme != "" {
					if _, ok := domain.ZoneByCode(day.Theme); !ok {
						t.Errorf("day %d theme %q is not a known zone", i, day.Theme)
					}
				}
				if len(day.Items) == 0 {
					t.Errorf("day %d has no items", i)
				}
				for j, item := range day.Items {
					if item.Title == "" {
						t.Errorf("day %d item %d has no title", i, j)
					}
					if !validTypes[item.Type] {
						t.Errorf("day %d item %d has unknown type %q", i, j, item.Type)
					}
				}
			}
		})
	}
}
