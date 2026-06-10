import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { IcoAttach, IcoReply, IcoEdit, IcoTrash } from "./Icons";
import type { ChatMessage, Role } from "../types";
import { EMOJIS, isImage } from "./constants";

const actionBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "3px 6px",
  fontSize: "0.9rem",
  cursor: "pointer",
  borderRadius: 5,
  lineHeight: 1.2,
  color: "var(--text)",
};

interface Props {
  messages: ChatMessage[];
  currentUserNick: string;
  currentUserRole: Role;
  hoveredMsgId: number | null;
  editingId: number | null;
  editText: string;
  chatRef: RefObject<HTMLDivElement>;
  bottomRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  onHover: (id: number | null) => void;
  onReact: (msgId: number, emoji: string) => void;
  onReply: (msg: ChatMessage) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onCancelEdit: () => void;
  onSaveEdit: (msgId: number) => void;
  onDeleteMsg: (msgId: number) => void;
  onEditTextChange: (text: string) => void;
}

export default function MessageList({
  messages, currentUserNick, currentUserRole,
  hoveredMsgId, editingId, editText,
  chatRef, bottomRef,
  onScroll, onHover, onReact, onReply, onStartEdit,
  onCancelEdit, onSaveEdit, onDeleteMsg, onEditTextChange,
}: Props) {
  // Clicking an image opens it in an in-app lightbox instead of a new tab.
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const renderContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (!part.startsWith("@")) return part;
      const isMe = part.slice(1) === currentUserNick;
      return (
        <span key={i} style={{
          background: isMe
            ? "color-mix(in srgb, var(--amber) 22%, transparent)"
            : "color-mix(in srgb, var(--text-muted) 15%, transparent)",
          color: isMe ? "var(--amber-lt)" : "inherit",
          borderRadius: 4, padding: "0 3px",
          fontWeight: isMe ? 600 : 500,
        }}>
          {part}
        </span>
      );
    });
  };

  return (
    <>
    <div
      ref={chatRef}
      onScroll={onScroll}
      style={{
        flex: 1, overflowY: "auto",
        padding: "2.5rem 0.75rem 0.5rem",
        display: "flex", flexDirection: "column",
      }}
    >
      {messages.length === 0 && (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)", fontSize: "0.9rem",
          flexDirection: "column", gap: "0.5rem",
        }}>
          <span style={{ fontSize: "2.5rem" }}>🥃</span>
          <span>Pull up a stool. Say hello.</span>
        </div>
      )}

      {messages.map((m, index) => {
        const mine = m.senderNick === currentUserNick;
        const hovered = hoveredMsgId === m.id;
        const myReactions = Object.entries(m.reactions ?? {})
          .filter(([, nicks]) => nicks.includes(currentUserNick))
          .map(([e]) => e);

        const prev = messages[index - 1];
        const grouped =
          Boolean(prev) &&
          prev.senderNick === m.senderNick &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;

        const nameColor =
          m.role === "staff" ? "var(--staff)" : mine ? "var(--amber-lt)" : "var(--customer)";

        return (
          <div
            key={m.id}
            onMouseEnter={() => onHover(m.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onHover(hoveredMsgId === m.id ? null : m.id)}
            style={{
              display: "flex",
              flexDirection: mine ? "row-reverse" : "row",
              alignItems: "flex-start",
              gap: "0.625rem",
              padding: `${grouped ? 1 : 10}px 0.75rem ${grouped ? 1 : 3}px`,
              borderRadius: 6,
              background: hovered ? "rgba(255,255,255,0.038)" : "transparent",
              position: "relative",
              transition: "background 0.08s",
            }}
          >
            {hovered && editingId !== m.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: -16, right: 12,
                  display: "flex", alignItems: "center",
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "3px 5px", gap: 2,
                  boxShadow: "0 3px 14px rgba(80,40,10,0.18)", zIndex: 10,
                }}
              >
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReact(m.id, emoji); }}
                    title={`React ${emoji}`}
                    style={{
                      background: myReactions.includes(emoji)
                        ? "color-mix(in srgb, var(--amber) 25%, var(--surface2))"
                        : "transparent",
                      border: "none", padding: "3px 5px", fontSize: "1rem",
                      cursor: "pointer", borderRadius: 5, lineHeight: 1.2,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
                <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px" }} />
                <button onClick={(e) => { e.stopPropagation(); onReply(m); }} title="Reply" style={actionBtn}>
                  <IcoReply size={15} />
                </button>
                {mine && m.content && (
                  <button onClick={(e) => { e.stopPropagation(); onStartEdit(m); }} title="Edit" style={actionBtn}>
                    <IcoEdit size={15} />
                  </button>
                )}
                {(mine || currentUserRole === "staff") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteMsg(m.id); }}
                    title="Delete message"
                    style={{ ...actionBtn, color: "var(--danger)" }}
                  >
                    <IcoTrash size={15} />
                  </button>
                )}
              </div>
            )}

            {!mine && (
              grouped ? (
                <div style={{ width: 36, flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem", fontWeight: 700,
                  flexShrink: 0, marginTop: 2,
                  background: m.role === "staff"
                    ? "color-mix(in srgb, var(--staff) 18%, var(--surface2))"
                    : "color-mix(in srgb, var(--customer) 18%, var(--surface2))",
                  color: m.role === "staff" ? "var(--staff)" : "var(--customer)",
                  border: `1.5px solid ${m.role === "staff"
                    ? "color-mix(in srgb, var(--staff) 30%, transparent)"
                    : "color-mix(in srgb, var(--customer) 30%, transparent)"}`,
                }}>
                  {m.senderNick[0]?.toUpperCase()}
                </div>
              )
            )}

            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: mine ? "flex-end" : "flex-start",
              gap: "0.25rem", maxWidth: "75%", minWidth: 0,
            }}>
              {!grouped && (
                <div style={{
                  display: "flex", alignItems: "baseline", gap: "0.5rem",
                  flexDirection: mine ? "row-reverse" : "row",
                }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: nameColor }}>
                    {m.senderNick}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}

              {m.replyTo && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  fontSize: "0.78rem", color: "var(--text-muted)",
                  maxWidth: "100%", padding: "0 0.25rem 0 0.4rem",
                  borderLeft: "2px solid var(--amber-dim)", marginBottom: 1,
                }}>
                  <span style={{ color: "var(--amber-lt)", fontWeight: 600, flexShrink: 0 }}>
                    <IcoReply size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3 }} />
                    {m.replyToNick ?? "someone"}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                    {m.replyToContent || "…"}
                  </span>
                </div>
              )}

              {editingId === m.id ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", flexDirection: "column", gap: "0.35rem", width: "min(440px, 72vw)" }}
                >
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => onEditTextChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit(m.id); }
                      if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
                    }}
                    style={{
                      width: "100%", resize: "none",
                      padding: "0.5rem 0.75rem", background: "var(--surface2)",
                      borderRadius: 10, lineHeight: 1.5, minHeight: 40,
                    }}
                  />
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    escape to{" "}
                    <span onClick={onCancelEdit} style={{ color: "var(--amber-lt)", cursor: "pointer" }}>cancel</span>
                    {" · "}enter to{" "}
                    <span onClick={() => onSaveEdit(m.id)} style={{ color: "var(--amber-lt)", cursor: "pointer" }}>save</span>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: m.mediaUrl && !m.content ? "0.25rem" : "0.5rem 0.9rem",
                  borderRadius: mine
                    ? "16px 4px 16px 16px"
                    : grouped ? "16px" : "4px 16px 16px 16px",
                  background: mine
                    ? "color-mix(in srgb, var(--amber) 22%, var(--surface2))"
                    : m.role === "staff"
                    ? "color-mix(in srgb, var(--staff) 12%, var(--surface2))"
                    : "var(--surface2)",
                  border: `1px solid ${mine
                    ? "color-mix(in srgb, var(--amber) 30%, transparent)"
                    : m.role === "staff"
                    ? "color-mix(in srgb, var(--staff) 22%, transparent)"
                    : "var(--border)"}`,
                  fontSize: "0.9rem", lineHeight: 1.55,
                  wordBreak: "break-word", overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(80,40,10,0.1)",
                }}>
                  {m.mediaUrl && isImage(m.mediaUrl) && (
                    <img
                      src={m.mediaUrl} alt=""
                      onClick={(e) => { e.stopPropagation(); setLightbox(m.mediaUrl!); }}
                      style={{ display: "block", maxWidth: "100%", maxHeight: 300, borderRadius: 10, cursor: "pointer" }}
                    />
                  )}
                  {m.mediaUrl && !isImage(m.mediaUrl) && (
                    <a
                      href={m.mediaUrl} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "var(--amber-lt)", fontSize: "0.85rem", textDecoration: "underline" }}
                    >
                      <IcoAttach size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 3 }} />Attachment
                    </a>
                  )}
                  {m.content && (
                    <div style={{ marginTop: m.mediaUrl ? "0.375rem" : 0 }}>
                      {renderContent(m.content)}
                      {m.editedAt && (
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginLeft: 6 }}>
                          (edited)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {Object.keys(m.reactions ?? {}).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                  {Object.entries(m.reactions).map(([emoji, nicks]) =>
                    nicks.length > 0 ? (
                      <button
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); onReact(m.id, emoji); }}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          padding: "2px 8px", borderRadius: 10, fontSize: "0.8rem",
                          background: nicks.includes(currentUserNick)
                            ? "color-mix(in srgb, var(--amber) 20%, var(--surface2))"
                            : "var(--surface2)",
                          border: `1px solid ${nicks.includes(currentUserNick)
                            ? "color-mix(in srgb, var(--amber) 40%, transparent)"
                            : "var(--border)"}`,
                          cursor: "pointer", color: "var(--text)",
                        }}
                        title={nicks.join(", ")}
                      >
                        {emoji}{" "}
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {nicks.length}
                        </span>
                      </button>
                    ) : null
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>

    {lightbox && (
      <div
        onClick={() => setLightbox(null)}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "2rem", cursor: "zoom-out",
        }}
      >
        <img
          src={lightbox} alt=""
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8, cursor: "default", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
        />
        <a
          href={lightbox} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            color: "var(--text)", fontSize: "0.8rem", textDecoration: "none",
            background: "var(--surface)", border: "1px solid var(--border)",
            padding: "0.35rem 0.8rem", borderRadius: 8,
          }}
        >
          Open original ↗
        </a>
        <button
          onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
          title="Close (Esc)"
          aria-label="Close"
          style={{
            position: "absolute", top: 16, right: 20,
            background: "transparent", border: "none", color: "#fff",
            fontSize: "1.6rem", lineHeight: 1, cursor: "pointer", padding: "0.25rem 0.5rem",
          }}
        >
          ✕
        </button>
      </div>
    )}
    </>
  );
}
