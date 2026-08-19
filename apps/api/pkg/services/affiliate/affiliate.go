// Package affiliate builds partner deeplinks and is the only place that knows a
// partner's URL format. Swapping or adding a partner must not touch handlers
// (DEV_SPEC M12 / risk: "affiliate approve ยาก/commission เปลี่ยน").
package affiliate

import "context"

type Partner struct {
	Key              string
	Name             string
	ItemTypes        []string
	DeeplinkTemplate string
	SubIDParam       string
	Enabled          bool
	Priority         int
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
}

// TODO(A12.1): implement. Partner rows live in the affiliate_partners table so
// they can be changed without a deploy.
