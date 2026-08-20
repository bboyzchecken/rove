package domain

import "testing"

func TestCategoryForItemType(t *testing.T) {
	cases := []struct{ in, want string }{
		{"food", CategoryFood},
		{"stay", CategoryStay},
		{"transport", CategoryTransport},
		{"flight", CategoryTransport},
		{"place", CategoryTicket},
		{"note", CategoryOther},
		{"something-new", CategoryOther},
		{"", CategoryOther},
	}
	for _, tc := range cases {
		if got := CategoryForItemType(tc.in); got != tc.want {
			t.Errorf("CategoryForItemType(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
