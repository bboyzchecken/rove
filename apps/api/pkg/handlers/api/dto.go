package api

import (
	"encoding/json"
	"time"

	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Response DTOs. These are the wire contract the web app's
// `lib/data/live/dto.ts` mirrors field for field — snake_case, no renaming in
// transit. Nothing here may leak a column the client has no business seeing.

/* ------------------------------------------------------------------ util -- */

func dateString(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func jsonStrings(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}

// toJSONRaw adapts GORM's datatypes.JSON to encoding/json's RawMessage — the
// two are the same bytes, and every DTO helper speaks the latter.
func toJSONRaw(v datatypes.JSON) json.RawMessage { return json.RawMessage(v) }

func toJSON(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return raw
}

func floatPtr(f float64) *float64 { return &f }

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

/* ------------------------------------------------------------------ trip -- */

type tripDTO struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Slug               *string  `json:"slug"`
	DestinationCountry string   `json:"destination_country"`
	DestinationCities  []string `json:"destination_cities"`
	StartDate          *string  `json:"start_date"`
	EndDate            *string  `json:"end_date"`
	Nights             int      `json:"nights"`
	PartySize          int      `json:"party_size"`
	Status             string   `json:"status"`
	CoverImageURL      string   `json:"cover_image_url"`
	HomeCurrency       string   `json:"home_currency"`
	DestCurrency       string   `json:"dest_currency"`
	FxRate             *float64 `json:"fx_rate"`
	FxRateAt           *string  `json:"fx_rate_at"`
	BudgetPerPersonTHB float64  `json:"budget_per_person_thb"`
	Visibility         string   `json:"visibility"`
	DestinationID      string   `json:"destination_id"`

	// Present on the endpoints that load the route: get and overview.
	Route *routeDTO `json:"route,omitempty"`

	// Only present on the list endpoint.
	Role               string   `json:"role,omitempty"`
	MemberIDs          []string `json:"member_ids,omitempty"`
	MemberCharacterIDs []string `json:"member_character_ids,omitempty"`
	DaysUntil          *int     `json:"days_until,omitempty"`
}

func toTripDTO(t models.Trip) tripDTO {
	var cities []string
	if len(t.DestinationCities) > 0 {
		_ = json.Unmarshal(t.DestinationCities, &cities)
	}
	if cities == nil {
		cities = []string{}
	}

	return tripDTO{
		ID:                 t.ID,
		Title:              t.Title,
		Slug:               t.Slug,
		DestinationCountry: t.DestinationCountry,
		DestinationCities:  cities,
		StartDate:          dateString(t.StartDate),
		EndDate:            dateString(t.EndDate),
		Nights:             t.Nights(),
		PartySize:          t.PartySize,
		Status:             t.Status,
		CoverImageURL:      t.CoverImageURL,
		HomeCurrency:       t.HomeCurrency,
		DestCurrency:       t.DestCurrency,
		FxRate:             t.FxRate,
		FxRateAt:           dateString(t.FxRateAt),
		BudgetPerPersonTHB: t.BudgetPerPersonTHB,
		Visibility:         t.Visibility,
		DestinationID:      t.DestinationID,
	}
}

/* ---------------------------------------------------------------- member -- */

type memberDTO struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	CharacterID string `json:"character_id"`
	HasWishlist bool   `json:"has_wishlist"`
}

func toMemberDTO(m models.TripMember, u models.User, hasWishlist bool) memberDTO {
	character := "shiba"
	if u.CharacterID != nil && *u.CharacterID != "" {
		character = *u.CharacterID
	}
	name := u.DisplayName
	if name == "" {
		name = "สมาชิก"
	}
	return memberDTO{
		UserID:      m.UserID,
		DisplayName: name,
		Role:        m.Role,
		CharacterID: character,
		HasWishlist: hasWishlist,
	}
}

/* ------------------------------------------------------------------ user -- */

type meDTO struct {
	ID           string  `json:"id"`
	DisplayName  string  `json:"display_name"`
	Handle       *string `json:"handle"`
	CharacterID  string  `json:"character_id"`
	Email        *string `json:"email"`
	HomeCurrency string  `json:"home_currency"`
	Role         string  `json:"role"`
	Points       int     `json:"points"`
}

