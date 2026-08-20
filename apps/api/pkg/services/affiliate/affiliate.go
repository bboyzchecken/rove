// Package affiliate builds partner deeplinks and is the only place that knows a
// partner's URL format. Swapping or adding a partner must not touch handlers
// (DEV_SPEC M12 / risk: "affiliate approve ยาก/commission เปลี่ยน").
package affiliate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

type Partner struct {
	Key              string   `json:"key"`
	Name             string   `json:"name"`
	ItemTypes        []string `json:"item_types"`
	DeeplinkTemplate string   `json:"deeplink_template"`
	SubIDParam       string   `json:"subid_param"`
	Enabled          bool     `json:"enabled"`
	Priority         int      `json:"priority"`
}

type LinkRequest struct {
	Partner    string
	TargetURL  string
	TrackingID string
	// Query values substituted into the template: {destination}, {checkin}, ...
	Params map[string]string
}

type Service interface {
	// BuildLink injects our tracking id into the partner's deeplink template.
	BuildLink(ctx context.Context, req LinkRequest) (string, error)
	// PartnersFor returns enabled partners for an item type, highest priority first.
	PartnersFor(ctx context.Context, itemType string) ([]Partner, error)
	// Pick chooses the single partner to show on an item card, honouring a
	// POI's own partner_links override before falling back to priority.
	Pick(ctx context.Context, itemType string, poiPartnerLinks map[string]string) (Partner, string, bool)
}

type service struct {
	store models.BookingStore
	// affiliateIDs maps a partner key to our id with that partner, from env.
	affiliateIDs map[string]string
}

func New(cfg core.Config, store models.BookingStore) Service {
	return &service{store: store, affiliateIDs: cfg.Affiliate}
}

var Module = fx.Module("services.affiliate", fx.Provide(New))

// BuildLink fills the template. Every partner takes a different subid parameter
// name, which is why the name is data rather than code.
//
//	{target}      the deep URL we want the user to land on
//	{affiliate_id} our id with this partner
//	{subid}       our tracking id, so a confirmation maps back to a click
func (s *service) BuildLink(ctx context.Context, req LinkRequest) (string, error) {
	partners, err := s.all(ctx)
	if err != nil {
		return "", err
	}
	p, ok := partners[req.Partner]
	if !ok {
		return "", fmt.Errorf("affiliate: unknown partner %q", req.Partner)
	}
	if !p.Enabled {
		return "", fmt.Errorf("affiliate: partner %q is disabled", req.Partner)
	}

	link := p.DeeplinkTemplate
	replacements := map[string]string{
		"{target}":       url.QueryEscape(req.TargetURL),
		"{target_raw}":   req.TargetURL,
		"{affiliate_id}": s.affiliateIDs[p.Key],
		"{subid}":        req.TrackingID,
	}
	for k, v := range req.Params {
		replacements["{"+k+"}"] = url.QueryEscape(v)
	}
	for placeholder, value := range replacements {
		link = strings.ReplaceAll(link, placeholder, value)
	}

	// A template that does not mention subid still needs the tracking id, or a
	// confirmation can never be attributed back to the click.
	if p.SubIDParam != "" && !strings.Contains(link, req.TrackingID) {
		sep := "?"
		if strings.Contains(link, "?") {
			sep = "&"
		}
		link += sep + p.SubIDParam + "=" + url.QueryEscape(req.TrackingID)
	}

	// Any placeholder we could not fill would send the user to a broken URL.
	if i := strings.Index(link, "{"); i >= 0 {
		return "", fmt.Errorf("affiliate: unfilled placeholder in %s template: %s",
			p.Key, link[i:min(i+24, len(link))])
	}
	return link, nil
}

func (s *service) PartnersFor(ctx context.Context, itemType string) ([]Partner, error) {
	all, err := s.all(ctx)
	if err != nil {
		return nil, err
	}

	out := []Partner{}
	for _, p := range all {
		if !p.Enabled {
			continue
		}
		if len(p.ItemTypes) > 0 && !contains(p.ItemTypes, itemType) {
			continue
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority != out[j].Priority {
			return out[i].Priority > out[j].Priority
		}
		return out[i].Key < out[j].Key
	})
	return out, nil
}

// Pick returns the partner to show plus the target URL. A POI that carries its
// own link for a partner wins — a hand-curated URL beats a generated search.
func (s *service) Pick(ctx context.Context, itemType string, poiPartnerLinks map[string]string) (Partner, string, bool) {
	candidates, err := s.PartnersFor(ctx, itemType)
	if err != nil || len(candidates) == 0 {
		return Partner{}, "", false
	}
	for _, p := range candidates {
		if target, ok := poiPartnerLinks[p.Key]; ok && target != "" {
			return p, target, true
		}
	}
	return candidates[0], "", true
}

func (s *service) all(ctx context.Context) (map[string]Partner, error) {
	rows, err := s.store.ListPartners(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]Partner, len(rows))
	for _, r := range rows {
		var types []string
		if len(r.ItemTypes) > 0 {
			_ = json.Unmarshal(r.ItemTypes, &types)
		}
		out[r.Key] = Partner{
			Key:              r.Key,
			Name:             r.Name,
			ItemTypes:        types,
			DeeplinkTemplate: r.DeeplinkTemplate,
			SubIDParam:       r.SubIDParam,
			Enabled:          r.Enabled,
			Priority:         r.Priority,
		}
	}
	return out, nil
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
