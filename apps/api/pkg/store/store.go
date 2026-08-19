// Package store holds shared query helpers used by every <domain>.store.go.
//
// Hard rule (DEV_SPEC §4.3): any method touching trip-scoped data MUST take a
// tripID and include it in the WHERE clause. Never query a row by its id alone
// — that is the IDOR hole this project is designed to avoid.
package store

import (
	"gorm.io/gorm"
)

const (
	DefaultLimit = 20
	MaxLimit     = 100
)

// Pagination is the offset-based page request used by list endpoints.
type Pagination struct {
	Page  int `query:"page"`
	Limit int `query:"limit"`
}

// Normalize clamps user input into a safe range.
func (p *Pagination) Normalize() {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Limit <= 0 {
		p.Limit = DefaultLimit
	}
	if p.Limit > MaxLimit {
		p.Limit = MaxLimit
	}
}

func (p Pagination) Offset() int {
	if p.Page < 1 {
		p.Page = 1
	}
	return (p.Page - 1) * p.Limit
}

// Paginate returns a GORM scope applying LIMIT/OFFSET.
func Paginate(p Pagination) func(*gorm.DB) *gorm.DB {
	p.Normalize()
	return func(db *gorm.DB) *gorm.DB {
		return db.Limit(p.Limit).Offset(p.Offset())
	}
}

// CursorPaginate returns a scope for keyset pagination, used by feeds that must
// stay stable while new rows arrive (activity log, comments).
func CursorPaginate(column, cursor string, limit int) func(*gorm.DB) *gorm.DB {
	if limit <= 0 || limit > MaxLimit {
		limit = DefaultLimit
	}
	return func(db *gorm.DB) *gorm.DB {
		if cursor != "" {
			db = db.Where(column+" < ?", cursor)
		}
		return db.Order(column + " DESC").Limit(limit)
	}
}

// ListResult is the envelope every paginated endpoint returns.
type ListResult[T any] struct {
	Items      []T   `json:"items"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	TotalPages int   `json:"total_pages"`
}

func NewListResult[T any](items []T, total int64, p Pagination) ListResult[T] {
	p.Normalize()
	pages := int(total) / p.Limit
	if int(total)%p.Limit != 0 {
		pages++
	}
	return ListResult[T]{Items: items, Total: total, Page: p.Page, Limit: p.Limit, TotalPages: pages}
}
