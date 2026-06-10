import { useEffect, useRef, useState } from "react";
import type { GuestbookEntry } from "../types";

interface Props {
  token: string;
}

export default function GuestbookPanel({ token }: Props) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    fetch("/api/guestbook")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg.trim() }),
      });
      setMsg("");
      load();
    } finally {
      setSending(false);
    }
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "0.25rem 0.25rem 0" }}>
        📖 Guestbook
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {entries.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", padding: "0.5rem 0.25rem" }}>
            No messages yet. Be the first to leave one!
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} style={{
            background: "var(--surface2)", borderRadius: 8,
            padding: "0.5rem 0.6rem",
            border: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber-lt)" }}>{e.nick}</span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                {new Date(e.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.45 }}>{e.message}</div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
        <textarea
          ref={inputRef}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Leave a message..."
          rows={2}
          maxLength={280}
          style={{ fontSize: "0.78rem", resize: "none", padding: "0.4rem 0.5rem" }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button
          onClick={submit}
          disabled={sending || !msg.trim()}
          style={{ fontSize: "0.75rem", padding: "0.3rem 0.5rem" }}
        >
          {sending ? "Sending..." : "Leave a note ✍️"}
        </button>
      </div>
    </div>
  );
}
