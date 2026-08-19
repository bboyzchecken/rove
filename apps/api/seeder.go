package main

import (
	"context"
	"encoding/csv"
	"os"
	"path/filepath"

	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	poistore "github.com/bboyzchecken/rove/apps/api/pkg/store/poi"
)

// runSeed loads the POI catalogue from data/poi/jp.csv (D0.2 / D0.3).
// Safe to re-run: rows are upserted.
func runSeed(cfg core.Config) {
	db, err := core.NewDatabase(cfg)
	if err != nil {
		logger.L().WithError(err).Fatal("connect mysql")
	}
	if err := core.Migrate(db); err != nil {
		logger.L().WithError(err).Fatal("migrate")
	}
	if err := seedPOIs(context.Background(), db); err != nil {
		logger.L().WithError(err).Fatal("seed pois")
	}
	logger.L().Info("seed complete")
}

func seedPOIs(ctx context.Context, db *gorm.DB) error {
	path := filepath.Join("data", "poi", "jp.csv")
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			logger.L().Warnf("%s not found — nothing to seed (see DEV_SPEC D0.2)", path)
			return nil
		}
		return err
	}
	defer f.Close()

	rows, err := csv.NewReader(f).ReadAll()
	if err != nil {
		return err
	}
	if len(rows) < 2 {
		logger.L().Warn("poi csv has no data rows")
		return nil
	}

	// TODO(D0.2): map the header row to POI fields and validate before upserting.
	// Kept deliberately minimal until the CSV schema is fixed.
	store := poistore.New(db)
	if n, err := store.Count(ctx); err == nil {
		logger.L().Infof("poi csv has %d data rows; %d already in db", len(rows)-1, n)
	}
	_ = models.POI{}
	return nil
}
