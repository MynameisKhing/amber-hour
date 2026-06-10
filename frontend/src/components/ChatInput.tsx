import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent, ClipboardEvent, RefObject } from "react";
import { IcoAttach, IcoClose, IcoEmoji } from "./Icons";
import type { ChatMessage, PresencePayload } from "../types";
import { COMMANDS } from "./constants";

const EMOJIS = [
  "😀","😂","😍","😘","🥰","😊","😎","🤔",
  "😅","😭","🤣","😱","🥳","😴","🤗","😤",
  "👍","👎","👏","🙌","💪","🙏","✌️","🤞",
  "❤️","🔥","💯","✨","🎉","💀","👀","💬",
  "🥃","🍸","🍹","🍻","🎶","🎵","🎸","💃",
  "🌟","💫","⚡","🌈","🎯","🎲","🍀","🔮",
];

interface Props {
  input: string;
  uploading: boolean;
  replyingTo: ChatMessage | null;
  cmdCandidates: typeof COMMANDS;
  cmdIndex: number;
  mentionCandidates: PresencePayload["users"];
  mentionIndex: number;
  fileInputRef: RefObject<HTMLInputElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onFileChange: (file: File) => void;
  onCancelReply: () => void;
  onSelectCommand: (hint: string) => void;
  onSelectMention: (nickname: string) => void;
}

export default function ChatInput({
  input, uploading, replyingTo,
  cmdCandidates, cmdIndex, mentionCandidates, mentionIndex,
  fileInputRef, textareaRef,
  onInputChange, onKeyDown, onPaste, onSend,
  onFileChange, onCancelReply, onSelectCommand, onSelectMention,
}: Props) {
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji]);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const next = input.slice(0, cursor) + emoji + input.slice(cursor);
    onInputChange(next);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      if (el) {
        el.selectionStart = el.selectionEnd = cursor + emoji.length;
        el.focus();
      }
    });
  };

  return (
    <footer style={{
      padding: "0.625rem 1.5rem 0.875rem",
      borderTop: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex", flexDirection: "column", gap: "0.375rem",
      flexShrink: 0,
    }}>
      {uploading && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Uploading…</div>
      )}

      {replyingTo && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.4rem 0.75rem", background: "var(--surface2)",
          borderRadius: 8, borderLeft: "3px solid var(--amber)", fontSize: "0.8rem",
        }}>
          <span style={{ color: "var(--text-muted)" }}>Replying to</span>
          <span style={{ color: "var(--amber-lt)", fontWeight: 600 }}>{replyingTo.senderNick}</span>
          <span style={{ color: "var(--text-muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {replyingTo.content || (replyingTo.mediaUrl ? "📷 image" : "")}
          </span>
          <button className="ghost" onClick={onCancelReply} style={{ padding: "0.15rem 0.4rem", flexShrink: 0 }}>
            <IcoClose size={14} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", position: "relative" }}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChange(file);
            e.target.value = "";
          }}
        />

        {/* Attach */}
        <button
          className="ghost"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          style={{ padding: "0.5rem", borderRadius: 8, flexShrink: 0 }}
        >
          <IcoAttach size={18} />
        </button>

        {/* Emoji picker */}
        <div ref={emojiRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            className="ghost"
            onClick={() => setShowEmoji(v => !v)}
            title="Emoji"
            style={{
              padding: "0.5rem", borderRadius: 8,
              color: showEmoji ? "var(--amber-lt)" : undefined,
              background: showEmoji ? "color-mix(in srgb, var(--amber) 12%, transparent)" : undefined,
            }}
          >
            <IcoEmoji size={18} />
          </button>

          {showEmoji && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0,
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "0.5rem",
              display: "grid", gridTemplateColumns: "repeat(8, 1fr)",
              gap: "2px",
              boxShadow: "0 -3px 16px rgba(80,40,10,0.14)",
              zIndex: 60,
            }}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onMouseDown={(ev) => { ev.preventDefault(); insertEmoji(e); }}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    fontSize: "1.25rem", padding: "4px", borderRadius: 6,
                    lineHeight: 1,
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "color-mix(in srgb, var(--amber) 15%, transparent)")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Command autocomplete */}
        {cmdCandidates.length > 0 && (
          <div style={{
            position: "absolute", bottom: "100%", left: 0, right: 0,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "0 -3px 12px rgba(80,40,10,0.12)", zIndex: 50,
          }}>
            {cmdCandidates.map((c, i) => (
              <div
                key={c.name}
                onMouseDown={(e) => { e.preventDefault(); onSelectCommand(c.hint); }}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.45rem 0.875rem", cursor: "pointer",
                  background: i === cmdIndex ? "color-mix(in srgb, var(--amber) 15%, transparent)" : "transparent",
                }}
              >
                <span style={{ color: "var(--amber-lt)", fontWeight: 600 }}>/{c.name}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{c.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Mention autocomplete */}
        {mentionCandidates.length > 0 && (
          <div style={{
            position: "absolute", bottom: "100%", left: 0, right: 0,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "0 -3px 12px rgba(80,40,10,0.12)", zIndex: 50,
          }}>
            {mentionCandidates.map((u, i) => (
              <div
                key={u.nickname}
                onMouseDown={(e) => { e.preventDefault(); onSelectMention(u.nickname); }}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.45rem 0.875rem", cursor: "pointer",
                  background: i === mentionIndex ? "color-mix(in srgb, var(--amber) 15%, transparent)" : "transparent",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: u.role === "staff" ? "var(--staff)" : "var(--customer)" }} />
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{u.nickname}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{u.role}</span>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          style={{
            flex: 1, resize: "none",
            padding: "0.625rem 0.875rem",
            background: "var(--surface2)",
            borderRadius: 10, lineHeight: 1.5, maxHeight: 120,
          }}
          rows={1}
          value={input}
          disabled={uploading}
          onChange={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            onInputChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Say something… or /command"
        />
        <button
          onClick={onSend}
          disabled={uploading}
          style={{ padding: "0.625rem 1.25rem", borderRadius: 10, flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </footer>
  );
}
