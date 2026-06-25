import type { CSSProperties } from "react";
import { IcoMoon, IcoSun } from "./Icons";
import type { Theme } from "../hooks/useTheme";

interface Props {
  theme: Theme;
  onToggle: () => void;
  /** compact = icon-only square button (e.g. login corner); otherwise a labeled row. */
  compact?: boolean;
  style?: CSSProperties;
}

export default function ThemeToggle({ theme, onToggle, compact = false, style }: Props) {
  const isDark = theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";
  const Icon = isDark ? IcoSun : IcoMoon;

  const base: CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: "0.5rem",
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: 6,
    cursor: "pointer",
    transition: "color 0.12s, border-color 0.12s, background 0.12s",
  };

  const shape: CSSProperties = compact
    ? { width: 34, height: 34, padding: 0 }
    : { width: "100%", padding: "0.375rem 0.75rem", fontSize: "0.8rem" };

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      style={{ ...base, ...shape, ...style }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text)";
        e.currentTarget.style.borderColor = "var(--amber)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <Icon size={16} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
