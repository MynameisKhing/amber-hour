import { useState } from "react";
import type { CSSProperties } from "react";
import type { User } from "../types";

const sectionLabel: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  padding: "0.5rem 0.5rem 0.25rem",
};

const sideBtn = (active: boolean): CSSProperties => ({
  display: "flex", alignItems: "center", gap: "0.5rem",
  padding: "0.4rem 0.6rem", borderRadius: 6,
  background: active ? "color-mix(in srgb, var(--amber) 10%, transparent)" : "transparent",
  color: active ? "var(--amber-lt)" : "var(--text-muted)",
  fontWeight: active ? 600 : 400, fontSize: "0.9rem",
  border: "none", cursor: "pointer", width: "100%", textAlign: "left",
  transition: "background 0.12s, color 0.12s",
});

interface Props {
  open: boolean;
  user: User;
  inviteCodes: string[];
  copiedCode: string | null;
  loungeOpen: boolean;
  barOpen: boolean;
  lastCallAt: string | null;
  onToggleLounge: () => void;
  onCheers: () => void;
  onToggleBarStatus: (open: boolean, lastCallAt?: string) => void;
  onCopyCode: (code: string) => void;
  onLogout: () => void;
}

export default function LeftSidebar({
  open, user, inviteCodes, copiedCode,
  loungeOpen, barOpen, lastCallAt,
  onToggleLounge, onCheers, onToggleBarStatus,
  onCopyCode, onLogout,
}: Props) {
  const [lastCallInput, setLastCallInput] = useState("");
  const [showLastCall, setShowLastCall] = useState(false);

  const handleBarToggle = () => {
    if (barOpen && showLastCall && lastCallInput) {
      // parse HH:MM and build today's ISO
      const [hh, mm] = lastCallInput.split(":").map(Number);
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      onToggleBarStatus(true, d.toISOString());
    } else {
      onToggleBarStatus(!barOpen);
      setShowLastCall(false);
    }
  };

  return (
    <aside className={`bar-sidebar${open ? " open" : ""}`} style={{
      width: 220, background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      padding: "1rem 0.5rem", gap: "0.25rem",
      flexShrink: 0, overflowY: "auto",
    }}>
      <div style={{ padding: "0.25rem 0.5rem 1rem", borderBottom: "1px solid var(--border)", marginBottom: "0.5rem" }}>
        <div style={{ fontSize: "1.4rem", textAlign: "center" }}>🍸</div>
        <div style={{ textAlign: "center", fontWeight: 700, color: "var(--amber-lt)", fontSize: "0.95rem", letterSpacing: "-0.01em" }}>
          Amber Hour
        </div>
      </div>

      <span style={sectionLabel}>Sessions</span>
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.4rem 0.6rem", borderRadius: 6,
        background: "color-mix(in srgb, var(--amber) 14%, transparent)",
        color: "var(--amber-lt)", fontWeight: 600, fontSize: "0.9rem",
      }}>
        <span>💬</span>Chat
      </div>

      <button onClick={onToggleLounge} style={sideBtn(loungeOpen)}>
        <span>🍸</span>Lounge
      </button>

      <button onClick={onCheers} style={sideBtn(false)}>
        <span>🍻</span>Cheers!
      </button>

      {/* Staff: bar open/closed toggle */}
      {user.role === "staff" && (
        <div style={{ marginTop: "0.25rem" }}>
          <button
            onClick={handleBarToggle}
            style={{
              ...sideBtn(false),
              color: barOpen ? "#23a55a" : "#f23f43",
              border: `1px solid ${barOpen ? "#23a55a44" : "#f23f4344"}`,
            }}
          >
            <span>{barOpen ? "🟢" : "🔴"}</span>
            {barOpen ? "Bar is open" : "Bar is closed"}
          </button>

          {barOpen && (
            <button
              onClick={() => setShowLastCall((v) => !v)}
              style={{ ...sideBtn(showLastCall), paddingLeft: "1.5rem", fontSize: "0.78rem", marginTop: 2 }}
            >
              <span>⏰</span> Last Call
            </button>
          )}

          {barOpen && showLastCall && (
            <div style={{ display: "flex", gap: "0.3rem", padding: "0.3rem 0.5rem" }}>
              <input
                type="time"
                value={lastCallInput}
                onChange={(e) => setLastCallInput(e.target.value)}
                style={{ flex: 1, fontSize: "0.72rem", padding: "0.2rem 0.4rem" }}
              />
              <button
                onClick={() => {
                  if (!lastCallInput) return;
                  const [hh, mm] = lastCallInput.split(":").map(Number);
                  const d = new Date(); d.setHours(hh, mm, 0, 0);
                  onToggleBarStatus(true, d.toISOString());
                  setShowLastCall(false);
                }}
                style={{ fontSize: "0.7rem", padding: "0.2rem 0.4rem" }}
              >
                ✓
              </button>
            </div>
          )}

          {lastCallAt && (
            <div style={{ fontSize: "0.65rem", color: "#f0b232", padding: "0.1rem 0.6rem" }}>
              Last call: {new Date(lastCallAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}

      {inviteCodes.length > 0 && (
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
          <span style={sectionLabel}>Invite Code</span>
          {inviteCodes.map((code) => (
            <div key={code} style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.25rem 0.5rem" }}>
              <code style={{
                flex: 1, fontSize: "0.78rem", background: "var(--surface2)",
                padding: "0.25rem 0.5rem", borderRadius: 4, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--amber-lt)",
              }}>
                {code}
              </code>
              <button
                className="ghost"
                onClick={() => onCopyCode(code)}
                style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem", flexShrink: 0 }}
              >
                {copiedCode === code ? "✓" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{
        borderTop: "1px solid var(--border)",
        marginTop: inviteCodes.length > 0 ? "0.5rem" : "auto",
        display: "flex", flexDirection: "column", gap: "0.5rem",
        padding: "0.75rem 0.5rem 0.25rem",
      }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0 0.25rem" }}>
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: "var(--amber)", marginRight: 5,
            boxShadow: "0 0 6px var(--amber)",
          }} />
          {user.role === "staff" ? "Staff" : "Guest"} · {user.nickname}
        </div>
        <button className="ghost" onClick={onLogout} style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}>
          Leave the bar
        </button>
      </div>
    </aside>
  );
}
