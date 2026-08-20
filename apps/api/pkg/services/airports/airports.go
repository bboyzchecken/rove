// Package airports is the worldwide airport index behind /api/v1/airports.
//
// A trip now starts from the airport it lands at rather than from a city typed
// by hand (M1 — W1.3): "NRT" is one place in one country, where "โซล อูเอโนะ"
// was two answers to two different questions. The index is the same set a
// flight-booking search offers — every airport with a IATA code, scheduled
// service and a large/medium classification, about 3.6k rows worldwide — and it
// is embedded rather than fetched so search works with no key, no quota and no
// network, in mock mode and live alike.
//
// Rebuild the data with `node scripts/gen-airports.mjs`.
package airports

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/data"
)

// Airport is one row of the index, already joined with its country names.
type Airport struct {
	IATA        string  `json:"iata"`
	Name        string  `json:"name"`
	NameTH      string  `json:"name_th,omitempty"`
	City        string  `json:"city"`
	CityTH      string  `json:"city_th,omitempty"`
	CountryCode string  `json:"country_code"`
	Country     string  `json:"country"`
	CountryTH   string  `json:"country_th"`
	Timezone    string  `json:"timezone"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Major       bool    `json:"major"`
}

// Service is what the handlers and the ticket parser call.
type Service interface {
	// Search ranks the index against a free-text query: a IATA code, a city, an
	// airport name or a country, in Thai or English.
	Search(query string, limit int) []Airport
	// Get returns one airport by IATA code, nil when it is not in the index.
	Get(iata string) *Airport
	// Count is what /readyz and the admin screen report.
	Count() int
}

var Module = uberfx.Module("services.airports", uberfx.Provide(New))

func New() Service { return loaded() }

/* ------------------------------------------------------------------ index -- */

// Row order in airports.json — kept in step with scripts/gen-airports.mjs.
const (
	colIATA = iota
	colName
	colCity
	colCountry
	colTZ
	colLarge
	colLat
	colLon
	colRank
)

type payload struct {
	Countries map[string][]string `json:"countries"`
	Thai      map[string][]string `json:"thai"`
	Airports  []json.RawMessage   `json:"airports"`
}

type entry struct {
	airport Airport
	rank    int
	// Lower-cased haystacks, built once: search runs on every keystroke.
	iata, name, city, country string
	nameTH, cityTH, countryTH string
}

type index struct {
	entries []entry
	byIATA  map[string]int
}

var (
	once   sync.Once
	shared *index
)

func loaded() *index {
	once.Do(func() { shared = parse(data.AirportsJSON) })
	return shared
}

func parse(raw []byte) *index {
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return &index{byIATA: map[string]int{}}
	}

	idx := &index{
		entries: make([]entry, 0, len(p.Airports)),
		byIATA:  make(map[string]int, len(p.Airports)),
	}

	for _, row := range p.Airports {
		var cols []any
		if err := json.Unmarshal(row, &cols); err != nil || len(cols) <= colRank {
			continue
		}

		iata := str(cols[colIATA])
		cc := str(cols[colCountry])
		names := p.Countries[cc]
		thai := p.Thai[iata]

		a := Airport{
			IATA:        iata,
			Name:        str(cols[colName]),
			City:        str(cols[colCity]),
			CountryCode: cc,
			Country:     at(names, 1),
			CountryTH:   at(names, 0),
			Timezone:    str(cols[colTZ]),
			Lat:         num(cols[colLat]),
			Lon:         num(cols[colLon]),
			Major:       num(cols[colLarge]) == 1,
			NameTH:      at(thai, 0),
			CityTH:      at(thai, 1),
		}

		idx.byIATA[iata] = len(idx.entries)
		idx.entries = append(idx.entries, entry{
			airport:   a,
			rank:      int(num(cols[colRank])),
			iata:      strings.ToLower(a.IATA),
			name:      strings.ToLower(a.Name),
			city:      strings.ToLower(a.City),
			country:   strings.ToLower(a.Country),
			nameTH:    a.NameTH,
			cityTH:    a.CityTH,
			countryTH: a.CountryTH,
		})
	}
	return idx
}

func (i *index) Count() int { return len(i.entries) }

func (i *index) Get(iata string) *Airport {
	pos, ok := i.byIATA[strings.ToUpper(strings.TrimSpace(iata))]
	if !ok {
		return nil
	}
	a := i.entries[pos].airport
	return &a
}

/* ----------------------------------------------------------------- search -- */

const (
	defaultLimit = 8
	maxLimit     = 25
)

// Search is a linear scan on purpose: 3.6k rows score in well under a
// millisecond, and an index that fits in a slice never goes stale against the
// embedded data it was built from.
func (i *index) Search(query string, limit int) []Airport {
	q := strings.ToLower(strings.Join(strings.Fields(query), " "))
	switch {
	case limit <= 0:
		limit = defaultLimit
	case limit > maxLimit:
		limit = maxLimit
	}

	// An empty query is the picker opening for the first time: answer with the
	// hubs rather than with nothing.
	if q == "" {
		out := make([]Airport, 0, limit)
		for _, e := range i.entries {
			if e.rank == 0 {
				break
			}
			if out = append(out, e.airport); len(out) == limit {
				break
			}
		}
		return out
	}

	type hit struct {
		score int
		pos   int
	}
	hits := make([]hit, 0, 64)

	for pos, e := range i.entries {
		if s := score(e, q); s > 0 {
			hits = append(hits, hit{score: s, pos: pos})
		}
	}

	sort.SliceStable(hits, func(a, b int) bool {
		if hits[a].score != hits[b].score {
			return hits[a].score > hits[b].score
		}
		// Same relevance: the busier airport is the one people meant.
		ea, eb := i.entries[hits[a].pos], i.entries[hits[b].pos]
		if ea.rank != eb.rank {
			return ea.rank > eb.rank
		}
		if ea.airport.Major != eb.airport.Major {
			return ea.airport.Major
		}
		return ea.iata < eb.iata
	})

	if len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]Airport, 0, len(hits))
	for _, h := range hits {
		out = append(out, i.entries[h.pos].airport)
	}
	return out
}

// score is the whole ranking policy: an exact code beats a city, a city beats
// an airport name, and a country only matches when nothing better does.
func score(e entry, q string) int {
	best := 0
	keep := func(s int) {
		if s > best {
			best = s
		}
	}

	switch {
	case e.iata == q:
		keep(1000)
	case strings.HasPrefix(e.iata, q):
		keep(700)
	}

	keep(match(e.city, q, 600))
	keep(match(e.cityTH, q, 600))
	keep(match(e.name, q, 480))
	keep(match(e.nameTH, q, 480))
	keep(match(e.country, q, 220))
	keep(match(e.countryTH, q, 220))

	return best
}

// match scores a haystack: full value, then start-of-string, then
// start-of-word, then anywhere. Everything else is not a match.
func match(haystack, q string, base int) int {
	if haystack == "" || q == "" {
		return 0
	}
	if haystack == q {
		return base + 120
	}
	if strings.HasPrefix(haystack, q) {
		return base + 60
	}
	at := strings.Index(haystack, q)
	if at < 0 {
		return 0
	}
	if haystack[at-1] == ' ' || haystack[at-1] == '-' {
		return base + 20
	}
	return base - 120
}

/* ------------------------------------------------------------------ utils -- */

func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) float64 {
	f, _ := v.(float64)
	return f
}

func at(list []string, i int) string {
	if i < len(list) {
		return list[i]
	}
	return ""
}
