package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"amber-hour/internal/ai"
	"amber-hour/internal/auth"
	"amber-hour/internal/hub"
	"amber-hour/internal/metrics"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type ctxKey string

const claimsKey ctxKey = "claims"

func Register(mux *http.ServeMux, h *hub.Hub, db *pgxpool.Pool, rdb *redis.Client, uploadDir string) {
	mux.HandleFunc("/healthz", handleHealth(db))
	mux.HandleFunc("/readyz", handleReadyz(db, rdb))
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/api/signup", handleSignup(db))
	mux.HandleFunc("/api/login", handleLogin(db))
	mux.HandleFunc("/api/menu", withAuth(handleMenu(db)))
	mux.HandleFunc("/api/menu/", withAuth(handleMenuAction(db)))
	mux.HandleFunc("/api/wallet", withAuth(handleWallet(db)))
	mux.HandleFunc("/api/leaderboard", withAuth(handleLeaderboard(db)))
	mux.HandleFunc("/api/upload", withAuth(handleUpload(uploadDir)))
	mux.HandleFunc("/api/invite", withAuth(handleInvite(db)))
	mux.HandleFunc("/api/ai/bartender", withAuth(handleAIBartender(db)))
	mux.HandleFunc("/api/orders/me", withAuth(handleMyOrders(db)))
	mux.HandleFunc("/api/orders/", withAuth(handleOrderAction(db)))
	mux.HandleFunc("/api/orders", withAuth(handleOrders(db)))
	mux.HandleFunc("/api/guestbook", handleGuestbook(db))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))
	mux.HandleFunc("/ws", handleWS(h))
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func Instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sr := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sr, r)
		metrics.HTTPRequests.WithLabelValues(r.Method, r.URL.Path, fmt.Sprintf("%d", sr.status)).Inc()
	})
}

func handleHealth(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			http.Error(w, `{"status":"db_down"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func handleReadyz(db *pgxpool.Pool, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			http.Error(w, `{"status":"db_down"}`, http.StatusServiceUnavailable)
			return
		}
		if err := rdb.Ping(r.Context()).Err(); err != nil {
			http.Error(w, `{"status":"redis_down"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// handleSignup creates a new account (nickname + password + role). The access
// code is not needed to register — it is presented at login to join a session.
func handleSignup(db *pgxpool.Pool) http.HandlerFunc {
	type req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body req
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		body.Username = strings.TrimSpace(body.Username)

		if len(body.Username) < 2 || len(body.Username) > 32 {
			writeErr(w, http.StatusBadRequest, "Nickname must be 2–32 characters")
			return
		}
		if len(body.Password) < 6 {
			writeErr(w, http.StatusBadRequest, "Password must be at least 6 characters")
			return
		}
		if body.Role != "customer" && body.Role != "staff" {
			body.Role = "customer"
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "internal error")
			return
		}

		_, err = db.Exec(r.Context(),
			"INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
			body.Username, string(hash), body.Role,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				writeErr(w, http.StatusConflict, "That nickname is already taken")
				return
			}
			writeErr(w, http.StatusInternalServerError, "could not create account")
			return
		}

		issueSession(w, r, db, body.Username, body.Role)
	}
}

// handleLogin authenticates an account by nickname + password, then requires a
// valid access code to join the session.
func handleLogin(db *pgxpool.Pool) http.HandlerFunc {
	type req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body req
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		body.Username = strings.TrimSpace(body.Username)

		var username, hash, role string
		err := db.QueryRow(r.Context(),
			"SELECT username, password_hash, role FROM users WHERE lower(username) = lower($1)",
			body.Username,
		).Scan(&username, &hash, &role)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "Wrong nickname or password")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
			writeErr(w, http.StatusUnauthorized, "Wrong nickname or password")
			return
		}

		// valid account — now require an active access code to join the session
		var isActive bool
		if err := db.QueryRow(r.Context(),
			"SELECT is_active FROM access_codes WHERE code = $1", body.Code,
		).Scan(&isActive); err != nil || !isActive {
			writeErr(w, http.StatusUnauthorized, "Invalid access code")
			return
		}

		issueSession(w, r, db, username, role)
	}
}

