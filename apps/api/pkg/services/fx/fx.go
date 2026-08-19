// Package fx converts JPY costs into the group's home currency.
// (Named after foreign exchange — unrelated to the Uber FX DI container.)
package fx

import "context"

type Service interface {
	// Rate returns how many units of `to` one unit of `from` buys.
	Rate(ctx context.Context, from, to string) (float64, error)
}

// TODO(A7.2): implement + cache for 12h. A trip snapshots its rate into
// trips.fx_rate so the budget does not silently change day to day.
