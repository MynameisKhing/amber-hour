import type { PresencePayload } from "../types";
import BarStatusBadge from "./BarStatusBadge";
import { IcoMenu, IcoMembers } from "./Icons";

interface Props {
  onlineUsers: PresencePayload["users"];
  unreadWhisperTotal: number;
  membersOpen: boolean;
  barOpen: boolean;
  lastCallAt: string | null;
  balance: number | null;
  onToggleSidebar: () => void;
  onToggleMembers: () => void;
}

export default function ChatHeader({ onlineUsers, unreadWhisperTotal, membersOpen, barOpen, lastCallAt, balance, onToggleSidebar, onToggleMembers }: Props) {
  return (
    <header style={{
      padding: "0.75rem 1.25rem",
      borderBottom: "1px solid var(--border)",
      background: "var(--surface)",
      flexShrink: 0,
      display: "flex", alignItems: "center", gap: "0.75rem",
    }}>
      <button className="bar-hamburger" onClick={onToggleSidebar} aria-label="Toggle sessions">
        <IcoMenu />
      </button>
      <div>
        <div style={{ fontWeight: 700, color: "var(--amber-lt)", fontSize: "1rem" }}>
          # Chat
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {onlineUsers.length} {onlineUsers.length === 1 ? "guest" : "guests"} tonight
        </div>
      </div>
      <BarStatusBadge open={barOpen} lastCallAt={lastCallAt} />
      {balance !== null && (
        <span
          title="Your bar balance — earn ฿ by hanging out, spend on the menu"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            fontSize: "0.82rem", fontWeight: 700, color: "var(--amber-lt)",
            background: "color-mix(in srgb, var(--amber) 14%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--amber) 35%, transparent)",
            padding: "0.2rem 0.6rem", borderRadius: 999, whiteSpace: "nowrap",
          }}
        >
          💰 ฿{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      )}
      <button
        className="bar-members-toggle"
        onClick={onToggleMembers}
        aria-label="Toggle members"
        title="Members"
        style={{
          marginLeft: "auto",
          background: membersOpen ? "var(--surface2)" : "none",
          border: "none", color: "var(--text)", fontSize: "1.1rem",
          padding: "0.25rem 0.5rem", borderRadius: 6,
          cursor: "pointer", flexShrink: 0,
        }}
      >
        <span style={{ position: "relative", display: "inline-flex" }}>
          <IcoMembers />
          {unreadWhisperTotal > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -6,
              fontSize: "0.6rem", background: "#ef4444", color: "#fff",
              borderRadius: "50%", padding: "1px 4px", lineHeight: 1.4,
              minWidth: 14, textAlign: "center",
            }}>
              {unreadWhisperTotal}
            </span>
          )}
        </span>
      </button>
    </header>
  );
}
