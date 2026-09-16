package core

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// BackfillLegacySources gives every points and earnings row written before the
// evidence chain a `legacy` source (F12 §5 ข้อ 8). The snapshot holds what is
// still knowable — the note, the amount, the trip's title if the trip exists —
// and nothing is invented for what is not.
func BackfillLegacySources(tx *gorm.DB) error {
	titles := map[string]string{}
	var trips []struct {
		ID    string
		Title string
	}
	if err := tx.Model(&models.Trip{}).Select("id", "title").Scan(&trips).Error; err != nil {
		return err
	}
	for _, t := range trips {
		titles[t.ID] = t.Title
	}

	var points []models.UserPoints
	if err := tx.Where("source_id IS NULL").Find(&points).Error; err != nil {
		return err
	}
	for _, row := range points {
		snapshot := map[string]any{
			"legacy": true, "ledger": "points",
			"user_id": row.UserID, "delta": row.Delta, "reason": row.Reason, "note": row.Note,
		}
		if row.TripID != nil {
			snapshot["trip_id"] = *row.TripID
			if title, ok := titles[*row.TripID]; ok {
				snapshot["trip_title"] = title
			} else {
				snapshot["trip_missing"] = true
			}
		}
		source, err := legacySource(tx, models.SubjectPoints, row.ID, row.TripID, row.OccurredAt, snapshot)
		if err != nil {
			return err
		}
		if err := tx.Exec("UPDATE user_points SET source_id = ? WHERE id = ?", source.ID, row.ID).Error; err != nil {
			return err
		}
	}

	var earnings []models.CreatorEarning
	if err := tx.Where("source_id IS NULL").Find(&earnings).Error; err != nil {
		return err
	}
	for _, row := range earnings {
		snapshot := map[string]any{
			"legacy": true, "ledger": "earning",
			"user_id": row.UserID, "partner": row.Partner, "booking_value_thb": row.BookingValueTHB,
			"commission_thb": row.CommissionTHB, "share_percent": row.SharePercent, "amount_thb": row.AmountTHB,
			"status": row.Status,
		}
		var tripID *string
		if row.TripID != "" {
			tripID = &row.TripID
			snapshot["trip_id"] = row.TripID
			if title, ok := titles[row.TripID]; ok {
				snapshot["trip_title"] = title
			} else {
				snapshot["trip_missing"] = true
			}
		}
		source, err := legacySource(tx, models.SubjectEarning, row.ID, tripID, row.OccurredAt, snapshot)
		if err != nil {
			return err
		}
		if err := tx.Exec("UPDATE creator_earnings SET source_id = ? WHERE id = ?", source.ID, row.ID).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.EarningEvent{
			EarningID: row.ID, FromStatus: "", ToStatus: row.Status,
			Reason: "ข้อมูลก่อนมีระบบหลักฐาน", Ref: source.ID, OccurredAt: row.OccurredAt,
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

func legacySource(tx *gorm.DB, subjectType, subjectID string, tripID *string, at time.Time, snapshot map[string]any) (*models.ValueSource, error) {
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	source := &models.ValueSource{
		Kind: models.SourceLegacy, SubjectType: subjectType, SubjectID: subjectID,
		TripID: tripID, Snapshot: raw, OccurredAt: at,
	}
	return source, tx.Create(source).Error
}
