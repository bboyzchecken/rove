package api

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// The parts of a trip room that are about the people in it (M9 — A9.2/A9.3,
// W9.3): the inbox, polls, and who is looking at this right now.
func (s *Server) registerCommunityRoutes(g *echo.Group) {
	view := s.TripRoleMiddleware(models.TripRoleViewer)
	edit := s.TripRoleMiddleware(models.TripRoleEditor)

	g.GET("/:tripId/polls", s.handleListPolls, view)
	g.POST("/:tripId/polls", s.handleCreatePoll, edit)
	g.POST("/:tripId/polls/:pollId/answer", s.handleAnswerPoll, edit)
	g.POST("/:tripId/polls/:pollId/close", s.handleClosePoll, edit)
	g.DELETE("/:tripId/polls/:pollId", s.handleDeletePoll, edit)

	// W9.3 — presence. Deliberately not persisted: "who is here" is true for
	// the next few seconds and false after that, which is not a row.
	g.POST("/:tripId/presence", s.handlePresence, view)
}

// registerInboxRoutes is mounted under /users/me: an inbox belongs to a person,
// not to a trip, and it spans every room they are in.
func (s *Server) registerInboxRoutes(g *echo.Group) {
	g.GET("/notifications", s.handleListNotifications)
	g.POST("/notifications/read", s.handleMarkNotificationsRead)
}

/* ---------------------------------------------------------------- inbox -- */

type notificationDTO struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	Link      string  `json:"link"`
	TripID    *string `json:"trip_id"`
	ActorID   string  `json:"actor_id"`
	Read      bool    `json:"read"`
	CreatedAt string  `json:"created_at"`
}

type inboxDTO struct {
	Unread int               `json:"unread"`
	Items  []notificationDTO `json:"items"`
}

func toNotificationDTO(n models.Notification) notificationDTO {
	return notificationDTO{
		ID:        n.ID,
		Kind:      n.Kind,
		Title:     n.Title,
		Body:      n.Body,
		Link:      n.Link,
		TripID:    n.TripID,
		ActorID:   n.ActorID,
		Read:      n.ReadAt != nil,
		CreatedAt: n.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func (s *Server) handleListNotifications(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	items, err := s.notifications.ListForUser(ctx, userID, 30)
	if err != nil {
		return request.Internal(c, "โหลดการแจ้งเตือนไม่สำเร็จ")
	}
	unread, _ := s.notifications.CountUnread(ctx, userID)

	out := inboxDTO{Unread: int(unread), Items: make([]notificationDTO, 0, len(items))}
	for _, n := range items {
		out.Items = append(out.Items, toNotificationDTO(n))
	}
	return c.JSON(http.StatusOK, out)
}

type markReadRequest struct {
	// Empty marks the whole inbox read — the "อ่านทั้งหมด" button.
	NotificationID string `json:"notification_id"`
}

func (s *Server) handleMarkNotificationsRead(c echo.Context) error {
	var req markReadRequest
	_ = c.Bind(&req)

	ctx := c.Request().Context()
	userID := request.UserID(c)

	var err error
	if req.NotificationID == "" {
		err = s.notifications.MarkAllRead(ctx, userID)
	} else {
		err = s.notifications.MarkRead(ctx, userID, req.NotificationID)
	}
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.handleListNotifications(c)
}

/* ------------------------------------------------------------- mentions -- */

// mentionPattern matches "@handle". Handles are the same charset the profile
// screen allows, so a Thai sentence ending in "@ตอง" does not half-match.
var mentionPattern = regexp.MustCompile(`@([A-Za-z0-9_.-]{2,60})`)

// notifyMentions turns "@handle" in a comment into inbox rows, and pushes to
// LINE for the recipients we can reach (A9.2).
//
// Only members of THIS trip are notified: an @mention is not a way to make a
// stranger's phone buzz.
func (s *Server) notifyMentions(ctx contextT, tripID, actorID, body, link string) {
	matches := mentionPattern.FindAllStringSubmatch(body, -1)
	if len(matches) == 0 {
		return
	}

	roster, err := s.loadMembers(ctx, tripID)
	if err != nil {
		return
	}

	byHandle := map[string]models.User{}
	for _, user := range roster.users {
		if user.Handle != nil && *user.Handle != "" {
			byHandle[strings.ToLower(*user.Handle)] = user
		}
	}

	actorName := "เพื่อนร่วมทริป"
	if actor, ok := roster.users[actorID]; ok && actor.DisplayName != "" {
		actorName = actor.DisplayName
	}
	tripTitle := ""
	if trip, err := s.trips.GetByID(ctx, tripID); err == nil {
		tripTitle = trip.Title
	}

	seen := map[string]bool{actorID: true} // nobody gets pinged by themselves
	out := make([]models.Notification, 0, len(matches))
	targets := make([]models.User, 0, len(matches))

	for _, match := range matches {
		user, ok := byHandle[strings.ToLower(match[1])]
		if !ok || seen[user.ID] {
			continue
		}
		seen[user.ID] = true

		out = append(out, models.Notification{
			UserID:  user.ID,
			TripID:  &tripID,
			Kind:    models.NotifyMention,
			Title:   actorName + " ทักถึงคุณใน \"" + tripTitle + "\"",
			Body:    trimTo(body, 140),
			Link:    link,
			ActorID: actorID,
		})
		targets = append(targets, user)
	}

	if err := s.notifications.CreateMany(ctx, out); err != nil {
		return
	}
	for _, user := range targets {
		if user.Provider == models.ProviderLine {
			s.notify.Push(ctx, user.ProviderUID,
				actorName+" ทักถึงคุณในทริป \""+tripTitle+"\"\n"+trimTo(body, 120))
		}
	}
}

// notifyOne is the single-recipient path — a task assigned, a poll opened.
func (s *Server) notifyOne(ctx contextT, userID, tripID, kind, title, body, link, actorID string) {
	if userID == "" || userID == actorID {
		return
	}
	_ = s.notifications.Create(ctx, &models.Notification{
		UserID:  userID,
		TripID:  &tripID,
		Kind:    kind,
		Title:   title,
		Body:    body,
		Link:    link,
		ActorID: actorID,
	})
	if user, err := s.users.GetByID(ctx, userID); err == nil && user.Provider == models.ProviderLine {
		s.notify.Push(ctx, user.ProviderUID, title+"\n"+body)
	}
}

func trimTo(s string, max int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max]) + "…"
}

