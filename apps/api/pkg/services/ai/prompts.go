package ai

import (
	"embed"
	"fmt"
	"strings"
)

// Prompts are embedded, not read from disk, so the binary in the container has
// no runtime file dependency and a prompt change is a real code change that
// shows up in the diff (DEV_SPEC §6.3: prompts are versioned).
//
//go:embed prompts/*.md
var promptFS embed.FS

// Prompt versions. Bumping one means bumping the matching schema in schemas.go.
const (
	PromptPlanner   = "prompts/planner.v1.md"
	PromptRepair    = "prompts/repair.v1.md"
	PromptRefine    = "prompts/refine.v1.md"
	PromptTicket    = "prompts/ticket.v1.md"
	PromptNormalize = "prompts/normalize.v1.md"
)

// LoadPrompt reads a template and substitutes {{key}} placeholders.
func LoadPrompt(name string, vars map[string]string) (string, error) {
	raw, err := promptFS.ReadFile(name)
	if err != nil {
		return "", fmt.Errorf("ai: prompt %s: %w", name, err)
	}
	out := string(raw)
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out, nil
}

// MustPrompt is for the fixed prompts with no variables; a missing embedded
// file is a build-time mistake, not a runtime condition.
func MustPrompt(name string) string {
	s, err := LoadPrompt(name, nil)
	if err != nil {
		panic(err)
	}
	return s
}
