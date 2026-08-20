package domain

import "testing"

func TestNormalizeName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Tokyo Skytree", "tokyo skytree"},
		{"  TOKYO   SKYTREE  ", "tokyo skytree"},
		{"Tokyo-Skytree!", "tokyo skytree"},
		{"โตเกียว สกายทรี", "โตเกียว สกายทรี"},
		{"東京スカイツリー", "東京スカイツリー"},
		{"", ""},
		{"...", ""},
	}
	for _, tc := range cases {
		if got := NormalizeName(tc.in); got != tc.want {
			t.Errorf("NormalizeName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestTagOverlap(t *testing.T) {
	cases := []struct {
		name string
		a, b []string
		want float64
	}{
		{"identical", []string{"food", "ramen"}, []string{"ramen", "food"}, 1},
		{"half", []string{"food", "ramen"}, []string{"food", "sushi"}, 1.0 / 3.0},
		{"disjoint", []string{"food"}, []string{"temple"}, 0},
		{"empty left", nil, []string{"food"}, 0},
		{"empty right", []string{"food"}, nil, 0},
		{"case insensitive", []string{"Food"}, []string{"food"}, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := TagOverlap(tc.a, tc.b)
			if diff := got - tc.want; diff > 1e-9 || diff < -1e-9 {
				t.Errorf("TagOverlap(%v,%v) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

func TestTextSimilar(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"Tokyo Skytree", "tokyo skytree", true},
		{"Tokyo Skytree", "Tokyo Skytree Observation Deck", true},
		{"bar", "barbecue", false}, // too short to trust a substring hit
		{"Sensoji", "Skytree", false},
		{"", "Skytree", false},
	}
	for _, tc := range cases {
		if got := TextSimilar(tc.a, tc.b); got != tc.want {
			t.Errorf("TextSimilar(%q,%q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}
