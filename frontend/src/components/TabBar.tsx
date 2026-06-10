export type AppTab = "lounge" | "chat";

interface Props {
  active: AppTab;
  onChange: (t: AppTab) => void;
}

const TABS: { key: AppTab; icon: string; label: string }[] = [
  { key: "lounge", icon: "🍸", label: "Lounge" },
  { key: "chat",   icon: "💬", label: "Chat"   },
];

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "var(--tabbar-h)",
      background: "var(--surface)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      zIndex: 500,
    }}>
      {TABS.map(({ key, icon, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderTop: isActive
                ? "2px solid var(--amber)"
                : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              color: isActive ? "var(--amber-lt)" : "var(--text-muted)",
              fontSize: "0.7rem",
              fontWeight: isActive ? 700 : 400,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            <span style={{
              fontSize: "1.35rem",
              filter: isActive ? "drop-shadow(0 0 6px var(--amber))" : "none",
              transition: "filter 0.15s",
            }}>
              {icon}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
