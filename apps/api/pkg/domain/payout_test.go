package domain

import (
	"testing"
	"time"
)

func ymd(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func TestDueDateSkipsTheWeekend(t *testing.T) {
	// Tuesday → Friday.
	if got := DueDate(ymd("2026-09-29")); !got.Equal(ymd("2026-10-02")) {
		t.Errorf("due = %s", got.Format("2006-01-02"))
	}
	// Thursday (a cutoff an admin pulled earlier) → Tuesday.
	if got := DueDate(ymd("2026-10-08")); !got.Equal(ymd("2026-10-13")) {
		t.Errorf("due = %s", got.Format("2006-01-02"))
	}
}

func TestNextCutoffKeepsTheFortnight(t *testing.T) {
	anchor := ymd("2026-09-29")
	cases := map[string]string{
		"2026-09-01": "2026-09-29",
		"2026-09-29": "2026-09-29",
		"2026-09-30": "2026-10-13",
		"2026-10-13": "2026-10-13",
		"2026-10-14": "2026-10-27",
	}
	for from, want := range cases {
		if got := NextCutoff(anchor, ymd(from)); !got.Equal(ymd(want)) {
			t.Errorf("from %s = %s, want %s", from, got.Format("2006-01-02"), want)
		}
	}
}

func TestThaiIDChecksum(t *testing.T) {
	if !ValidThaiID("1-1017-00230-70-8") {
		t.Error("rejected a valid ID")
	}
	if ValidThaiID("1101700230709") || ValidThaiID("12345") {
		t.Error("accepted an invalid ID")
	}
}

func TestPhoneNormalises(t *testing.T) {
	for in, want := range map[string]string{"081-234-5678": "0812345678", "+66812345678": "0812345678", "12345": ""} {
		if got := NormalizeThaiPhone(in); got != want {
			t.Errorf("%s = %q, want %q", in, got, want)
		}
	}
}
