// Package affiliate builds partner deeplinks and is the only place that knows a
// partner's URL format. Swapping or adding a partner must not touch handlers
// (DEV_SPEC M12 / risk: "affiliate approve ยาก/commission เปลี่ยน").
package affiliate

import (
	"context"
	"net/url"
	"sort"
	"strings"

	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

type Partner struct {
	Key              string   `json:"key"`
	Name             string   `json:"name"`
	ItemTypes        []string `json:"item_types"`
	DeeplinkTemplate string   `json:"deeplink_template"`
	SubIDParam       string   `json:"sub_id_param"`
	Enabled          bool     `json:"enabled"`
	Priority         int      `json:"priority"`
}

type LinkRequest struct {
	Partner    string
	TargetURL  string
	TrackingID string
}

type Service interface {
	// BuildLink injects our tracking id into the partner's deeplink template.
	BuildLink(ctx context.Context, req LinkRequest) (string, error)
	// PartnersFor returns enabled partners for an item type, highest priority first.
	PartnersFor(ctx context.Context, itemType string) ([]Partner, error)
	// Offers is the catalogue the Bookings tab shows before anything is booked.
	Offers(ctx context.Context, kind string) ([]Offer, error)
}

// Offer is one suggestion. Prices are indicative and labelled as such — ROVE
// never quotes a price it cannot honour.
type Offer struct {
	Kind              string  `json:"kind"`
	Title             string  `json:"title"`
	Partner           string  `json:"partner"`
	URL               string  `json:"url"`
	PricePerPersonTHB float64 `json:"price_per_person_thb"`
	Note              string  `json:"note"`
}

// partners is the registry. It lives in code rather than in a table because a
// deeplink template is a piece of integration logic, not configuration — the
// affiliate *id* is the part that varies per environment, and that comes from
// the config.
var partners = []Partner{
	{Key: "agoda", Name: "Agoda", ItemTypes: []string{"stay"}, DeeplinkTemplate: "https://www.agoda.com/?cid={id}", SubIDParam: "tag", Priority: 100},
	{Key: "booking", Name: "Booking.com", ItemTypes: []string{"stay"}, DeeplinkTemplate: "https://www.booking.com/index.html?aid={id}", SubIDParam: "label", Priority: 90},
	{Key: "klook", Name: "Klook", ItemTypes: []string{"activity", "transport"}, DeeplinkTemplate: "https://www.klook.com/?aid={id}", SubIDParam: "aff_ext", Priority: 100},
	{Key: "kkday", Name: "KKday", ItemTypes: []string{"activity"}, DeeplinkTemplate: "https://www.kkday.com/?cid={id}", SubIDParam: "ud1", Priority: 80},
	{Key: "rentalcars", Name: "Rentalcars", ItemTypes: []string{"transport"}, DeeplinkTemplate: "https://www.rentalcars.com/?affiliateCode={id}", SubIDParam: "adplat", Priority: 70},
	{Key: "airalo", Name: "Airalo", ItemTypes: []string{"esim"}, DeeplinkTemplate: "https://www.airalo.com/?ref={id}", SubIDParam: "utm_content", Priority: 100},
}

type service struct{ cfg core.Config }

func New(cfg core.Config) Service { return &service{cfg: cfg} }

var Module = uberfx.Module("services.affiliate", uberfx.Provide(New))

// BuildLink appends the tracking id as the partner's sub-id parameter, so a
// postback can be matched back to the click we logged.
func (s *service) BuildLink(_ context.Context, req LinkRequest) (string, error) {
	target := req.TargetURL

	if target == "" {
		for _, p := range partners {
			if p.Key == req.Partner {
				target = strings.ReplaceAll(p.DeeplinkTemplate, "{id}", s.cfg.Affiliate[p.Key])
				break
			}
		}
	}
	if target == "" {
		return "", nil
	}

	parsed, err := url.Parse(target)
	if err != nil {
		return target, nil // a template we cannot parse is still better than nothing
	}

	q := parsed.Query()
	for _, p := range partners {
		if p.Key != req.Partner {
			continue
		}
		if id := s.cfg.Affiliate[p.Key]; id != "" {
			q.Set(defaultIDParam(p.Key), id)
		}
		if req.TrackingID != "" && p.SubIDParam != "" {
			q.Set(p.SubIDParam, req.TrackingID)
		}
	}
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

func defaultIDParam(partner string) string {
	switch partner {
	case "agoda":
		return "cid"
	case "booking":
		return "aid"
	case "klook", "kkday":
		return "aid"
	case "rentalcars":
		return "affiliateCode"
	default:
		return "ref"
	}
}

func (s *service) PartnersFor(_ context.Context, itemType string) ([]Partner, error) {
	out := make([]Partner, 0, len(partners))
	for _, p := range partners {
		// A partner without an affiliate id is not yet approved; showing its
		// link would give away the click for nothing.
		p.Enabled = s.cfg.Affiliate[p.Key] != "" || s.cfg.UseStubs()
		if !p.Enabled {
			continue
		}
		for _, t := range p.ItemTypes {
			if t == itemType {
				out = append(out, p)
				break
			}
		}
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].Priority > out[b].Priority })
	return out, nil
}

