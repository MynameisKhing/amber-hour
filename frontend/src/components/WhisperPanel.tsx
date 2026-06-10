import type { RefObject } from "react";
import { IcoLock, IcoClose } from "./Icons";
import type { ChatMessage } from "../types";

interface Props {
  whisperTarget: { nickname: string; role: string };
  messages: ChatMessage[];
  whisperInput: string;
  currentUserNick: string;
  whisperBottomRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export default function WhisperPanel({
  whisperTarget, messages, whisperInput, currentUserNick,
  whisperBottomRef, onClose, onInputChange, onSend,
}: Props) {
  return (
    <div style={{
      borderTop: "1px solid var(--border)",
      background: "color-mix(in srgb, var(--staff) 6%, var(--surface))",
      display: "flex", flexDirection: "column",
      flexShrink: 0, maxHeight: 260,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.4rem 1rem",
        borderBottom: "1px solid color-mix(in srgb, var(--staff) 22%, transparent)",
      }}>
        <span style={{ fontSize: "0.75rem", color: "var(--staff)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <IcoLock size={13} /> DM: {whisperTarget.nickname}
        </span>
        <button className="ghost" onClick={onClose} style={{ marginLeft: "auto", padding: "2px 6px" }}>
          <IcoClose size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {messages.length === 0 && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem" }}>
            No messages yet
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderNick === currentUserNick;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", gap: "0.4rem", alignItems: "flex-end" }}>
              {!mine && (
                <span style={{ fontSize: "0.72rem", color: "var(--staff)", fontWeight: 600, flexShrink: 0 }}>
                  {m.senderNick}
                </span>
              )}
              <div style={{
                maxWidth: "70%", padding: "0.4rem 0.7rem",
                borderRadius: mine ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                background: mine ? "color-mix(in srgb, var(--staff) 18%, var(--surface2))" : "var(--surface2)",
                fontSize: "0.875rem", color: "var(--text)",
                border: "1px solid color-mix(in srgb, var(--staff) 22%, transparent)",
              }}>
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={whisperBottomRef} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", padding: "0.4rem 1rem 0.5rem", borderTop: "1px solid color-mix(in srgb, var(--staff) 16%, transparent)" }}>
        <input
          type="text"
          value={whisperInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={`Whisper to ${whisperTarget.nickname}…`}
          style={{ flex: 1, padding: "0.4rem 0.75rem", background: "var(--surface2)", borderRadius: 8, fontSize: "0.875rem" }}
        />
        <button onClick={onSend} style={{ padding: "0.4rem 0.9rem", borderRadius: 8, flexShrink: 0, fontSize: "0.85rem" }}>
          Send
        </button>
      </div>
    </div>
  );
}
