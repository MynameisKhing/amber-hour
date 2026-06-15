package hub

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"amber-hour/internal/metrics"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	redisChan       = "amber:broadcast"
	presenceTTL     = 25 * time.Second  // presence expires after 25s; ping refreshes every 15s
	earnAmount      = 25
	earnIntervalSec = 30
)

type Client struct {
	Hub      *Hub
	Nickname string
	Role     string
	Send     chan []byte
}

func NewClient(h *Hub, nickname, role string) *Client {
	return &Client{Hub: h, Nickname: nickname, Role: role, Send: make(chan []byte, 256)}
}

type inboundMsg struct {
	client *Client
	data   []byte
}

type jukeboxEntry struct {
	VideoID string `json:"videoId"`
	AddedBy string `json:"addedBy"`
}

type jukeboxNowPlaying struct {
	jukeboxEntry
	StartedAt time.Time `json:"startedAt"`
}

type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	inbound    chan inboundMsg
	shutdownCh chan struct{}
	rdb        *redis.Client
	db         *pgxpool.Pool

	// Presence is now Redis-backed for multi-pod safety.
	// Jukebox remains in-memory (high-frequency state, acceptable for now).
	jukeboxQueue []jukeboxEntry
	jukeboxNow   *jukeboxNowPlaying
	jukeboxSkips map[string]bool

	barStatusCache []byte
}

func New(rdb *redis.Client, db *pgxpool.Pool) *Hub {
	return &Hub{
		clients:      make(map[*Client]bool),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		inbound:      make(chan inboundMsg, 256),
		shutdownCh:   make(chan struct{}),
		rdb:          rdb,
		db:           db,
		jukeboxSkips: make(map[string]bool),
	}
}

func (h *Hub) Register(c *Client)             { h.register <- c }
func (h *Hub) Unregister(c *Client)           { h.unregister <- c }
func (h *Hub) Inbound(c *Client, data []byte) { h.inbound <- inboundMsg{c, data} }
func (h *Hub) Shutdown()                      { close(h.shutdownCh) }

func (h *Hub) broadcast(msg []byte) {
	if err := h.rdb.Publish(context.Background(), redisChan, msg).Err(); err != nil {
		log.Printf("redis publish: %v", err)
	}
}

func (h *Hub) fanout(msg []byte) {
	for c := range h.clients {
		select {
		case c.Send <- msg:
		default:
			delete(h.clients, c)
			close(c.Send)
		}
	}
}

func (h *Hub) fanoutExcept(msg []byte, except *Client) {
	for c := range h.clients {
		if c == except {
			continue
		}
		select {
		case c.Send <- msg:
		default:
			delete(h.clients, c)
			close(c.Send)
		}
	}
}

func (h *Hub) fanoutToNicks(msg []byte, nicks ...string) {
	set := make(map[string]struct{}, len(nicks))
	for _, n := range nicks {
		set[n] = struct{}{}
	}
	for c := range h.clients {
		if _, ok := set[c.Nickname]; ok {
			select {
			case c.Send <- msg:
			default:
				delete(h.clients, c)
				close(c.Send)
			}
		}
	}
}

// awardOnline grants earnAmount ฿ to every unique online patron and pushes each
// their fresh balance. Runs on the hub goroutine (map access + fanout are not
// concurrency-safe); the batched UPDATE keeps it quick.
func (h *Hub) awardOnline() {
	seen := make(map[string]bool)
	nicks := make([]string, 0, len(h.clients))
	for c := range h.clients {
		if seen[c.Nickname] {
			continue
		}
		seen[c.Nickname] = true
		nicks = append(nicks, c.Nickname)
	}
	if len(nicks) == 0 {
		return
	}

	rows, err := h.db.Query(context.Background(),
		`UPDATE users SET balance = balance + $1 WHERE username = ANY($2) RETURNING username, balance`,
		earnAmount, nicks,
	)
	if err != nil {
		log.Printf("award online: %v", err)
		return
	}
	type bal struct {
		nick    string
		balance float64
	}
	var updates []bal
	for rows.Next() {
		var b bal
		if rows.Scan(&b.nick, &b.balance) == nil {
			updates = append(updates, b)
		}
	}
	rows.Close()

	for _, b := range updates {
		frame, _ := json.Marshal(map[string]interface{}{
			"type":    "wallet",
			"payload": map[string]float64{"balance": b.balance},
		})
		h.fanoutToNicks(frame, b.nick)
	}
}

