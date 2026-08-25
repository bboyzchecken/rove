package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
)

// What is real and what is a stand-in, answered out loud.
//
// The web app has its own switch (NEXT_PUBLIC_DATA_MODE) that decides whether
// it talks to this API at all, and the API has STUB_PROVIDERS deciding whether
// the third parties behind it are real. Nothing connected the two, so a build
// configured `live` could sit in front of an API stubbing Anthropic and OAuth
// and say nothing — the screens claimed "ต่อระบบจริง" while the AI draft was a
// canned file. This endpoint is how the web finds out, and it is public because
// the answer is not a secret: it is a list of things that are NOT happening.

type modeDTO struct {
	// True when this API is talking to the real Anthropic, Google, FX, weather,
	// storage and e-mail. False means one or more are stand-ins — `stubbed`
	// says which.
	Live bool `json:"live"`
	// Provider keys the web knows how to name for a person: "ai", "places",
	// "weather", "fx", "storage", "notifications", "affiliate".
	Stubbed []string `json:"stubbed"`
	// The provider-less sign-in door at POST /auth/demo is registered.
	DevLogin bool   `json:"dev_login"`
	Env      string `json:"env"`
}

func (s *Server) registerModeRoutes(g *echo.Group) {
	g.GET("/meta/mode", s.handleMode)
}

func (s *Server) handleMode(c echo.Context) error {
	stubbed := stubbedProviders(s.cfg)
	return c.JSON(http.StatusOK, modeDTO{
		Live:     len(stubbed) == 0,
		Stubbed:  stubbed,
		DevLogin: s.cfg.UseDevLogin(),
		Env:      s.cfg.Environment,
	})
}

// stubbedProviders lists every third party currently answered by a stand-in.
//
// STUB_PROVIDERS is not the only way to end up with one: a missing key does the
// same thing quietly, which is the failure that made "live" untrustworthy in
// the first place. Both paths are reported the same way, because from the
// outside they are the same fact.
func stubbedProviders(cfg core.Config) []string {
	stubs := cfg.UseStubs()
	out := []string{}

	if stubs || cfg.Anthropic.ApiKey == "" {
		out = append(out, "ai")
	}
	if stubs || cfg.Google.MapsServerKey == "" {
		out = append(out, "places")
	}
	if stubs {
		out = append(out, "weather")
	}
	if stubs || cfg.FX.ApiURL == "" {
		out = append(out, "fx")
	}
	if stubs || cfg.R2.AccessKey == "" {
		out = append(out, "storage")
	}
	if stubs || cfg.Line.MessagingToken == "" {
		out = append(out, "notifications")
	}
	// The affiliate service treats stub mode as "every partner is enabled",
	// which is a stand-in for a commercial agreement, not for an API.
	if stubs {
		out = append(out, "affiliate")
	}

	return out
}