// catalogue is the same seeded list the web app shows in mock mode, so a UAT
// session and a live one differ only in whether the links carry a tracking id.
var catalogue = []Offer{
	{Kind: "stay", Title: "Shinjuku Granbell Hotel — ห้องคู่ 2 เตียง", Partner: "agoda", PricePerPersonTHB: 2400, Note: "ยกเลิกฟรีถึง 7 วันก่อนเข้าพัก"},
	{Kind: "stay", Title: "MIMARU Tokyo Ueno — ห้องครอบครัว 4 คน", Partner: "booking", PricePerPersonTHB: 1950, Note: "ห้องเดียวพอทั้งกลุ่ม มีครัวเล็ก"},
	{Kind: "activity", Title: "ตั๋ว teamLab Planets (จองล่วงหน้า)", Partner: "klook", PricePerPersonTHB: 890, Note: "ต้องเลือกรอบเวลาเข้าชม"},
	{Kind: "activity", Title: "ทัวร์ฟูจิ–คาวากูจิโกะ 1 วัน", Partner: "kkday", PricePerPersonTHB: 1650, Note: "รถรับ-ส่งจากชินจูกุ"},
	{Kind: "transport", Title: "JR Pass 7 วัน", Partner: "klook", PricePerPersonTHB: 11500, Note: "คุ้มถ้าไปโตเกียว–เกียวโต–โอซาก้า"},
	{Kind: "esim", Title: "eSIM ญี่ปุ่น 10GB / 15 วัน", Partner: "airalo", PricePerPersonTHB: 420, Note: "เปิดใช้งานตอนถึงสนามบินได้เลย"},
	{Kind: "insurance", Title: "ประกันเดินทางเอเชีย 8 วัน", Partner: "rabbitcare", PricePerPersonTHB: 520, Note: "ครอบคลุมค่ารักษา 2 ล้านบาท"},
}

func (s *service) Offers(ctx context.Context, kind string) ([]Offer, error) {
	out := make([]Offer, 0, 4)
	for _, offer := range catalogue {
		if offer.Kind != kind {
			continue
		}
		link, err := s.BuildLink(ctx, LinkRequest{Partner: offer.Partner})
		if err == nil && link != "" {
			offer.URL = link
		} else {
			offer.URL = fallbackURL(offer.Partner)
		}
		out = append(out, offer)
	}
	return out, nil
}

func fallbackURL(partner string) string {
	switch partner {
	case "agoda":
		return "https://www.agoda.com/"
	case "booking":
		return "https://www.booking.com/"
	case "klook":
		return "https://www.klook.com/"
	case "kkday":
		return "https://www.kkday.com/"
	case "rentalcars":
		return "https://www.rentalcars.com/"
	case "airalo":
		return "https://www.airalo.com/"
	default:
		return "https://rabbitcare.com/"
	}
}