func toMeDTO(u models.User, points int) meDTO {
	character := "shiba"
	if u.CharacterID != nil && *u.CharacterID != "" {
		character = *u.CharacterID
	}
	return meDTO{
		ID:           u.ID,
		DisplayName:  u.DisplayName,
		Handle:       u.Handle,
		CharacterID:  character,
		Email:        u.Email,
		HomeCurrency: u.HomeCurrency,
		Role:         u.Role,
		Points:       points,
	}
}

/* ----------------------------------------------------------------- dates -- */

type availabilityEntryDTO struct {
	UserID string `json:"user_id"`
	Date   string `json:"date"`
	Mark   string `json:"mark"`
}

type lockedDatesDTO struct {
	StartDate string   `json:"start_date"`
	EndDate   string   `json:"end_date"`
	Days      int      `json:"days"`
	LockedBy  string   `json:"locked_by"`
	LockedAt  string   `json:"locked_at"`
	MemberIDs []string `json:"member_ids"`
}

type availabilityBoardDTO struct {
	TripID             string                 `json:"trip_id"`
	Month              string                 `json:"month"`
	Months             []string               `json:"months"`
	Members            []memberDTO            `json:"members"`
	SubmittedMemberIDs []string               `json:"submitted_member_ids"`
	Entries            []availabilityEntryDTO `json:"entries"`
	Windows            []domain.DateWindow    `json:"windows"`
	Locked             *lockedDatesDTO        `json:"locked"`
}

/* -------------------------------------------------------------- wishlist -- */

type wishlistItemDTO struct {
	ID       string   `json:"id"`
	UserID   string   `json:"user_id"`
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Tags     []string `json:"tags"`
	Note     *string  `json:"note"`
	Coverage string   `json:"coverage"`
	ItemID   *string  `json:"item_id"`
}

func toWishlistDTO(w models.WishlistItem) wishlistItemDTO {
	return wishlistItemDTO{
		ID:       w.ID,
		UserID:   w.UserID,
		Kind:     w.Kind,
		Title:    w.Title,
		Tags:     jsonStrings(json.RawMessage(w.Tags)),
		Note:     strPtr(w.Note),
		Coverage: w.Coverage,
		ItemID:   w.ItemID,
	}
}

type coverageDTO struct {
	Covered     int `json:"covered"`
	Partial     int `json:"partial"`
	Uncovered   int `json:"uncovered"`
	Total       int `json:"total"`
	MustCovered int `json:"must_covered"`
	MustTotal   int `json:"must_total"`
	Percent     int `json:"percent"`
}

/* ------------------------------------------------------------------ plan -- */

type planItemDTO struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	StartTime  string   `json:"start_time"`
	EndTime    *string  `json:"end_time"`
	Title      string   `json:"title"`
	Area       *string  `json:"area"`
	CostJPY    *float64 `json:"cost_jpy"`
	TravelMin  *int     `json:"travel_minutes"`
	TravelMode *string  `json:"travel_mode"`
	TravelLine *string  `json:"travel_line"`
	OpenHours  *string  `json:"open_hours"`
	ForUserIDs []string `json:"for_user_ids"`
	Bookable   bool     `json:"bookable"`
	Booked     bool     `json:"booked"`
	Warning    *string  `json:"warning"`
	Note       *string  `json:"note"`
}

func toPlanItemDTO(i models.PlanItem) planItemDTO {
	return planItemDTO{
		ID:         i.ID,
		Type:       i.Type,
		StartTime:  i.StartTime,
		EndTime:    strPtr(i.EndTime),
		Title:      i.Title,
		Area:       strPtr(i.Area),
		CostJPY:    i.CostJPY,
		TravelMin:  i.TravelMin,
		TravelMode: strPtr(i.TravelMode),
		TravelLine: strPtr(i.TravelLine),
		OpenHours:  strPtr(i.OpenHours),
		ForUserIDs: jsonStrings(json.RawMessage(i.ForUsers)),
		Bookable:   i.Bookable,
		Booked:     i.Booked,
		Warning:    strPtr(i.Warning),
		Note:       strPtr(i.Note),
	}
}

type planDayDTO struct {
	ID          string        `json:"id"`
	DayIndex    int           `json:"day_index"`
	Date        string        `json:"date"`
	Label       string        `json:"label"`
	City        string        `json:"city"`
	WeatherIcon *string       `json:"weather_icon"`
	WeatherHigh *float64      `json:"weather_high"`
	WeatherLow  *float64      `json:"weather_low"`
	WeatherText *string       `json:"weather_text"`
	Items       []planItemDTO `json:"items"`
}