// issueSession signs a JWT, records the join, and writes the auth response.
func issueSession(w http.ResponseWriter, r *http.Request, db *pgxpool.Pool, nickname, role string) {
	token, err := auth.Issue(nickname, role)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal error")
		return
	}
	db.Exec(r.Context(),
		"INSERT INTO sessions (nickname, role) VALUES ($1, $2)",
		nickname, role,
	)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token":    token,
		"nickname": nickname,
		"role":     role,
	})
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func handleMenu(db *pgxpool.Pool) http.HandlerFunc {
	type item struct {
		ID          int64   `json:"id"`
		Category    string  `json:"category"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		IsAvailable bool    `json:"isAvailable"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			// Staff add a new menu item.
			claims := r.Context().Value(claimsKey).(*auth.Claims)
			if claims.Role != "staff" {
				writeErr(w, http.StatusForbidden, "staff only")
				return
			}
			var body struct {
				Category    string  `json:"category"`
				Name        string  `json:"name"`
				Description string  `json:"description"`
				Price       float64 `json:"price"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeErr(w, http.StatusBadRequest, "bad request")
				return
			}
			body.Category = strings.TrimSpace(body.Category)
			body.Name = strings.TrimSpace(body.Name)
			body.Description = strings.TrimSpace(body.Description)
			if body.Name == "" || body.Category == "" {
				writeErr(w, http.StatusBadRequest, "name and category required")
				return
			}
			if body.Price < 0 {
				writeErr(w, http.StatusBadRequest, "price must be 0 or more")
				return
			}
			var id int64
			if err := db.QueryRow(r.Context(),
				`INSERT INTO menu_items (category, name, description, price) VALUES ($1, $2, $3, $4) RETURNING id`,
				body.Category, body.Name, body.Description, body.Price,
			).Scan(&id); err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(item{id, body.Category, body.Name, body.Description, body.Price, true})

		case http.MethodGet:
			rows, err := db.Query(r.Context(),
				"SELECT id, category, name, description, price, is_available FROM menu_items ORDER BY category, id",
			)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			items := []item{}
			for rows.Next() {
				var it item
				if err := rows.Scan(&it.ID, &it.Category, &it.Name, &it.Description, &it.Price, &it.IsAvailable); err != nil {
					continue
				}
				items = append(items, it)
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(items)

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// PATCH /api/menu/{id} — staff toggle availability
func handleMenuAction(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		if claims.Role != "staff" {
			writeErr(w, http.StatusForbidden, "staff only")
			return
		}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/") // ["api","menu","{id}"]
		if len(parts) < 3 {
			http.NotFound(w, r)
			return
		}
		id, err := strconv.ParseInt(parts[2], 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid id")
			return
		}
		var body struct {
			IsAvailable *bool `json:"isAvailable"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IsAvailable == nil {
			writeErr(w, http.StatusBadRequest, "isAvailable required")
			return
		}
		ct, err := db.Exec(r.Context(),
			`UPDATE menu_items SET is_available = $1 WHERE id = $2`,
			*body.IsAvailable, id,
		)
		if err != nil || ct.RowsAffected() == 0 {
			writeErr(w, http.StatusNotFound, "menu item not found")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}
}

// GET /api/wallet — current patron's ฿ balance
func handleWallet(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		var balance float64
		if err := db.QueryRow(r.Context(),
			`SELECT balance FROM users WHERE username = $1`, claims.Nickname,
		).Scan(&balance); err != nil {
			writeErr(w, http.StatusNotFound, "wallet not found")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]float64{"balance": balance})
	}
}

