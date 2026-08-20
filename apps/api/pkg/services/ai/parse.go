package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Models sometimes wrap JSON in a markdown fence or add a sentence of preamble
// despite being told not to. Rather than burn a retry on formatting, we extract
// the JSON object and only retry when it genuinely does not parse (§6.3).

// ParseJSON extracts and decodes the first JSON object or array in text.
func ParseJSON(text string, dst any) error {
	body := extractJSON(text)
	if body == "" {
		return fmt.Errorf("ai: no JSON found in model output (%d bytes)", len(text))
	}
	if err := json.Unmarshal([]byte(body), dst); err != nil {
		return fmt.Errorf("ai: model output did not match the schema: %w", err)
	}
	return nil
}

// extractJSON strips a markdown fence if present, then returns the outermost
// balanced {...} or [...] span.
func extractJSON(text string) string {
	s := strings.TrimSpace(text)

	if i := strings.Index(s, "```"); i >= 0 {
		rest := s[i+3:]
		if nl := strings.IndexByte(rest, '\n'); nl >= 0 {
			rest = rest[nl+1:] // drop the language tag line
		}
		if end := strings.Index(rest, "```"); end >= 0 {
			rest = rest[:end]
		}
		s = strings.TrimSpace(rest)
	}

	start := strings.IndexAny(s, "{[")
	if start < 0 {
		return ""
	}
	open := s[start]
	close := byte('}')
	if open == '[' {
		close = ']'
	}

	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(s); i++ {
		c := s[i]
		switch {
		case escaped:
			escaped = false
		case c == '\\' && inString:
			escaped = true
		case c == '"':
			inString = !inString
		case inString:
			// Braces inside a string are content, not structure.
		case c == open:
			depth++
		case c == close:
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}