func toPlanDayDTO(d models.PlanDay, items []models.PlanItem) planDayDTO {
	out := planDayDTO{
		ID:          d.ID,
		DayIndex:    d.DayIndex,
		Date:        d.Date.Format("2006-01-02"),
		Label:       d.Label,
		City:        d.City,
		WeatherIcon: strPtr(d.WeatherIcon),
		WeatherHigh: d.WeatherHigh,
		WeatherLow:  d.WeatherLow,
		WeatherText: strPtr(d.WeatherText),
		Items:       make([]planItemDTO, 0, len(items)),
	}
	for _, item := range items {
		out.Items = append(out.Items, toPlanItemDTO(item))
	}
	return out
}

/* ---------------------------------------------------------------- budget -- */

type budgetLineDTO struct {
	Category     string  `json:"category"`
	Icon         string  `json:"icon"`
	Accent       string  `json:"accent"`
	TotalJPY     float64 `json:"total_jpy"`
	PerPersonJPY float64 `json:"per_person_jpy"`
	Prepaid      bool    `json:"prepaid"`
}

type budgetDTO struct {
	Lines            []budgetLineDTO `json:"lines"`
	TotalJPY         float64         `json:"total_jpy"`
	PerPersonJPY     float64         `json:"per_person_jpy"`
	PrepaidJPY       float64         `json:"prepaid_jpy"`
	PerPersonTHB     float64         `json:"per_person_thb"`
	BudgetUsed       float64         `json:"budget_used"`
	RemainingTHB     float64         `json:"remaining_thb"`
	ItemsWithoutCost int             `json:"items_without_cost"`
	FxRate           float64         `json:"fx_rate"`
	FxAsOf           string          `json:"fx_as_of"`
}

/* --------------------------------------------------------------- expense -- */

type expenseEntryDTO struct {
	ID           string   `json:"id"`
	Date         string   `json:"date"`
	Title        string   `json:"title"`
	Category     string   `json:"category"`
	Scope        string   `json:"scope"`
	Amount       float64  `json:"amount"`
	Currency     string   `json:"currency"`
	PaidBy       string   `json:"paid_by"`
	Participants []string `json:"participants"`
}

func toExpenseDTO(e models.ExpenseEntry) expenseEntryDTO {
	return expenseEntryDTO{
		ID:           e.ID,
		Date:         e.Date.Format("2006-01-02"),
		Title:        e.Title,
		Category:     e.Category,
		Scope:        e.Scope,
		Amount:       e.Amount,
		Currency:     e.Currency,
		PaidBy:       e.PaidBy,
		Participants: jsonStrings(json.RawMessage(e.Participants)),
	}
}

type expenseSummaryDTO struct {
	SharedTotalTHB   float64                `json:"shared_total_thb"`
	PersonalTotalTHB float64                `json:"personal_total_thb"`
	TotalTHB         float64                `json:"total_thb"`
	PerMember        []domain.MemberBalance `json:"per_member"`
	Settlements      []domain.Transfer      `json:"settlements"`
	Entries          []expenseEntryDTO      `json:"entries"`
}

/* ------------------------------------------------------------------ prep -- */

type prepTaskDTO struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Category     string  `json:"category"`
	AssigneeID   *string `json:"assignee_id"`
	DueDate      *string `json:"due_date"`
	Done         bool    `json:"done"`
	Note         *string `json:"note"`
	FromTemplate bool    `json:"from_template"`
}

func toPrepDTO(t models.PrepTask) prepTaskDTO {
	return prepTaskDTO{
		ID:           t.ID,
		Title:        t.Title,
		Category:     t.Category,
		AssigneeID:   t.AssigneeID,
		DueDate:      dateString(t.DueDate),
		Done:         t.Done,
		Note:         strPtr(t.Note),
		FromTemplate: t.FromTemplate,
	}
}

/* --------------------------------------------------------------- booking -- */

type bookingDTO struct {
	ID                string   `json:"id"`
	Kind              string   `json:"kind"`
	Title             string   `json:"title"`
	Partner           string   `json:"partner"`
	URL               string   `json:"url"`
	Status            string   `json:"status"`
	PricePerPersonTHB *float64 `json:"price_per_person_thb"`
	CheckIn           *string  `json:"check_in"`
	CheckOut          *string  `json:"check_out"`
	BookedBy          *string  `json:"booked_by"`
	ConfirmationCode  *string  `json:"confirmation_code"`
	Note              *string  `json:"note"`
}

