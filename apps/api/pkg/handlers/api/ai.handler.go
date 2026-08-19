package api

import "github.com/labstack/echo/v4"

// registerAIRoutes registers the ai endpoints.
//
// TODO(A4.x — DEV_SPEC §5.7): not implemented yet.
//
// Planned routes:
//
//	POST /trips/:tripId/ai/generate    {variants?, hints?} -> {job_id}
//	POST /plans/:planId/ai/refine      {instruction}       -> {job_id}
//	POST /ai/parse-ticket              {text}              -> {flights[], suggested_trip}
//	GET  /ai/jobs/:jobId               status / step / result
//	POST /plans/:planId/ai/apply-diff  {job_id, accepted_diff_ids[]}   [editor]
//
//	Rate limits here are the strictest in the API — AI calls cost money.
//	Enforce a per-user daily cap against Config.Anthropic.DailyCostCapUSD.
func (s *Server) registerAIRoutes(g *echo.Group) {
	_ = g
}
