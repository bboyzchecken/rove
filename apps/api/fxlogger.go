package main

import (
	"os"

	"go.uber.org/fx/fxevent"
)

// fxLogger keeps the dependency-graph chatter out of the normal log. Set
// FX_VERBOSE=1 when debugging a wiring problem.
func fxLogger() fxevent.Logger {
	if os.Getenv("FX_VERBOSE") == "1" {
		return &fxevent.ConsoleLogger{W: os.Stdout}
	}
	return fxevent.NopLogger
}