// setPresence registers a user in Redis with TTL (for multi-pod safe presence).
func (h *Hub) setPresence(ctx context.Context, nick, role string) {
	data, _ := json.Marshal(map[string]string{"nick": nick, "role": role})
	h.rdb.Set(ctx, "amber:users:"+nick, data, presenceTTL)
}

// presenceSnapshot reads all online users from Redis.
func (h *Hub) presenceSnapshot() []byte {
	type user struct {
		Nickname string `json:"nickname"`
		Role     string `json:"role"`
	}
	ctx := context.Background()
	keys, err := h.rdb.Keys(ctx, "amber:users:*").Result()
	if err != nil {
		keys = []string{}
	}
	users := make([]user, 0, len(keys))
	for _, key := range keys {
		data, _ := h.rdb.Get(ctx, key).Result()
		var u struct {
			Nick string `json:"nick"`
			Role string `json:"role"`
		}
		if json.Unmarshal([]byte(data), &u) == nil {
			users = append(users, user{u.Nick, u.Role})
		}
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"type":    "presence",
		"payload": map[string]interface{}{"users": users},
	})
	return payload
}

func (h *Hub) jukeboxPayload() map[string]interface{} {
	nClients := len(h.clients)
	threshold := 1
	if nClients > 1 {
		threshold = (nClients + 1) / 2
	}
	queue := h.jukeboxQueue
	if queue == nil {
		queue = []jukeboxEntry{}
	}
	payload := map[string]interface{}{
		"current":       nil,
		"queue":         queue,
		"skipVotes":     len(h.jukeboxSkips),
		"skipThreshold": threshold,
	}
	if h.jukeboxNow != nil {
		payload["current"] = map[string]interface{}{
			"videoId":   h.jukeboxNow.VideoID,
			"addedBy":   h.jukeboxNow.AddedBy,
			"startedAt": h.jukeboxNow.StartedAt.UTC().Format(time.RFC3339),
		}
	}
	return payload
}

type wsFrame struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type msgRecord struct {
	ID             int64               `json:"id"`
	SenderNick     string              `json:"senderNick"`
	Role           string              `json:"role"`
	Content        string              `json:"content"`
	MediaUrl       *string             `json:"mediaUrl,omitempty"`
	CreatedAt      string              `json:"createdAt"`
	EditedAt       *string             `json:"editedAt,omitempty"`
	ReplyTo        *int64              `json:"replyTo,omitempty"`
	ReplyToNick    *string             `json:"replyToNick,omitempty"`
	ReplyToContent *string             `json:"replyToContent,omitempty"`
	Reactions      map[string][]string `json:"reactions"`
	TargetNick     *string             `json:"targetNick,omitempty"`
}

func (h *Hub) loadReactionsForIDs(ctx context.Context, ids []int64) map[int64]map[string][]string {
	result := make(map[int64]map[string][]string)
	if len(ids) == 0 {
		return result
	}
	rows, err := h.db.Query(ctx,
		`SELECT message_id, emoji, nick FROM reactions WHERE message_id = ANY($1) ORDER BY created_at`,
		ids,
	)
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var msgID int64
		var emoji, nick string
		if rows.Scan(&msgID, &emoji, &nick) == nil {
			if result[msgID] == nil {
				result[msgID] = make(map[string][]string)
			}
			result[msgID][emoji] = append(result[msgID][emoji], nick)
		}
	}
	return result
}

func (h *Hub) reactionsForMessage(ctx context.Context, msgID int64) map[string][]string {
	reactions := make(map[string][]string)
	rows, err := h.db.Query(ctx,
		`SELECT emoji, nick FROM reactions WHERE message_id = $1 ORDER BY created_at`,
		msgID,
	)
	if err != nil {
		return reactions
	}
	defer rows.Close()
	for rows.Next() {
		var emoji, nick string
		if rows.Scan(&emoji, &nick) == nil {
			reactions[emoji] = append(reactions[emoji], nick)
		}
	}
	return reactions
}