func toBookingDTO(b models.Booking) bookingDTO {
	return bookingDTO{
		ID:                b.ID,
		Kind:              b.Kind,
		Title:             b.Title,
		Partner:           b.Partner,
		URL:               b.URL,
		Status:            b.Status,
		PricePerPersonTHB: b.PricePerPersonTHB,
		CheckIn:           dateString(b.CheckIn),
		CheckOut:          dateString(b.CheckOut),
		BookedBy:          b.BookedBy,
		ConfirmationCode:  strPtr(b.ConfirmationCode),
		Note:              strPtr(b.Note),
	}
}

/* ---------------------------------------------------------------- collab -- */

type commentDTO struct {
	ID         string `json:"id"`
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	UserID     string `json:"user_id"`
	Body       string `json:"body"`
	CreatedAt  string `json:"created_at"`
	Resolved   bool   `json:"resolved"`
}

func toCommentDTO(c models.Comment) commentDTO {
	return commentDTO{
		ID:         c.ID,
		TargetType: c.TargetType,
		TargetID:   c.TargetID,
		UserID:     c.UserID,
		Body:       c.Body,
		CreatedAt:  c.CreatedAt.UTC().Format(time.RFC3339),
		Resolved:   c.Resolved,
	}
}

type voteDTO struct {
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	UserID     string `json:"user_id"`
	Value      int    `json:"value"`
}

type activityDTO struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	Text       string  `json:"text"`
	CreatedAt  string  `json:"created_at"`
	TargetType *string `json:"target_type"`
	TargetID   *string `json:"target_id"`
}

func toActivityDTO(a models.Activity) activityDTO {
	return activityDTO{
		ID:         a.ID,
		UserID:     a.UserID,
		Text:       a.Text,
		CreatedAt:  a.CreatedAt.UTC().Format(time.RFC3339),
		TargetType: strPtr(a.TargetType),
		TargetID:   a.TargetID,
	}
}

/* -------------------------------------------------------------------- ai -- */

type aiJobDTO struct {
	ID         string          `json:"id"`
	TripID     string          `json:"trip_id"`
	Kind       string          `json:"kind"`
	Status     string          `json:"status"`
	Progress   float64         `json:"progress"`
	Step       string          `json:"step"`
	Error      *string         `json:"error"`
	CreatedAt  string          `json:"created_at"`
	FinishedAt *string         `json:"finished_at"`
	Simulated  bool            `json:"simulated"`
	Result     json.RawMessage `json:"result"`
}

type aiCreditsDTO struct {
	Used             int                 `json:"used"`
	Included         int                 `json:"included"`
	Extra            int                 `json:"extra"`
	PricePerDraftTHB int                 `json:"price_per_draft_thb"`
	PayChannels      []domain.PayChannel `json:"pay_channels"`
	Simulated        bool                `json:"simulated,omitempty"`
	// The receipt the purchase produced (M20). Only on the purchase response.
	Order *orderDTO `json:"order,omitempty"`
}

func toCreditsDTO(c models.AICredit) aiCreditsDTO {
	return aiCreditsDTO{
		Used:             c.Used,
		Included:         c.Included,
		Extra:            c.Extra,
		PricePerDraftTHB: domain.PricePerDraftTHB,
		PayChannels:      domain.PayChannels,
	}
}

/* --------------------------------------------------------------- billing -- */

type orderLineDTO struct {
	Label         string  `json:"label"`
	Quantity      int     `json:"quantity"`
	UnitAmountTHB float64 `json:"unit_amount_thb"`
	AmountTHB     float64 `json:"amount_thb"`
}

