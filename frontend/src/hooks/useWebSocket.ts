import { useEffect, useRef, useCallback } from "react";
import type { WSMessage } from "../types";

type MessageHandler = (msg: WSMessage) => void;

const PING_INTERVAL = 15_000;
const BACKOFF_BASE = 1_000;
const BACKOFF_MAX = 30_000;

export function useWebSocket(token: string | null, onMessage: MessageHandler) {
  const ws = useRef<WebSocket | null>(null);
  const sendRef = useRef<(msg: WSMessage) => void>(() => {});

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let retries = 0;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    function connect() {
      if (cancelled) return;

      const socket = new WebSocket(
        `ws://${location.host}/ws?token=${encodeURIComponent(token!)}`
      );
      ws.current = socket;

      socket.onopen = () => {
        retries = 0;
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL);
      };

      socket.onmessage = (e) => {
        try {
          onMessage(JSON.parse(e.data) as WSMessage);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (cancelled) return;
        const delay = Math.min(BACKOFF_BASE * 2 ** retries, BACKOFF_MAX);
        retries++;
        setTimeout(connect, delay);
      };
    }

    connect();

    sendRef.current = (msg: WSMessage) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(msg));
      }
    };

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      ws.current?.close();
    };
  }, [token, onMessage]);

  const send = useCallback((msg: WSMessage) => sendRef.current(msg), []);

  return { send };
}
