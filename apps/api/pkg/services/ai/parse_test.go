package ai

import "testing"

func TestParseJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}

	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		{"bare object", `{"name":"a"}`, "a", true},
		{"markdown fence", "```json\n{\"name\":\"a\"}\n```", "a", true},
		{"fence without language", "```\n{\"name\":\"a\"}\n```", "a", true},
		{"preamble text", "นี่คือแพลนครับ\n{\"name\":\"a\"}", "a", true},
		{"trailing text", `{"name":"a"} หวังว่าจะชอบ`, "a", true},
		{"braces inside a string", `{"name":"a{b}c"}`, "a{b}c", true},
		{"nested object", `{"name":"a","x":{"y":1}}`, "a", true},
		{"no json at all", "ขอโทษครับ ทำไม่ได้", "", false},
		{"truncated", `{"name":"a"`, "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got payload
			err := ParseJSON(tc.in, &got)
			if tc.ok != (err == nil) {
				t.Fatalf("err = %v, wanted ok=%v", err, tc.ok)
			}
			if tc.ok && got.Name != tc.want {
				t.Errorf("Name = %q, want %q", got.Name, tc.want)
			}
		})
	}
}

func TestParseJSONArray(t *testing.T) {
	var got []int
	if err := ParseJSON("```json\n[1,2,3]\n```", &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Errorf("got %v, want three elements", got)
	}
}

func TestPromptsAreEmbedded(t *testing.T) {
	for _, name := range []string{PromptPlanner, PromptRepair, PromptRefine, PromptTicket, PromptNormalize} {
		s, err := LoadPrompt(name, nil)
		if err != nil {
			t.Errorf("LoadPrompt(%s): %v", name, err)
			continue
		}
		if len(s) < 100 {
			t.Errorf("prompt %s looks empty (%d bytes)", name, len(s))
		}
	}
}

func TestLoadPromptSubstitutes(t *testing.T) {
	got, err := LoadPrompt(PromptRefine, map[string]string{"instruction": "ย้ายวันสุดท้ายไปโอไดบะ"})
	if err != nil {
		t.Fatal(err)
	}
	if !contains(got, "ย้ายวันสุดท้ายไปโอไดบะ") {
		t.Error("instruction was not substituted into the refine prompt")
	}
	if contains(got, "{{instruction}}") {
		t.Error("placeholder survived substitution")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && stringIndex(haystack, needle) >= 0
}

func stringIndex(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}
