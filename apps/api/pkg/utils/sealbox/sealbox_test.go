package sealbox

import (
	"strings"
	"testing"
)

func TestSealRoundTripsAndHashIsStable(t *testing.T) {
	box, err := New([]byte(strings.Repeat("k", 32)))
	if err != nil {
		t.Fatal(err)
	}
	a, _ := box.Seal("1101700230705")
	b, _ := box.Seal("1101700230705")
	if a == b {
		t.Error("two seals of the same value must differ (random nonce)")
	}
	if got, err := box.Open(a); err != nil || got != "1101700230705" {
		t.Fatalf("open = %q, %v", got, err)
	}
	if box.Hash("1101700230705") != box.Hash("1101700230705") || box.Hash("1") == box.Hash("2") {
		t.Error("hash must be deterministic and distinguish values")
	}
	if strings.Contains(a, "1101700230705") {
		t.Error("sealed value leaks the plaintext")
	}
}

func TestShortKeyIsRefused(t *testing.T) {
	if _, err := New([]byte("short")); err == nil {
		t.Fatal("accepted a short key")
	}
}