func (h *Hub) sendHistory(c *Client) {
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `
		SELECT m.id, m.sender_nick, m.role, m.content, m.media_url, m.created_at, m.edited_at,
		       m.reply_to, p.sender_nick, p.content
		FROM messages m
		LEFT JOIN messages p ON p.id = m.reply_to
		WHERE m.deleted_at IS NULL AND (m.type = 'chat' OR m.type IS NULL)
		ORDER BY m.created_at DESC
		LIMIT 50
	`)
	if err != nil {
		log.Printf("history query: %v", err)
		return
	}
	defer rows.Close()

	msgs := make([]msgRecord, 0, 50)
	ids := make([]int64, 0, 50)
	for rows.Next() {
		var (
			id          int64
			senderNick  string
			role        string
			content     string
			mediaUrl    *string
			createdAt   time.Time
			editedAt    *time.Time
			replyTo     *int64
			replyNick   *string
			replyText   *string
		)
		if err := rows.Scan(&id, &senderNick, &role, &content, &mediaUrl, &createdAt, &editedAt,
			&replyTo, &replyNick, &replyText); err != nil {
			continue
		}
		rec := msgRecord{
			ID:             id,
			SenderNick:     senderNick,
			Role:           role,
			Content:        content,
			MediaUrl:       mediaUrl,
			CreatedAt:      createdAt.UTC().Format(time.RFC3339),
			ReplyTo:        replyTo,
			ReplyToNick:    replyNick,
			ReplyToContent: replyText,
			Reactions:      make(map[string][]string),
		}
		if editedAt != nil {
			s := editedAt.UTC().Format(time.RFC3339)
			rec.EditedAt = &s
		}
		msgs = append(msgs, rec)
		ids = append(ids, id)
	}
	rows.Close()

	if len(ids) > 0 {
		rxMap := h.loadReactionsForIDs(ctx, ids)
		for i := range msgs {
			if r, ok := rxMap[msgs[i].ID]; ok {
				msgs[i].Reactions = r
			}
		}
	}

	// reverse DESC → ASC (chronological)
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	out, _ := json.Marshal(map[string]interface{}{
		"type":    "history",
		"payload": map[string]interface{}{"messages": msgs},
	})
	select {
	case c.Send <- out:
	default:
	}
}

func (h *Hub) sendWhisperHistory(c *Client, targetNick string) {
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `
		SELECT m.id, m.sender_nick, m.role, m.content, m.media_url, m.created_at, m.edited_at,
		       m.reply_to, p.sender_nick, p.content, m.target_nick
		FROM messages m
		LEFT JOIN messages p ON p.id = m.reply_to
		WHERE m.deleted_at IS NULL
		  AND m.type = 'whisper'
		  AND ((m.sender_nick = $1 AND m.target_nick = $2) OR (m.sender_nick = $2 AND m.target_nick = $1))
		ORDER BY m.created_at DESC
		LIMIT 50
	`, c.Nickname, targetNick)
	if err != nil {
		log.Printf("whisper history query: %v", err)
		return
	}
	defer rows.Close()

	msgs := make([]msgRecord, 0, 50)
	ids := make([]int64, 0, 50)
	for rows.Next() {
		var (
			id            int64
			senderNick    string
			role          string
			content       string
			mediaUrl      *string
			createdAt     time.Time
			editedAt      *time.Time
			replyTo       *int64
			replyNick     *string
			replyText     *string
			targetNickPtr *string
		)
		if err := rows.Scan(&id, &senderNick, &role, &content, &mediaUrl, &createdAt, &editedAt,
			&replyTo, &replyNick, &replyText, &targetNickPtr); err != nil {
			continue
		}
		rec := msgRecord{
			ID:             id,
			SenderNick:     senderNick,
			Role:           role,
			Content:        content,
			MediaUrl:       mediaUrl,
			CreatedAt:      createdAt.UTC().Format(time.RFC3339),
			ReplyTo:        replyTo,
			ReplyToNick:    replyNick,
			ReplyToContent: replyText,
			Reactions:      make(map[string][]string),
			TargetNick:     targetNickPtr,
		}
		if editedAt != nil {
			s := editedAt.UTC().Format(time.RFC3339)
			rec.EditedAt = &s
		}
		msgs = append(msgs, rec)
		ids = append(ids, id)
	}
	rows.Close()

	if len(ids) > 0 {
		rxMap := h.loadReactionsForIDs(ctx, ids)
		for i := range msgs {
			if r, ok := rxMap[msgs[i].ID]; ok {
				msgs[i].Reactions = r
			}
		}
	}

	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	out, _ := json.Marshal(map[string]interface{}{
		"type": "whisper_history",
		"payload": map[string]interface{}{
			"messages":   msgs,
			"targetNick": targetNick,
		},
	})
	select {
	case c.Send <- out:
	default:
	}
}

