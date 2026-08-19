package core

import (
	"fmt"
	"os"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// NewDatabase opens the MySQL connection used by every store.
// Migrations are NOT run here — main.go runs gormigrate explicitly after the
// connection is up, so `up` can also be invoked as a standalone CLI command.
func NewDatabase(cfg Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&collation=utf8mb4_0900_ai_ci&parseTime=True&loc=UTC",
		cfg.MySQL.Username, cfg.MySQL.Password, cfg.MySQL.Host, cfg.MySQL.Port, cfg.MySQL.Database,
	)

	// Warn by default: full statement logging buries the request log. Set
	// GORM_LOG=info in .env when you actually need to see the SQL.
	level := gormlogger.Warn
	if os.Getenv("GORM_LOG") == "info" {
		level = gormlogger.Info
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(level),
		NowFunc: func() time.Time {
			return time.Now().UTC() // DEV_SPEC §4.1 — timestamps stored in UTC
		},
	})
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}
