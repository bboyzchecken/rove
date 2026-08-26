package tests

import (
	"net/http"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M9 — the inbox is the most personal surface in the product: it is addressed
// post. These prove it stays that way.

func TestInboxIsPerUser(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	_, bobToken := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")

	// Alice writes a comment mentioning nobody, then Bob asks for HIS inbox.
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/comments", aliceToken, map[string]any{
		"target_type": "trip",
		"target_id":   trip.ID,
		"body":        "เริ่มแพลนกันเถอะ",
	}).ExpectStatus(http.StatusCreated)

	var inbox struct {
		Unread int `json:"unread"`
		Items  []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/notifications", bobToken, nil).
		ExpectStatus(http.StatusOK).
		Decode(&inbox)

	if len(inbox.Items) != 0 || inbox.Unread != 0 {
		t.Fatalf("bob sees %d items / %d unread from a room he is not in", len(inbox.Items), inbox.Unread)
	}
}

func TestMentionNotifiesOnlyTripMembers(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")
	_, outsiderToken := h.User("carol")

	// Handles are what an @mention resolves against.
	h.Request(http.MethodPatch, "/api/v1/users/me", bobToken, map[string]any{"handle": "bob"}).
		ExpectStatus(http.StatusOK)
	h.Request(http.MethodPatch, "/api/v1/users/me", outsiderToken, map[string]any{"handle": "carol"}).
		ExpectStatus(http.StatusOK)

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, bob, "editor")

	// Carol is named but is not in the room — she must not be reachable.
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/comments", aliceToken, map[string]any{
		"target_type": "trip",
		"target_id":   trip.ID,
		"body":        "@bob กับ @carol ดูวันนี้หน่อย",
	}).ExpectStatus(http.StatusCreated)

	var bobInbox struct {
		Unread int `json:"unread"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/notifications", bobToken, nil).Decode(&bobInbox)
	if bobInbox.Unread != 1 {
		t.Errorf("bob (a member) has %d unread, want 1", bobInbox.Unread)
	}

	var carolInbox struct {
		Unread int `json:"unread"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/notifications", outsiderToken, nil).Decode(&carolInbox)
	if carolInbox.Unread != 0 {
		t.Errorf("carol is not in the trip but got %d notifications — @mention must not reach strangers", carolInbox.Unread)
	}
}

func TestMentionDoesNotNotifyTheAuthor(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")

	h.Request(http.MethodPatch, "/api/v1/users/me", aliceToken, map[string]any{"handle": "alice"}).
		ExpectStatus(http.StatusOK)
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/comments", aliceToken, map[string]any{
		"target_type": "trip",
		"target_id":   trip.ID,
		"body":        "โน้ตถึงตัวเอง @alice",
	}).ExpectStatus(http.StatusCreated)

	var inbox struct {
		Unread int `json:"unread"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/notifications", aliceToken, nil).Decode(&inbox)
	if inbox.Unread != 0 {
		t.Errorf("author got %d notifications for their own comment", inbox.Unread)
	}
}

// A poll answer rides in the votes table; the tally has to come back as the
// group actually answered it (A9.3).
func TestPollTallyCountsEachMemberOnce(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, bob, "editor")
	base := "/api/v1/trips/" + trip.ID

	var poll struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, base+"/polls", aliceToken, map[string]any{
		"question": "เอาโรงแรมไหน",
		"options":  []string{"ชินจูกุ", "อาซากุสะ"},
	}).ExpectStatus(http.StatusCreated).Decode(&poll)

	// Bob changes his mind — the second answer replaces the first.
	h.Request(http.MethodPost, base+"/polls/"+poll.ID+"/answer", bobToken, map[string]any{"option": 0}).
		ExpectStatus(http.StatusOK)

	var answered struct {
		Options []struct {
			Votes int `json:"votes"`
		} `json:"options"`
		Answered int `json:"answered"`
		MyAnswer int `json:"my_answer"`
	}
	h.Request(http.MethodPost, base+"/polls/"+poll.ID+"/answer", bobToken, map[string]any{"option": 1}).
		ExpectStatus(http.StatusOK).
		Decode(&answered)

	if answered.Answered != 1 {
		t.Errorf("answered = %d, want 1 — a changed answer is still one answer", answered.Answered)
	}
	if answered.Options[0].Votes != 0 || answered.Options[1].Votes != 1 {
		t.Errorf("tally = %d/%d, want 0/1", answered.Options[0].Votes, answered.Options[1].Votes)
	}
	if answered.MyAnswer != 1 {
		t.Errorf("my_answer = %d, want 1", answered.MyAnswer)
	}
}

func TestClosedPollRefusesAnswers(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")

	trip := h.Trip(alice, "อลิซไปโตเกียว")
	h.AddMember(trip, bob, "editor")
	base := "/api/v1/trips/" + trip.ID

	var poll struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, base+"/polls", aliceToken, map[string]any{
		"question": "เอาโรงแรมไหน",
		"options":  []string{"ชินจูกุ", "อาซากุสะ"},
	}).ExpectStatus(http.StatusCreated).Decode(&poll)

	// A member who did not open it cannot end it.
	h.Request(http.MethodPost, base+"/polls/"+poll.ID+"/close", bobToken, nil).ExpectDenied()

	h.Request(http.MethodPost, base+"/polls/"+poll.ID+"/close", aliceToken, nil).
		ExpectStatus(http.StatusOK)
	h.Request(http.MethodPost, base+"/polls/"+poll.ID+"/answer", bobToken, map[string]any{"option": 0}).
		ExpectStatus(http.StatusConflict)
}

func TestPollNeedsAtLeastTwoOptions(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/polls", aliceToken, map[string]any{
		"question": "เอาไหม",
		"options":  []string{"เอา", "   "},
	}).ExpectStatus(http.StatusBadRequest)
}