/* ------------------------------------------------------------------ polls */

type pollOptionDTO struct {
	Index int      `json:"index"`
	Label string   `json:"label"`
	Votes int      `json:"votes"`
	Who   []string `json:"who"`
}

type pollDTO struct {
	ID        string          `json:"id"`
	Question  string          `json:"question"`
	ItemID    *string         `json:"item_id"`
	Options   []pollOptionDTO `json:"options"`
	Closed    bool            `json:"closed"`
	ClosesAt  *string         `json:"closes_at"`
	CreatedBy string          `json:"created_by"`
	CreatedAt string          `json:"created_at"`
	// -1 when this member has not answered yet.
	MyAnswer int `json:"my_answer"`
	// How many of the room have answered at all.
	Answered int `json:"answered"`
}

func (s *Server) toPollDTO(ctx contextT, poll models.Poll, userID string) pollDTO {
	labels := jsonStrings(toJSONRaw(poll.Options))
	options := make([]pollOptionDTO, 0, len(labels))
	for i, label := range labels {
		options = append(options, pollOptionDTO{Index: i, Label: label, Who: []string{}})
	}

	answered := 0
	myAnswer := -1
	if votes, err := s.collab.ListVotes(ctx, poll.TripID, models.TargetPoll, poll.ID); err == nil {
		for _, vote := range votes {
			if vote.Value < 0 || vote.Value >= len(options) {
				continue // an option that was edited away
			}
			options[vote.Value].Votes++
			options[vote.Value].Who = append(options[vote.Value].Who, vote.UserID)
			answered++
			if vote.UserID == userID {
				myAnswer = vote.Value
			}
		}
	}

	out := pollDTO{
		ID:        poll.ID,
		Question:  poll.Question,
		ItemID:    poll.ItemID,
		Options:   options,
		Closed:    poll.Closed,
		CreatedBy: poll.CreatedBy,
		CreatedAt: poll.CreatedAt.UTC().Format(time.RFC3339),
		MyAnswer:  myAnswer,
		Answered:  answered,
	}
	if poll.ClosesAt != nil {
		closes := poll.ClosesAt.UTC().Format(time.RFC3339)
		out.ClosesAt = &closes
	}
	return out
}

func (s *Server) handleListPolls(c echo.Context) error {
	ctx := c.Request().Context()

	polls, err := s.polls.ListByTrip(ctx, request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดโพลไม่สำเร็จ")
	}

	userID := request.UserID(c)
	out := make([]pollDTO, 0, len(polls))
	for _, poll := range polls {
		out = append(out, s.toPollDTO(ctx, poll, userID))
	}
	return c.JSON(http.StatusOK, out)
}

type createPollRequest struct {
	Question string   `json:"question" validate:"required"`
	Options  []string `json:"options" validate:"required"`
	ItemID   *string  `json:"item_id"`
	// Optional deadline, so a poll nobody answers stops nagging by itself.
	ClosesAt string `json:"closes_at"`
}

