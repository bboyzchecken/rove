package models

import (
	"context"

	"gorm.io/datatypes"
)

type POI struct {
	Base
	NameTH        string         `gorm:"type:varchar(200);not null" json:"name_th"`
	NameEN        string         `gorm:"type:varchar(200)" json:"name_en"`
	NameJA        string         `gorm:"type:varchar(200)" json:"name_ja"`
	Country       string         `gorm:"type:varchar(2);not null;default:'JP';index:idx_poi_place" json:"country"`
	City          string         `gorm:"type:varchar(80);index:idx_poi_place" json:"city"`
	Area          string         `gorm:"type:varchar(80);index:idx_poi_place" json:"area"`
	Category      string         `gorm:"type:varchar(40)" json:"category"`
	Tags          datatypes.JSON `gorm:"type:json" json:"tags"`
	Lat           *float64       `gorm:"type:decimal(10,7)" json:"lat"`
	Lng           *float64       `gorm:"type:decimal(10,7)" json:"lng"`
	GooglePlaceID string         `gorm:"type:varchar(120);index" json:"google_place_id"`
	OpenHours     datatypes.JSON `gorm:"type:json" json:"open_hours"`
	ClosedDays    datatypes.JSON `gorm:"type:json" json:"closed_days"`
	SeasonalNote  string         `gorm:"type:text" json:"seasonal_note"`
	AvgVisitMin   int            `json:"avg_visit_min"`
	AvgCostJPY    *float64       `gorm:"type:decimal(12,2)" json:"avg_cost_jpy"`
	CostNote      string         `gorm:"type:varchar(255)" json:"cost_note"`
	Tips          string         `gorm:"type:text" json:"tips"`
	ImageURL      string         `gorm:"type:varchar(500)" json:"image_url"`
	PartnerLinks  datatypes.JSON `gorm:"type:json" json:"partner_links"`
	IsActive      bool           `gorm:"not null;default:true" json:"is_active"`
	Source        string         `gorm:"type:varchar(40)" json:"source"`
	QualityScore  int            `gorm:"not null;default:0" json:"quality_score"`
}

func (POI) TableName() string { return "pois" }

type POIStore interface {
	Create(ctx context.Context, p *POI) error
	GetByID(ctx context.Context, id string) (*POI, error)
	// Search backs the AI lookup_poi tool (DEV_SPEC §6.3) — FULLTEXT over names.
	Search(ctx context.Context, q, city, area string, limit int) ([]POI, error)
	Upsert(ctx context.Context, p *POI) error
	Count(ctx context.Context) (int64, error)
	ListByIDs(ctx context.Context, ids []string) ([]POI, error)
	GetByPlaceID(ctx context.Context, placeID string) (*POI, error)
	// List is the admin table view; Search is the user-facing one.
	List(ctx context.Context, city, category string, limit, offset int) ([]POI, int64, error)
	Update(ctx context.Context, p *POI) error
}

// Zone maps a POI to a planning zone via its area, falling back to city.
// Kept on the model because both the AI frame builder and the validator need it.
func (p POI) ZoneKey() string {
	if p.Area != "" {
		return p.Area
	}
	return p.City
}
