import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { IcoMessage } from "./Icons";
import type { PresencePayload, LeaderboardEntry, Role } from "../types";
import MenuPanel from "./MenuPanel";
import TabPanel from "./TabPanel";
import GuestbookPanel from "./GuestbookPanel";
import SuggestPanel from "./SuggestPanel";

const sectionLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  padding: "0.5rem 0.5rem 0.25rem",
};

type Tab = "members" | "menu" | "tab" | "book" | "suggest";
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "members", label: "👥", title: "Members" },
  { id: "menu",    label: "🍸", title: "Menu" },
  { id: "tab",     label: "🧾", title: "Tab" },
  { id: "book",    label: "📖", title: "Guestbook" },
  { id: "suggest", label: "✨", title: "Read My Mind" },
];

interface Props {
  open: boolean;
  staffUsers: PresencePayload["users"];
  guestUsers: PresencePayload["users"];
  currentUserNick: string;
  currentUserRole: Role;
  token: string;
  whisperTargetNick: string | null;
  unreadWhispers: Record<string, number>;
  onOpenWhisper: (u: { nickname: string; role: string }) => void;
  onBalanceChange: (balance: number) => void;
}

export default function RightSidebar({
  open, staffUsers, guestUsers, currentUserNick, currentUserRole, token,
  whisperTargetNick, unreadWhispers, onOpenWhisper, onBalanceChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (activeTab !== "members") return;
    fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setLeaders(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [activeTab, token]);

  const renderUserList = (users: PresencePayload["users"]) =>
    users.map((u) => (
      <li key={u.nickname} style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.3rem 0.5rem", borderRadius: 6,
        background: u.nickname === currentUserNick
          ? "color-mix(in srgb, var(--amber) 12%, transparent)"
          : "transparent",
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: u.role === "staff" ? "var(--staff)" : "var(--customer)",
          boxShadow: `0 0 6px ${u.role === "staff" ? "var(--staff)" : "var(--customer)"}`,
        }} />
        <span style={{
          fontSize: "0.85rem",
          color: u.role === "staff" ? "var(--staff)" : "var(--text)",
          fontWeight: u.nickname === currentUserNick ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>
          {u.nickname}{u.nickname === currentUserNick ? " (you)" : ""}
        </span>
        {u.nickname !== currentUserNick && (
          <button
            onClick={() => onOpenWhisper(u)}
            title={`DM ${u.nickname}`}
            style={{
              background: whisperTargetNick === u.nickname
                ? "color-mix(in srgb, var(--amber) 18%, transparent)"
                : "transparent",
              border: "none", cursor: "pointer",
              padding: "2px 6px", borderRadius: 4, fontSize: "0.85rem",
              color: whisperTargetNick === u.nickname ? "var(--amber-lt)" : "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <IcoMessage size={14} />
            {(unreadWhispers[u.nickname] ?? 0) > 0 && (
              <span style={{
                fontSize: "0.6rem", background: "#ef4444", color: "#fff",
                borderRadius: "50%", padding: "1px 4px", marginLeft: 2,
                verticalAlign: "top", lineHeight: 1.4,
              }}>
                {unreadWhispers[u.nickname]}
              </span>
            )}
          </button>
        )}
      </li>
    ));

  return (
    <aside className={`bar-members${open ? " open" : ""}`} style={{
      width: 220, background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Tab switcher */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexShrink: 0,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            title={t.title}
            style={{
              flex: 1, padding: "0.5rem 0", fontSize: "0.9rem",
              background: activeTab === t.id
                ? "color-mix(in srgb, var(--amber) 12%, transparent)"
                : "transparent",
              border: "none",
              borderBottom: activeTab === t.id
                ? "2px solid var(--amber)"
                : "2px solid transparent",
              cursor: "pointer",
              color: activeTab === t.id ? "var(--amber-lt)" : "var(--text-muted)",
              transition: "color 0.12s, background 0.12s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {activeTab === "members" && (
          <>
            {staffUsers.length > 0 && (
              <>
                <span style={sectionLabel}>Staff · {staffUsers.length}</span>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  {renderUserList(staffUsers)}
                </ul>
              </>
            )}
            {guestUsers.length > 0 && (
              <>
                <span style={{ ...sectionLabel, marginTop: staffUsers.length > 0 ? "0.75rem" : 0 }}>
                  Guests · {guestUsers.length}
                </span>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  {renderUserList(guestUsers)}
                </ul>
              </>
            )}
            {staffUsers.length === 0 && guestUsers.length === 0 && (
              <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                No one here yet.
              </div>
            )}

            {leaders.length > 0 && (
              <>
                <span style={{ ...sectionLabel, marginTop: "1rem", display: "flex", alignItems: "center", gap: 5 }}>
                  🏆 Top Patrons
                </span>
                <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.125rem", padding: 0, margin: 0 }}>
                  {leaders.map((entry, i) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                    const me = entry.nickname === currentUserNick;
                    return (
                      <li key={entry.nickname} style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        padding: "0.3rem 0.5rem", borderRadius: 6,
                        background: i < 3
                          ? "color-mix(in srgb, var(--amber) 10%, transparent)"
                          : me ? "color-mix(in srgb, var(--amber) 12%, transparent)" : "transparent",
                      }}>
                        <span style={{ width: 22, fontSize: "0.8rem", flexShrink: 0, textAlign: "center" }}>{medal}</span>
                        <span style={{
                          fontSize: "0.82rem", flex: 1, fontWeight: me ? 700 : 400,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: me ? "var(--amber-lt)" : "var(--text)",
                        }}>
                          {entry.nickname}{me ? " (you)" : ""}
                        </span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--amber-lt)", flexShrink: 0 }}>
                          ฿{entry.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </>
        )}

        {activeTab === "menu" && <MenuPanel token={token} userRole={currentUserRole} onBalanceChange={onBalanceChange} />}
        {activeTab === "tab" && <TabPanel token={token} userRole={currentUserRole} />}
        {activeTab === "book" && <GuestbookPanel token={token} />}
        {activeTab === "suggest" && <SuggestPanel token={token} onBalanceChange={onBalanceChange} />}
      </div>
    </aside>
  );
}