func validVideoID(s string) bool {
	if s == "" || len(s) > 20 {
		return false
	}
	for _, r := range s {
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return false
		}
	}
	return true
}


func (h *Hub) jukeboxStateMsg() []byte {
	out, _ := json.Marshal(map[string]interface{}{
		"type":    "jukebox_state",
		"payload": h.jukeboxPayload(),
	})
	return out
}

func (h *Hub) sendJukeboxState(c *Client) {
	msg := h.jukeboxStateMsg()
	select {
	case c.Send <- msg:
	default:
	}
}

func (h *Hub) sendBarStatus(c *Client) {
	msg := h.barStatusCache
	if msg == nil {
		msg, _ = json.Marshal(map[string]interface{}{
			"type":    "bar_status",
			"payload": map[string]interface{}{"open": true, "lastCallAt": nil},
		})
	}
	select {
	case c.Send <- msg:
	default:
	}
}

func (h *Hub) broadcastJukeboxState() {
	h.broadcast(h.jukeboxStateMsg())
}

func (h *Hub) advanceQueue(ctx context.Context) {
	if h.jukeboxNow != nil {
		h.db.Exec(ctx,
			`INSERT INTO song_history (video_id, added_by) VALUES ($1, $2)`,
			h.jukeboxNow.VideoID, h.jukeboxNow.AddedBy,
		)
	}
	if len(h.jukeboxQueue) > 0 {
		next := h.jukeboxQueue[0]
		h.jukeboxQueue = h.jukeboxQueue[1:]
		h.jukeboxNow = &jukeboxNowPlaying{jukeboxEntry: next, StartedAt: time.Now().UTC()}
	} else {
		h.jukeboxNow = nil
	}
	h.jukeboxSkips = make(map[string]bool)
	h.broadcastJukeboxState()
}

var allowedEmojis = map[string]bool{
	"👍": true, "❤️": true, "😂": true, "😮": true, "🔥": true,
}

