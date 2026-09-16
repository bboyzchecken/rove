package domain

import (
	"regexp"
	"strings"
	"time"
)

// Rules for getting creators paid (Feedback #4 — F11).

const (
	// SettingPayoutAnchor is the first Tuesday an admin picked (D-40).
	SettingPayoutAnchor = "payout_anchor_date"

	PayoutCycleDays      = 14
	PayoutDueWorkingDays = 3

	// HeldEarningDays is how long income waits for its creator to verify (D-35).
	HeldEarningDays = 180
	// ExpiryWarningDays is when the warning goes out.
	ExpiryWarningDays = 14

	OTPLength   = 6
	OTPLifetime = 10 * time.Minute
	OTPAttempts = 5
	// KYCImageURLLifetime is how long an admin's view of an ID card lasts.
	KYCImageURLLifetime = 10 * time.Minute
)

// DueDate is the cutoff plus three working days (Mon–Fri). Public holidays
// are not modelled; an admin moves the cutoff earlier around them (D-21).
func DueDate(cutoff time.Time) time.Time {
	day := Day(cutoff)
	added := 0
	for added < PayoutDueWorkingDays {
		day = day.AddDate(0, 0, 1)
		if wd := day.Weekday(); wd != time.Saturday && wd != time.Sunday {
			added++
		}
	}
	return day
}

// NextCutoff is the anchor's fortnightly rhythm: the first cutoff on or after
// `from`.
func NextCutoff(anchor, from time.Time) time.Time {
	anchor, from = Day(anchor), Day(from)
	if !from.After(anchor) {
		return anchor
	}
	days := int(from.Sub(anchor).Hours() / 24)
	steps := (days + PayoutCycleDays - 1) / PayoutCycleDays
	return anchor.AddDate(0, 0, steps*PayoutCycleDays)
}

var digitsOnly = regexp.MustCompile(`\D`)

func Digits(v string) string { return digitsOnly.ReplaceAllString(v, "") }

// ValidThaiID checks the 13-digit national ID (and the juristic tax ID, which
// uses the same checksum).
func ValidThaiID(v string) bool {
	d := Digits(v)
	if len(d) != 13 {
		return false
	}
	sum := 0
	for i := 0; i < 12; i++ {
		sum += int(d[i]-'0') * (13 - i)
	}
	return (11-sum%11)%10 == int(d[12]-'0')
}

// NormalizeThaiPhone turns 08x-xxx-xxxx or +668x... into 0xxxxxxxxx, or "".
func NormalizeThaiPhone(v string) string {
	d := Digits(v)
	if strings.HasPrefix(d, "66") && len(d) == 11 {
		d = "0" + d[2:]
	}
	if len(d) != 10 || d[0] != '0' {
		return ""
	}
	return d
}

func Last4(v string) string {
	if len(v) <= 4 {
		return v
	}
	return v[len(v)-4:]
}