type orderDTO struct {
	ID          string         `json:"id"`
	Number      string         `json:"number"`
	Kind        string         `json:"kind"`
	Status      string         `json:"status"`
	Title       string         `json:"title"`
	Lines       []orderLineDTO `json:"lines"`
	SubtotalTHB float64        `json:"subtotal_thb"`
	DiscountTHB float64        `json:"discount_thb"`
	TotalTHB    float64        `json:"total_thb"`
	Currency    string         `json:"currency"`
	Method      string         `json:"method"`
	MethodLabel string         `json:"method_label"`
	PointsSpent int            `json:"points_spent"`
	TripID      *string        `json:"trip_id"`
	TripTitle   *string        `json:"trip_title"`
	Provider    *string        `json:"provider"`
	ProviderRef *string        `json:"provider_ref"`
	Simulated   bool           `json:"simulated"`
	PeriodStart *string        `json:"period_start"`
	PeriodEnd   *string        `json:"period_end"`
	IssuedAt    string         `json:"issued_at"`
	PaidAt      *string        `json:"paid_at"`
	RefundedAt  *string        `json:"refunded_at"`
}

func toOrderDTO(order models.Order) orderDTO {
	lines := models.DecodeOrderLines(order.Lines)
	out := orderDTO{
		ID:          order.ID,
		Number:      order.Number,
		Kind:        order.Kind,
		Status:      order.Status,
		Title:       order.Title,
		Lines:       make([]orderLineDTO, 0, len(lines)),
		SubtotalTHB: order.SubtotalTHB,
		DiscountTHB: order.DiscountTHB,
		TotalTHB:    order.TotalTHB,
		Currency:    order.Currency,
		Method:      order.Method,
		MethodLabel: order.MethodLabel,
		PointsSpent: order.PointsSpent,
		TripID:      order.TripID,
		TripTitle:   strPtr(order.TripTitle),
		Provider:    strPtr(order.Provider),
		ProviderRef: strPtr(order.ProviderRef),
		Simulated:   order.Simulated,
		IssuedAt:    order.IssuedAt.UTC().Format(time.RFC3339),
	}
	for _, line := range lines {
		out.Lines = append(out.Lines, orderLineDTO(line))
	}
	out.PeriodStart = timePtr(order.PeriodStart)
	out.PeriodEnd = timePtr(order.PeriodEnd)
	out.PaidAt = timePtr(order.PaidAt)
	out.RefundedAt = timePtr(order.RefundedAt)
	return out
}

// timePtr renders an optional timestamp the way every other DTO here does.
func timePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	out := t.UTC().Format(time.RFC3339)
	return &out
}

type subscriptionDTO struct {
	ID                      *string `json:"id"`
	PlanID                  string  `json:"plan_id"`
	PlanName                string  `json:"plan_name"`
	Status                  string  `json:"status"`
	Interval                *string `json:"interval"`
	PriceTHB                float64 `json:"price_thb"`
	CurrentPeriodStart      *string `json:"current_period_start"`
	CurrentPeriodEnd        *string `json:"current_period_end"`
	CancelAtPeriodEnd       bool    `json:"cancel_at_period_end"`
	IncludedDraftsPerPeriod int     `json:"included_drafts_per_period"`
}

type subscriptionPlanDTO struct {
	ID                      string   `json:"id"`
	Name                    string   `json:"name"`
	Tagline                 string   `json:"tagline"`
	PriceTHB                int      `json:"price_thb"`
	Interval                string   `json:"interval"`
	Perks                   []string `json:"perks"`
	IncludedDraftsPerPeriod int      `json:"included_drafts_per_period"`
	Available               bool     `json:"available"`
}

type billingSummaryDTO struct {
	Orders            int             `json:"orders"`
	AIDraftsPurchased int             `json:"ai_drafts_purchased"`
	TotalSpentTHB     float64         `json:"total_spent_thb"`
	PointsSpent       int             `json:"points_spent"`
	Since             *string         `json:"since"`
	Subscription      subscriptionDTO `json:"subscription"`
}

/* ----------------------------------------------------------------- share -- */

type shareStateDTO struct {
	Visibility string  `json:"visibility"`
	ShareToken *string `json:"share_token"`
	ShareURL   *string `json:"share_url"`
	PublicSlug *string `json:"public_slug"`
	ViewCount  int     `json:"view_count"`
	CloneCount int     `json:"clone_count"`
}

/* ------------------------------------------------------------------- poi -- */

type poiDTO struct {
	ID        string   `json:"id"`
	NameTH    string   `json:"name_th"`
	NameEN    *string  `json:"name_en"`
	City      string   `json:"city"`
	Area      *string  `json:"area"`
	Category  string   `json:"category"`
	Lat       float64  `json:"lat"`
	Lng       float64  `json:"lng"`
	Rating    *float64 `json:"rating"`
	OpenHours *string  `json:"open_hours"`
	CostJPY   *float64 `json:"cost_jpy"`
	PhotoURL  *string  `json:"photo_url"`
	Tags      []string `json:"tags"`
}

