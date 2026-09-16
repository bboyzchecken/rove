package api

import (
	"encoding/json"

	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Helpers for writing the evidence chain (Feedback #4 — F12).

// economy is the admin-tunable split (D-30), read fresh on every booking: a
// change in the admin page applies to the next confirmation, never to one
// already recorded, because the percent used is copied into the snapshot.
func (s *Server) economy(ctx contextT) domain.Economy {
	values, err := s.settings.All(ctx)
	if err != nil {
		logger.L().WithError(err).Error("read economy settings")
	}
	return domain.EconomyFromSettings(values)
}

// record writes one ledger entry. Best effort like the awards it replaced — a
// booking that was confirmed stays confirmed — but loud, because a missing
// source is a gap somebody will have to explain.
func (s *Server) record(ctx contextT, entry *models.LedgerEntry) bool {
	if err := s.ledger.Record(ctx, entry); err != nil {
		logger.L().WithError(err).WithField("kind", entry.Source.Kind).Error("write ledger entry")
		return false
	}
	return true
}

func snapshot(fields map[string]any) datatypes.JSON {
	raw, err := json.Marshal(fields)
	if err != nil {
		return datatypes.JSON("{}")
	}
	return raw
}

// personSnap is who someone was at the moment (D-17): their id and the name
// they showed, which may change later.
func (s *Server) personSnap(ctx contextT, userID string) map[string]any {
	out := map[string]any{"id": userID}
	if userID == "" {
		return out
	}
	if user, err := s.users.GetByID(ctx, userID); err == nil {
		out["name"] = user.DisplayName
		if user.Handle != nil {
			out["handle"] = *user.Handle
		}
	}
	return out
}

func tripSnap(trip *models.Trip) map[string]any {
	if trip == nil {
		return nil
	}
	out := map[string]any{
		"id": trip.ID, "title": trip.Title, "owner_id": trip.OwnerID,
		"visibility": trip.Visibility, "country": trip.DestinationCountry,
	}
	if trip.Slug != nil {
		out["slug"] = *trip.Slug
	}
	return out
}

func strOrNil(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
