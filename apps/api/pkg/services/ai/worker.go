package ai

// The AI worker consumes the Redis queue, runs the pipeline, updates the
// ai_jobs row (status, step, tokens, cost) and publishes ai.progress SSE events
// so the browser can show a live "กำลังร่างแพลน..." state.
//
// TODO(A4.9): implement on top of pkg/services/jobs.