func (s *Server) handleCreatePoll(c echo.Context) error {
	var req createPollRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	options := make([]string, 0, len(req.Options))
	for _, option := range req.Options {
		if trimmed := strings.TrimSpace(option); trimmed != "" {
			options = append(options, trimmed)
		}
	}
	// Two is the smallest number of options that is a question rather than an
	// announcement; six is where a poll stops being answerable at a glance.
	if len(options) < 2 {
		return request.BadRequest(c, "ใส่ตัวเลือกอย่างน้อย 2 อย่าง")
	}
	if len(options) > 6 {
		return request.BadRequest(c, "ตัวเลือกเยอะเกินไป — เอาไม่เกิน 6 อย่าง")
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	actorID := request.UserID(c)

	poll := &models.Poll{
		TripID:    tripID,
		ItemID:    req.ItemID,
		Question:  strings.TrimSpace(req.Question),
		Options:   toDatatypesJSON(options),
		CreatedBy: actorID,
	}
	if closes, ok := parseDateParam(req.ClosesAt); ok {
		poll.ClosesAt = &closes
	}

	if err := s.polls.Create(ctx, poll); err != nil {
		return request.Internal(c, "สร้างโพลไม่สำเร็จ")
	}

	// Everyone else in the room is being asked something — that is an inbox
	// item, not just a line in a feed.
	if roster, err := s.loadMembers(ctx, tripID); err == nil {
		for _, member := range roster.members {
			s.notifyOne(ctx, member.UserID, tripID, models.NotifyPollOpened,
				"มีโพลใหม่ให้ตอบ", poll.Question, "/t/"+tripID+"/discussion", actorID)
		}
	}

	s.track(c, tripID, "เปิดโพล \""+poll.Question+"\"", events.TypePollChanged, "poll", poll.ID)
	return c.JSON(http.StatusCreated, s.toPollDTO(ctx, *poll, actorID))
}

type answerPollRequest struct {
	// -1 withdraws the answer, same gesture as un-voting a variant.
	Option int `json:"option"`
}

func (s *Server) handleAnswerPoll(c echo.Context) error {
	var req answerPollRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx := c.Request().Context()
	tripID := request.TripID(c)
	userID := request.UserID(c)

	poll, err := s.polls.Get(ctx, tripID, c.Param("pollId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบโพลนี้")
	}
	if poll.Closed {
		return request.Error(c, http.StatusConflict, "โพลนี้ปิดไปแล้ว")
	}
	if poll.ClosesAt != nil && time.Now().UTC().After(*poll.ClosesAt) {
		return request.Error(c, http.StatusConflict, "เลยเวลาตอบโพลนี้แล้ว")
	}

	labels := jsonStrings(toJSONRaw(poll.Options))
	if req.Option < -1 || req.Option >= len(labels) {
		return request.BadRequest(c, "ไม่มีตัวเลือกนี้")
	}

	err = s.collab.SetVote(ctx, &models.Vote{
		TripID:     tripID,
		TargetType: models.TargetPoll,
		TargetID:   poll.ID,
		UserID:     userID,
		Value:      req.Option,
		VotedAt:    time.Now().UTC(),
	})
	if err != nil {
		return request.Internal(c, "บันทึกคำตอบไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePollChanged, "poll", poll.ID)
	return c.JSON(http.StatusOK, s.toPollDTO(ctx, *poll, userID))
}

func (s *Server) handleClosePoll(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	poll, err := s.polls.Get(ctx, tripID, c.Param("pollId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบโพลนี้")
	}
	// The person who asked closes it, or the owner — otherwise anyone could
	// end a vote the moment it stopped going their way.
	if poll.CreatedBy != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ปิดโพลได้เฉพาะคนที่เปิดหรือเจ้าของทริป")
	}

	poll.Closed = true
	if err := s.polls.Update(ctx, poll); err != nil {
		return request.Internal(c, "ปิดโพลไม่สำเร็จ")
	}

	s.track(c, tripID, "ปิดโพล \""+poll.Question+"\"", events.TypePollChanged, "poll", poll.ID)
	return c.JSON(http.StatusOK, s.toPollDTO(ctx, *poll, request.UserID(c)))
}

func (s *Server) handleDeletePoll(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	poll, err := s.polls.Get(ctx, tripID, c.Param("pollId"))
	if err != nil {
		return request.NotFound(c, "ไม่พบโพลนี้")
	}
	if poll.CreatedBy != request.UserID(c) && request.TripRole(c) != models.TripRoleOwner {
		return request.Forbidden(c, "ลบโพลได้เฉพาะคนที่เปิดหรือเจ้าของทริป")
	}

	if err := s.polls.Delete(ctx, tripID, poll.ID); err != nil {
		return request.Internal(c, "ลบไม่สำเร็จ")
	}

	s.track(c, tripID, "", events.TypePollChanged, "poll", poll.ID)
	return c.NoContent(http.StatusNoContent)
}

/* --------------------------------------------------------------- presence */

type presenceRequest struct {
	// True while a comment box has focus and text in it.
	Typing bool `json:"typing"`
	// Which tab they are on, so the room can say who is looking at what.
	Tab string `json:"tab"`
}

// handlePresence publishes "I am here" and stores nothing (W9.3).
//
// Presence is true for the next few seconds and false after that, which is not
// a row in a database — it is an event. Clients keep their own short-lived map
// and forget anyone who stops pinging.
func (s *Server) handlePresence(c echo.Context) error {
	var req presenceRequest
	_ = c.Bind(&req)

	tripID := request.TripID(c)
	_ = s.hub.Publish(c.Request().Context(), tripID, events.Event{
		Type:       events.TypePresence,
		TargetType: "member",
		TargetID:   request.UserID(c),
		ActorID:    request.UserID(c),
		TS:         time.Now().UTC(),
		Payload:    toJSON(map[string]any{"typing": req.Typing, "tab": req.Tab}),
	})

	return c.NoContent(http.StatusNoContent)
}