func (h *Hub) handleInbound(c *Client, data []byte) {
	var frame wsFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		return
	}
	metrics.WSMessages.WithLabelValues(frame.Type).Inc()
	switch frame.Type {
	case "ping":
		// Refresh presence TTL in Redis on heartbeat (every 15s from client)
		h.setPresence(context.Background(), c.Nickname, c.Role)

	case "typing":
		out, _ := json.Marshal(map[string]interface{}{
			"type":    "typing",
			"payload": map[string]string{"nickname": c.Nickname},
		})
		h.fanoutExcept(out, c)

	case "typing_stop":
		out, _ := json.Marshal(map[string]interface{}{
			"type":    "typing_stop",
			"payload": map[string]string{"nickname": c.Nickname},
		})
		h.fanoutExcept(out, c)

	case "chat":
		var body struct {
			Content  string `json:"content"`
			MediaUrl string `json:"mediaUrl"`
			ReplyTo  *int64 `json:"replyTo"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if body.Content == "" && body.MediaUrl == "" {
			return
		}
		ctx := context.Background()
		now := time.Now().UTC()
		var mediaPtr *string
		if body.MediaUrl != "" {
			mediaPtr = &body.MediaUrl
		}

		// resolve the parent message for a reply preview (and validate it exists)
		var replyToNick, replyToContent *string
		if body.ReplyTo != nil {
			var pNick, pContent string
			if err := h.db.QueryRow(ctx,
				`SELECT sender_nick, content FROM messages WHERE id = $1 AND deleted_at IS NULL`,
				*body.ReplyTo,
			).Scan(&pNick, &pContent); err != nil {
				body.ReplyTo = nil // parent gone — send as a normal message
			} else {
				replyToNick, replyToContent = &pNick, &pContent
			}
		}

		var msgID int64
		if err := h.db.QueryRow(ctx,
			`INSERT INTO messages (sender_nick, role, content, media_url, reply_to, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			c.Nickname, c.Role, body.Content, mediaPtr, body.ReplyTo, now,
		).Scan(&msgID); err != nil {
			log.Printf("save message: %v", err)
			return
		}
		chatPayload := map[string]interface{}{
			"id":         msgID,
			"senderNick": c.Nickname,
			"role":       c.Role,
			"content":    body.Content,
			"createdAt":  now.Format(time.RFC3339),
			"reactions":  map[string][]string{},
		}
		if body.MediaUrl != "" {
			chatPayload["mediaUrl"] = body.MediaUrl
		}
		if body.ReplyTo != nil {
			chatPayload["replyTo"] = *body.ReplyTo
			chatPayload["replyToNick"] = replyToNick
			chatPayload["replyToContent"] = replyToContent
		}
		out, _ := json.Marshal(map[string]interface{}{"type": "chat", "payload": chatPayload})
		h.broadcast(out)

	case "reaction":
		var body struct {
			MessageID int64  `json:"messageId"`
			Emoji     string `json:"emoji"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if !allowedEmojis[body.Emoji] {
			return
		}
		ctx := context.Background()
		res, err := h.db.Exec(ctx,
			`DELETE FROM reactions WHERE message_id = $1 AND nick = $2 AND emoji = $3`,
			body.MessageID, c.Nickname, body.Emoji,
		)
		if err != nil {
			return
		}
		if res.RowsAffected() == 0 {
			h.db.Exec(ctx,
				`INSERT INTO reactions (message_id, nick, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
				body.MessageID, c.Nickname, body.Emoji,
			)
		}
		reactions := h.reactionsForMessage(ctx, body.MessageID)
		out, _ := json.Marshal(map[string]interface{}{
			"type": "reaction",
			"payload": map[string]interface{}{
				"messageId": body.MessageID,
				"reactions": reactions,
			},
		})
		h.broadcast(out)

	case "edit_message":
		var body struct {
			MessageID int64  `json:"messageId"`
			Content   string `json:"content"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if body.Content == "" {
			return
		}
		ctx := context.Background()
		// only the author may edit, and only a non-deleted text message
		now := time.Now().UTC()
		ct, err := h.db.Exec(ctx,
			`UPDATE messages SET content = $1, edited_at = $2
			 WHERE id = $3 AND sender_nick = $4 AND deleted_at IS NULL`,
			body.Content, now, body.MessageID, c.Nickname,
		)
		if err != nil || ct.RowsAffected() == 0 {
			return
		}
		out, _ := json.Marshal(map[string]interface{}{
			"type": "edit_message",
			"payload": map[string]interface{}{
				"messageId": body.MessageID,
				"content":   body.Content,
				"editedAt":  now.Format(time.RFC3339),
			},
		})
		h.broadcast(out)

	case "delete_message":
		var body struct {
			MessageID int64 `json:"messageId"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		ctx := context.Background()
		// staff can delete anything; everyone else only their own messages
		var query string
		var args []interface{}
		if c.Role == "staff" {
			query = `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
			args = []interface{}{body.MessageID}
		} else {
			query = `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND sender_nick = $2 AND deleted_at IS NULL`
			args = []interface{}{body.MessageID, c.Nickname}
		}
		ct, err := h.db.Exec(ctx, query, args...)
		if err != nil || ct.RowsAffected() == 0 {
			return
		}
		out, _ := json.Marshal(map[string]interface{}{
			"type":    "delete_message",
			"payload": map[string]interface{}{"messageId": body.MessageID},
		})
		h.broadcast(out)

	case "whisper":
		var body struct {
			Content    string `json:"content"`
			TargetNick string `json:"targetNick"`
			MediaUrl   string `json:"mediaUrl"`
			ReplyTo    *int64 `json:"replyTo"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if (body.Content == "" && body.MediaUrl == "") || body.TargetNick == "" || body.TargetNick == c.Nickname {
			return
		}
		ctx := context.Background()
		now := time.Now().UTC()
		var mediaPtr *string
		if body.MediaUrl != "" {
			mediaPtr = &body.MediaUrl
		}
		var msgID int64
		if err := h.db.QueryRow(ctx,
			`INSERT INTO messages (sender_nick, role, content, media_url, reply_to, created_at, type, target_nick)
			 VALUES ($1, $2, $3, $4, $5, $6, 'whisper', $7) RETURNING id`,
			c.Nickname, c.Role, body.Content, mediaPtr, body.ReplyTo, now, body.TargetNick,
		).Scan(&msgID); err != nil {
			log.Printf("save whisper: %v", err)
			return
		}
		whisperPayload := map[string]interface{}{
			"id":         msgID,
			"senderNick": c.Nickname,
			"role":       c.Role,
			"content":    body.Content,
			"createdAt":  now.Format(time.RFC3339),
			"reactions":  map[string][]string{},
			"targetNick": body.TargetNick,
		}
		if body.MediaUrl != "" {
			whisperPayload["mediaUrl"] = body.MediaUrl
		}
		out, _ := json.Marshal(map[string]interface{}{"type": "whisper", "payload": whisperPayload})
		h.fanoutToNicks(out, c.Nickname, body.TargetNick)

	case "whisper_history":
		var body struct {
			TargetNick string `json:"targetNick"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if body.TargetNick == "" {
			return
		}
		h.sendWhisperHistory(c, body.TargetNick)

	case "jukebox_add":
		var body struct {
			VideoID string `json:"videoId"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if !validVideoID(body.VideoID) {
			return
		}
		entry := jukeboxEntry{VideoID: body.VideoID, AddedBy: c.Nickname}
		if h.jukeboxNow == nil {
			h.jukeboxNow = &jukeboxNowPlaying{jukeboxEntry: entry, StartedAt: time.Now().UTC()}
		} else {
			h.jukeboxQueue = append(h.jukeboxQueue, entry)
		}
		h.broadcastJukeboxState()

	case "jukebox_vote_skip":
		if h.jukeboxNow == nil {
			return
		}
		h.jukeboxSkips[c.Nickname] = true
		nClients := len(h.clients)
		threshold := 1
		if nClients > 1 {
			threshold = (nClients + 1) / 2
		}
		if len(h.jukeboxSkips) >= threshold {
			h.advanceQueue(context.Background())
		} else {
			h.broadcastJukeboxState()
		}

	case "jukebox_ended":
		var body struct {
			VideoID string `json:"videoId"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		if h.jukeboxNow == nil || h.jukeboxNow.VideoID != body.VideoID {
			return
		}
		h.advanceQueue(context.Background())

	case "cheers":
		out, _ := json.Marshal(map[string]interface{}{
			"type":    "cheers",
			"payload": map[string]string{"from": c.Nickname},
		})
		h.broadcast(out)

	case "bar_status":
		if c.Role != "staff" {
			return
		}
		var body struct {
			Open       bool    `json:"open"`
			LastCallAt *string `json:"lastCallAt"`
		}
		if err := json.Unmarshal(frame.Payload, &body); err != nil {
			return
		}
		out, _ := json.Marshal(map[string]interface{}{
			"type": "bar_status",
			"payload": map[string]interface{}{
				"open":       body.Open,
				"lastCallAt": body.LastCallAt,
			},
		})
		h.rdb.Set(context.Background(), "amber:bar_status", out, 0)
		h.barStatusCache = out
		h.broadcast(out)
	}
}

func (h *Hub) Run() {
	ctx := context.Background()

	// Restore bar status from Redis if present
	if data, err := h.rdb.Get(ctx, "amber:bar_status").Bytes(); err == nil {
		h.barStatusCache = data
	}

	sub := h.rdb.Subscribe(ctx, redisChan)
	defer sub.Close()
	redisMsgs := sub.Channel()

	earnTicker := time.NewTicker(earnIntervalSec * time.Second)
	defer earnTicker.Stop()

	for {
		select {
		case <-h.shutdownCh:
			out, _ := json.Marshal(map[string]interface{}{
				"type":    "system",
				"payload": map[string]string{"message": "Bar is closing, reconnecting soon…"},
			})
			h.fanout(out)
			return

		case c := <-h.register:
			h.clients[c] = true
			metrics.WSConnected.Inc()
			h.setPresence(ctx, c.Nickname, c.Role) // Redis TTL for multi-pod
			h.sendHistory(c)
			h.fanout(h.presenceSnapshot())
			h.sendJukeboxState(c)
			h.sendBarStatus(c)

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.Send)
				metrics.WSConnected.Dec()
				h.rdb.Del(ctx, "amber:users:"+c.Nickname) // Clear from Redis
				stopMsg, _ := json.Marshal(map[string]interface{}{
					"type":    "typing_stop",
					"payload": map[string]string{"nickname": c.Nickname},
				})
				h.fanout(stopMsg)
				h.fanout(h.presenceSnapshot())
			}

		case im := <-h.inbound:
			h.handleInbound(im.client, im.data)

		case <-earnTicker.C:
			h.awardOnline()

		case msg, ok := <-redisMsgs:
			if !ok {
				return
			}
			h.fanout([]byte(msg.Payload))
		}
	}
}
