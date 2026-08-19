# migrations/

Real migrations run through **gormigrate** in `pkg/core/migrate.go` — that is
the source of truth and it executes on every boot.

This folder holds the equivalent **SQL for documentation and for ops**: when you
need to explain a schema change in a PR, or apply something by hand on the
Lightsail box, drop a `YYYYMMDD_description.sql` here mirroring the Go migration.

Rules
- one migration per task, id `YYYYMMDDHHMM_short_description`
- never edit a migration that has been merged — write a new one
- `AutoMigrate` is fine for additive changes; anything that rewrites data gets
  hand-written SQL
