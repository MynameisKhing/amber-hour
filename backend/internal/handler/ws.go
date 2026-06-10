package handler

import (
	"log"
	"net/http"

	"amber-hour/internal/auth"
	"amber-hour/internal/hub"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func serveWS(h *hub.Hub, w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	c := hub.NewClient(h, claims.Nickname, claims.Role)
	h.Register(c)

	go writePump(conn, c)
	readPump(conn, c)
}

func readPump(conn *websocket.Conn, c *hub.Client) {
	defer func() {
		c.Hub.Unregister(c)
		conn.Close()
	}()
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		c.Hub.Inbound(c, msg)
	}
}

func writePump(conn *websocket.Conn, c *hub.Client) {
	defer conn.Close()
	for msg := range c.Send {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}