func toPOIDTO(p models.POI) poiDTO {
	out := poiDTO{
		ID:       p.ID,
		NameTH:   p.NameTH,
		NameEN:   strPtr(p.NameEN),
		City:     p.City,
		Area:     strPtr(p.Area),
		Category: p.Category,
		CostJPY:  p.AvgCostJPY,
		PhotoURL: strPtr(p.ImageURL),
		Tags:     jsonStrings(json.RawMessage(p.Tags)),
	}
	if p.Lat != nil {
		out.Lat = *p.Lat
	}
	if p.Lng != nil {
		out.Lng = *p.Lng
	}
	if p.QualityScore > 0 {
		out.Rating = floatPtr(float64(p.QualityScore) / 20)
	}
	if hours := openHoursLabel(p); hours != "" {
		out.OpenHours = &hours
	}
	return out
}

// openHoursLabel flattens the stored JSON into the one line the item card
// shows. A POI open around the clock says so rather than showing "00:00–23:59",
// which reads like a constraint.
func openHoursLabel(p models.POI) string {
	if len(p.OpenHours) == 0 {
		return ""
	}
	var hours map[string]string
	if err := json.Unmarshal(p.OpenHours, &hours); err != nil {
		return ""
	}
	if all, ok := hours["all"]; ok {
		return all
	}
	for _, day := range []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"} {
		if v, ok := hours[day]; ok {
			return v
		}
	}
	return ""
}

/* ---------------------------------------------------------------- dreams -- */

type dreamDTO struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Destination string  `json:"destination"`
	Note        *string `json:"note"`
	URL         *string `json:"url"`
	Accent      string  `json:"accent"`
}

func toDreamDTO(d models.DreamItem) dreamDTO {
	return dreamDTO{
		ID:          d.ID,
		Title:       d.Title,
		Destination: d.Destination,
		Note:        strPtr(d.Note),
		URL:         strPtr(d.URL),
		Accent:      d.Accent,
	}
}

/* --------------------------------------------------------------- profile -- */

type calendarTripDTO struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Cities             []string `json:"cities"`
	StartDate          string   `json:"start_date"`
	EndDate            string   `json:"end_date"`
	DaysUntil          int      `json:"days_until"`
	CoverImageURL      string   `json:"cover_image_url"`
	MemberIDs          []string `json:"member_ids"`
	MemberCharacterIDs []string `json:"member_character_ids"`
	WeatherIcon        *string  `json:"weather_icon"`
	WeatherHigh        *float64 `json:"weather_high"`
	WeatherLow         *float64 `json:"weather_low"`
	WeatherText        *string  `json:"weather_text"`
}

type pastTripDTO struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Cities             []string `json:"cities"`
	DateLabel          string   `json:"date_label"`
	EndDate            string   `json:"end_date"`
	Days               int      `json:"days"`
	Places             int      `json:"places"`
	SpentTHB           float64  `json:"spent_thb"`
	CoverImageURL      string   `json:"cover_image_url"`
	MemberIDs          []string `json:"member_ids"`
	MemberCharacterIDs []string `json:"member_character_ids"`
	// The recap card says whether this one is already public, because the
	// publish nudge must not keep offering points that were already paid.
	Visibility string  `json:"visibility"`
	PublicSlug *string `json:"public_slug"`
}

/* ----------------------------------------------------------------- recap -- */

// The archive a finished trip leaves behind (A17.4). Everything here is derived
// from the room's own tables — see recap.handler.go.
// Kind is one of: dates | destination | budget | plan | rationale | booking | vote
type recapDecisionDTO struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	Title     string  `json:"title"`
	Detail    string  `json:"detail"`
	DecidedAt *string `json:"decided_at"`
	DecidedBy *string `json:"decided_by"`
}

type recapSpendDTO struct {
	Category  string  `json:"category"`
	AmountTHB float64 `json:"amount_thb"`
}