// GET /api/leaderboard — richest patrons (top 10 customers)
func handleLeaderboard(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(r.Context(),
			`SELECT username, balance FROM users WHERE role = 'customer' ORDER BY balance DESC, username ASC LIMIT 10`,
		)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		defer rows.Close()
		type entry struct {
			Nickname string  `json:"nickname"`
			Balance  float64 `json:"balance"`
		}
		list := []entry{}
		for rows.Next() {
			var e entry
			if rows.Scan(&e.Nickname, &e.Balance) == nil {
				list = append(list, e)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

func withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		token = strings.TrimPrefix(token, "Bearer ")
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		claims, err := auth.Parse(token)
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func handleWS(h *hub.Hub) http.HandlerFunc {
	return withAuth(func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		serveWS(h, w, r, claims)
	})
}

func handleUpload(uploadDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, `{"error":"image too large (max 10 MB)"}`, http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, `{"error":"no file"}`, http.StatusBadRequest)
			return
		}
		defer file.Close()

		buf := make([]byte, 512)
		n, _ := file.Read(buf)
		mime := http.DetectContentType(buf[:n])
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if !strings.HasPrefix(mime, "image/") {
			http.Error(w, `{"error":"only images allowed"}`, http.StatusBadRequest)
			return
		}

		ext := filepath.Ext(header.Filename)
		name := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		out, err := os.Create(filepath.Join(uploadDir, name))
		if err != nil {
			http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
			return
		}
		defer out.Close()
		if _, err := io.Copy(out, file); err != nil {
			http.Error(w, `{"error":"write failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": "/uploads/" + name})
	}
}

func handleInvite(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(r.Context(),
			`SELECT code FROM access_codes WHERE is_active = true ORDER BY created_at`,
		)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		codes := []string{}
		for rows.Next() {
			var code string
			if rows.Scan(&code) == nil {
				codes = append(codes, code)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"codes": codes})
	}
}

// ── AI Bartender ──────────────────────────────────────────────────────────────

func handleAIBartender(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		_ = claims

		var body struct {
			Type       string `json:"type"`
			MenuItemID int64  `json:"menuItemId"`
			Mood       string `json:"mood"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}

		var prompt string
		switch body.Type {
		case "read_mind":
			var name, desc string
			if err := db.QueryRow(r.Context(),
				`SELECT name, description FROM menu_items WHERE id = $1 AND is_available = true`,
				body.MenuItemID,
			).Scan(&name, &desc); err != nil {
				writeErr(w, http.StatusNotFound, "menu item not found")
				return
			}
			prompt = fmt.Sprintf(
				"You are the cool cyberpunk bartender at Amber Hour bar. Someone orders '%s' (%s). What does that say about their vibe? 2-3 sentences, punchy and sharp. Reply in English.",
				name, desc,
			)
		case "recommend":
			if strings.TrimSpace(body.Mood) == "" {
				writeErr(w, http.StatusBadRequest, "mood required")
				return
			}
			rows, err := db.Query(r.Context(),
				`SELECT name FROM menu_items WHERE is_available = true ORDER BY id LIMIT 10`,
			)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			defer rows.Close()
			var names []string
			for rows.Next() {
				var n string
				if rows.Scan(&n) == nil {
					names = append(names, n)
				}
			}
			if rows.Err() != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			prompt = fmt.Sprintf(
				"You are the cool cyberpunk bartender at Amber Hour bar. A customer says: '%s'. Recommend a drink from this menu: %s. 2-3 sentences, punchy and sharp. Reply in English.",
				body.Mood, strings.Join(names, ", "),
			)
		case "pick_for_me":
			if strings.TrimSpace(body.Mood) == "" {
				writeErr(w, http.StatusBadRequest, "request required")
				return
			}
			type menuItemFull struct {
				ID          int64
				Name        string
				Description string
				Price       float64
			}
			menuRows, err := db.Query(r.Context(),
				`SELECT id, name, description, price FROM menu_items WHERE is_available = true ORDER BY id`,
			)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			var allItems []menuItemFull
			for menuRows.Next() {
				var it menuItemFull
				if menuRows.Scan(&it.ID, &it.Name, &it.Description, &it.Price) == nil {
					allItems = append(allItems, it)
				}
			}
			menuRows.Close()
			if menuRows.Err() != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}

			var itemLines strings.Builder
			for _, it := range allItems {
				itemLines.WriteString(fmt.Sprintf("ID=%d | %s — %s (฿%.0f)\n", it.ID, it.Name, it.Description, it.Price))
			}
			aiPrompt := fmt.Sprintf(
				"You are the cool cyberpunk bartender at Amber Hour bar. A customer says: \"%s\"\n\nTonight's available drinks:\n%s\nPick 2-3 drinks that best match this customer. Reply ONLY with valid JSON, no markdown fences, no extra text:\n{\"summary\":\"one punchy sentence in English\",\"picks\":[{\"id\":1,\"reason\":\"short reason in English\"}]}",
				body.Mood, itemLines.String(),
			)
			aiResp, aiErr := ai.AskBartender(r.Context(), aiPrompt, 600)
			if aiErr != nil {
				writeErr(w, http.StatusInternalServerError, "AI unavailable")
				return
			}
			// Strip markdown fences Gemini sometimes adds
			cleaned := strings.TrimSpace(aiResp)
			if idx := strings.Index(cleaned, "{"); idx > 0 {
				cleaned = cleaned[idx:]
			}
			if idx := strings.LastIndex(cleaned, "}"); idx >= 0 && idx < len(cleaned)-1 {
				cleaned = cleaned[:idx+1]
			}
			var aiResult struct {
				Summary string `json:"summary"`
				Picks   []struct {
					ID     int64  `json:"id"`
					Reason string `json:"reason"`
				} `json:"picks"`
			}
			type enrichedPick struct {
				ID     int64   `json:"id"`
				Name   string  `json:"name"`
				Price  float64 `json:"price"`
				Reason string  `json:"reason"`
			}
			var picks []enrichedPick
			if err := json.Unmarshal([]byte(cleaned), &aiResult); err == nil {
				for _, p := range aiResult.Picks {
					for _, it := range allItems {
						if it.ID == p.ID {
							picks = append(picks, enrichedPick{it.ID, it.Name, it.Price, p.Reason})
							break
						}
					}
				}
			}
			summary := aiResult.Summary
			if summary == "" {
				summary = aiResp
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{"response": summary, "picks": picks})
			return
		default:
			writeErr(w, http.StatusBadRequest, "invalid type")
			return
		}

		response, err := ai.AskBartender(r.Context(), prompt, 300)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "AI unavailable")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"response": response})
	}
}

