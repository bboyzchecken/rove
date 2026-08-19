package logger

import (
	"os"

	"github.com/sirupsen/logrus"
)

var log *logrus.Logger

// Init configures the process-wide logger. JSON in production so the log
// shipper can parse it, human-readable text everywhere else.
func Init(environment string) *logrus.Logger {
	log = logrus.New()
	log.SetOutput(os.Stdout)

	if environment == "production" {
		log.SetFormatter(&logrus.JSONFormatter{TimestampFormat: "2006-01-02T15:04:05Z07:00"})
		log.SetLevel(logrus.InfoLevel)
	} else {
		log.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})
		log.SetLevel(logrus.DebugLevel)
	}
	return log
}

// L returns the shared logger, initialising a default one if Init was skipped
// (e.g. inside unit tests).
func L() *logrus.Logger {
	if log == nil {
		return Init("development")
	}
	return log
}
