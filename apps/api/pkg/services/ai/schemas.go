package ai

// PlanDraft is the exact shape the planner model must return (DEV_SPEC §6.4).
// Changing a field here means changing the prompt in prompts/ and bumping its
// version — the two are one contract.
type PlanDraft struct {
	Name        string   `json:"name"`
	KeyDecision string   `json:"key_decision"`
	Summary     string   `json:"summary"`
	Pros        []string `json:"pros"`
	Cons        []string `json:"cons"`
	Days        []Day    `json:"days"`

	Coverage      []CoverageRef `json:"coverage"`
	Rationales    []Rationale   `json:"rationales"`
	OpenQuestions []string      `json:"open_questions"`
}

type Day struct {
	Date  string `json:"date"`
	Title string `json:"title"`
	Theme string `json:"theme"`
	Items []Item `json:"items"`
}

type Item struct {
	Type        string  `json:"type"`
	POIRef      *POIRef `json:"poi_ref,omitempty"`
	Title       string  `json:"title"`
	Notes       string  `json:"notes"`
	StartTime   string  `json:"start_time"`
	EndTime     string  `json:"end_time"`
	DurationMin int     `json:"duration_min"`
	TravelMode  string  `json:"travel_mode"`
	TravelMin   int     `json:"travel_min"`
	TravelNote  string  `json:"travel_note"`
	Cost        *Cost   `json:"cost,omitempty"`
}

type POIRef struct {
	POIID string `json:"poi_id"`
	Name  string `json:"name"`
}

type Cost struct {
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
	Basis    string  `json:"basis"`
	Note     string  `json:"note"`
}

type CoverageRef struct {
	WishlistItemID string   `json:"wishlist_item_id"`
	Status         string   `json:"status"`
	Note           string   `json:"note"`
	ItemRefs       []string `json:"item_refs"`
}

type Rationale struct {
	Kind           string `json:"kind"` // cut | moved | chosen | added | warning
	Text           string `json:"text"`
	ItemRef        string `json:"item_ref"`
	WishlistItemID string `json:"wishlist_item_id"`
}

// ItemDiff is what refine returns — a patch, never a whole new plan, so the
// group can accept changes one by one.
type ItemDiff struct {
	Op       string         `json:"op"` // add | update | move | remove
	ItemID   string         `json:"item_id"`
	DayIndex int            `json:"day_index"`
	Position int            `json:"position"`
	Item     map[string]any `json:"item"`
	Reason   string         `json:"reason"`
}

// ParsedTicket backs the "paste your ticket" entry point (M1).
type ParsedTicket struct {
	Flights []struct {
		Direction  string `json:"direction"`
		Airline    string `json:"airline"`
		FlightNo   string `json:"flight_no"`
		DepAirport string `json:"dep_airport"`
		ArrAirport string `json:"arr_airport"`
		DepAt      string `json:"dep_at"`
		ArrAt      string `json:"arr_at"`
	} `json:"flights"`
	SuggestedTitle string `json:"suggested_title"`
	StartDate      string `json:"start_date"`
	EndDate        string `json:"end_date"`
}