type tripRecapDTO struct {
	Trip               tripDTO            `json:"trip"`
	Members            []memberDTO        `json:"members"`
	DateLabel          string             `json:"date_label"`
	Days               int                `json:"days"`
	Places             int                `json:"places"`
	SpentTHB           float64            `json:"spent_thb"`
	BudgetPerPersonTHB float64            `json:"budget_per_person_thb"`
	Itinerary          []planDayDTO       `json:"itinerary"`
	Decisions          []recapDecisionDTO `json:"decisions"`
	Spending           []recapSpendDTO    `json:"spending"`
	Activity           []activityDTO      `json:"activity"`
	Share              shareStateDTO      `json:"share"`
	// What opening the trip to the public is worth, so the nudge quotes the
	// ledger's own rate rather than a number typed into the copy (§6.5).
	PointsPerPublish int  `json:"points_per_publish"`
	CanPublish       bool `json:"can_publish"`
}

type yearStatsDTO struct {
	Year        int     `json:"year"`
	Trips       int     `json:"trips"`
	Days        int     `json:"days"`
	Countries   int     `json:"countries"`
	Places      int     `json:"places"`
	SpentTHB    float64 `json:"spent_thb"`
	MonthlyDays []int   `json:"monthly_days"`
}

type inviteDTO struct {
	Token     string `json:"token"`
	URL       string `json:"url"`
	ExpiresAt string `json:"expires_at"`
	Role      string `json:"role"`
}

/* -------------------------------------------------------------- overview -- */

type checklistDTO struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Done  bool    `json:"done"`
	Hint  *string `json:"hint"`
}

type overviewCountsDTO struct {
	WishlistItems          int `json:"wishlist_items"`
	PlanDays               int `json:"plan_days"`
	PlanItems              int `json:"plan_items"`
	MembersWithoutWishlist int `json:"members_without_wishlist"`
	Bookings               int `json:"bookings"`
	OpenPrep               int `json:"open_prep"`
}

type tripOverviewDTO struct {
	Trip      tripDTO           `json:"trip"`
	Members   []memberDTO       `json:"members"`
	Coverage  coverageDTO       `json:"coverage"`
	Checklist []checklistDTO    `json:"checklist"`
	Activity  []activityDTO     `json:"activity"`
	Counts    overviewCountsDTO `json:"counts"`
	Locked    *lockedDatesDTO   `json:"locked"`
}

/* ---------------------------------------------------------------- route -- */

type flightDTO struct {
	ID         string `json:"id"`
	Seq        int    `json:"seq"`
	Direction  string `json:"direction"`
	Mode       string `json:"mode"`
	Airline    string `json:"airline"`
	FlightNo   string `json:"flight_no"`
	DepAirport string `json:"dep_airport"`
	ArrAirport string `json:"arr_airport"`
	DepDate    string `json:"dep_date"`
	DepTime    string `json:"dep_time"`
	ArrDate    string `json:"arr_date"`
	ArrTime    string `json:"arr_time"`
	Note       string `json:"note"`
}

// routeDTO is the legs plus everything derived from them, so a client never has
// to re-derive the night counts the server already computed.
type routeDTO struct {
	Flights     []flightDTO          `json:"flights"`
	Stops       []domain.Stop        `json:"stops"`
	Countries   []domain.CountryStay `json:"countries"`
	HomeAirport string               `json:"home_airport"`
	StartDate   string               `json:"start_date"`
	EndDate     string               `json:"end_date"`
	Days        int                  `json:"days"`
	Nights      int                  `json:"nights"`
	RoundTrip   bool                 `json:"round_trip"`
}

/* ---------------------------------------------------------------- ticket -- */

type parsedTicketFlightDTO struct {
	Code      string  `json:"code"`
	From      string  `json:"from"`
	To        string  `json:"to"`
	Date      string  `json:"date"`
	Time      *string `json:"time"`
	Direction string  `json:"direction"`
}

type parsedTicketDTO struct {
	Flights   []parsedTicketFlightDTO `json:"flights"`
	StartDate *string                 `json:"start_date"`
	EndDate   *string                 `json:"end_date"`
	PartySize *int                    `json:"party_size"`
	Cities    []string                `json:"cities"`
	Simulated bool                    `json:"simulated"`
}

/* ---------------------------------------------------------------- export -- */

type exportDTO struct {
	Format    string `json:"format"`
	URL       string `json:"url"`
	Filename  string `json:"filename"`
	Simulated bool   `json:"simulated"`
}

/* ------------------------------------------------------------ pagination -- */

type listResult[T any] struct {
	Items      []T   `json:"items"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	TotalPages int   `json:"total_pages"`
}