// ── Orders ────────────────────────────────────────────────────────────────────

type orderItemRow struct {
	MenuItemID   int64   `json:"menuItemId"`
	MenuItemName string  `json:"name"`
	Price        float64 `json:"price"`
	Qty          int     `json:"qty"`
}

type orderRow struct {
	ID           int64          `json:"id"`
	CustomerNick string         `json:"customerNick"`
	Status       string         `json:"status"`
	CreatedAt    string         `json:"createdAt"`
	Items        []orderItemRow `json:"items"`
}

func scanOrders(ctx context.Context, db *pgxpool.Pool, whereClause string, args ...any) ([]orderRow, error) {
	rows, err := db.Query(ctx, `
		SELECT o.id, o.customer_nick, o.status, o.created_at,
		       oi.menu_item_id, m.name, m.price, oi.qty
		FROM orders o
		JOIN order_items oi ON oi.order_id = o.id
		JOIN menu_items m ON m.id = oi.menu_item_id
		`+whereClause+`
		ORDER BY o.created_at DESC, oi.id`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orderMap := map[int64]*orderRow{}
	var orderIDs []int64
	for rows.Next() {
		var (
			oID   int64
			nick  string
			st    string
			ca    time.Time
			itRow orderItemRow
		)
		if err := rows.Scan(&oID, &nick, &st, &ca, &itRow.MenuItemID, &itRow.MenuItemName, &itRow.Price, &itRow.Qty); err != nil {
			continue
		}
		if _, exists := orderMap[oID]; !exists {
			orderMap[oID] = &orderRow{
				ID:           oID,
				CustomerNick: nick,
				Status:       st,
				CreatedAt:    ca.UTC().Format(time.RFC3339),
				Items:        []orderItemRow{},
			}
			orderIDs = append(orderIDs, oID)
		}
		orderMap[oID].Items = append(orderMap[oID].Items, itRow)
	}
	result := make([]orderRow, 0, len(orderIDs))
	for _, id := range orderIDs {
		result = append(result, *orderMap[id])
	}
	return result, nil
}

// POST /api/orders — place order (customer)
// GET  /api/orders — list all orders (staff)
func handleOrders(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		w.Header().Set("Content-Type", "application/json")

		switch r.Method {
		case http.MethodPost:
			var body struct {
				Items []struct {
					MenuItemID int64 `json:"menuItemId"`
					Qty        int   `json:"qty"`
				} `json:"items"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Items) == 0 {
				writeErr(w, http.StatusBadRequest, "items required")
				return
			}

			// Charge the patron's wallet atomically: price the items, verify
			// funds, deduct, then record the order — all in one transaction.
			tx, err := db.Begin(r.Context())
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			defer tx.Rollback(r.Context())

			var total float64
			for i := range body.Items {
				if body.Items[i].Qty < 1 {
					body.Items[i].Qty = 1
				}
				var price float64
				var available bool
				if err := tx.QueryRow(r.Context(),
					`SELECT price, is_available FROM menu_items WHERE id = $1`,
					body.Items[i].MenuItemID,
				).Scan(&price, &available); err != nil {
					writeErr(w, http.StatusBadRequest, "menu item not found")
					return
				}
				if !available {
					writeErr(w, http.StatusBadRequest, "item is sold out")
					return
				}
				total += price * float64(body.Items[i].Qty)
			}

			var balance float64
			if err := tx.QueryRow(r.Context(),
				`SELECT balance FROM users WHERE username = $1 FOR UPDATE`,
				claims.Nickname,
			).Scan(&balance); err != nil {
				writeErr(w, http.StatusInternalServerError, "wallet not found")
				return
			}
			if balance < total {
				writeErr(w, http.StatusPaymentRequired, "Not enough ฿ — keep waiting to earn more")
				return
			}

			var newBalance float64
			if err := tx.QueryRow(r.Context(),
				`UPDATE users SET balance = balance - $1 WHERE username = $2 RETURNING balance`,
				total, claims.Nickname,
			).Scan(&newBalance); err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}

			var orderID int64
			if err := tx.QueryRow(r.Context(),
				`INSERT INTO orders (customer_nick) VALUES ($1) RETURNING id`,
				claims.Nickname,
			).Scan(&orderID); err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			for _, it := range body.Items {
				if _, err := tx.Exec(r.Context(),
					`INSERT INTO order_items (order_id, menu_item_id, qty) VALUES ($1, $2, $3)`,
					orderID, it.MenuItemID, it.Qty,
				); err != nil {
					writeErr(w, http.StatusInternalServerError, "db error")
					return
				}
			}
			if err := tx.Commit(r.Context()); err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"orderId": orderID, "balance": newBalance})

		case http.MethodGet:
			if claims.Role != "staff" {
				writeErr(w, http.StatusForbidden, "staff only")
				return
			}
			orders, err := scanOrders(r.Context(), db, "WHERE o.status != 'cancelled'")
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			json.NewEncoder(w).Encode(orders)

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// GET /api/orders/me — customer's own orders
func handleMyOrders(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		orders, err := scanOrders(r.Context(), db,
			`WHERE o.customer_nick = $1 AND o.status != 'cancelled'`,
			claims.Nickname,
		)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(orders)
	}
}

// PATCH /api/orders/{id}/status — update order status (staff)
func handleOrderAction(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		claims := r.Context().Value(claimsKey).(*auth.Claims)
		if claims.Role != "staff" {
			writeErr(w, http.StatusForbidden, "staff only")
			return
		}
		// path: /api/orders/{id}/status
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		// parts: ["api","orders","{id}","status"]
		if len(parts) < 4 || parts[3] != "status" {
			http.NotFound(w, r)
			return
		}
		orderID, err := strconv.ParseInt(parts[2], 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid order id")
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		if body.Status != "served" && body.Status != "cancelled" {
			writeErr(w, http.StatusBadRequest, "status must be served or cancelled")
			return
		}
		ct, err := db.Exec(r.Context(),
			`UPDATE orders SET status = $1 WHERE id = $2`,
			body.Status, orderID,
		)
		if err != nil || ct.RowsAffected() == 0 {
			writeErr(w, http.StatusNotFound, "order not found")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": body.Status})
	}
}

// ── Guestbook ─────────────────────────────────────────────────────────────────

func handleGuestbook(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			rows, err := db.Query(r.Context(),
				`SELECT nick, message, created_at FROM guestbook ORDER BY created_at DESC LIMIT 20`,
			)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			defer rows.Close()
			type entry struct {
				Nick      string `json:"nick"`
				Message   string `json:"message"`
				CreatedAt string `json:"createdAt"`
			}
			entries := []entry{}
			for rows.Next() {
				var e entry
				var t time.Time
				if rows.Scan(&e.Nick, &e.Message, &t) == nil {
					e.CreatedAt = t.UTC().Format(time.RFC3339)
					entries = append(entries, e)
				}
			}
			json.NewEncoder(w).Encode(entries)

		case http.MethodPost:
			// optional auth — read token if present
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if token == "" {
				token = r.URL.Query().Get("token")
			}
			claims, err := auth.Parse(token)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, "login required")
				return
			}
			var body struct {
				Message string `json:"message"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Message) == "" {
				writeErr(w, http.StatusBadRequest, "message required")
				return
			}
			if len(body.Message) > 280 {
				writeErr(w, http.StatusBadRequest, "message too long (max 280)")
				return
			}
			db.Exec(r.Context(),
				`INSERT INTO guestbook (nick, message) VALUES ($1, $2)`,
				claims.Nickname, strings.TrimSpace(body.Message),
			)
			json.NewEncoder(w).Encode(map[string]string{"ok": "true"})

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
