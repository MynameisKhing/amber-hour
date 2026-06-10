import { IcoMessage } from "./Icons";

interface Props {
  toast: { from: string; fromRole: string };
  onOpen: () => void;
}

export default function DmToast({ toast, onOpen }: Props) {
  return (
    <div
      onClick={onOpen}
      style={{
        position: "fixed", bottom: "5rem", right: "1rem", zIndex: 300,
        background: "color-mix(in srgb, var(--staff) 88%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--staff) 45%, transparent)",
        borderRadius: 6, padding: "0.6rem 1rem",
        display: "flex", alignItems: "center", gap: "0.6rem",
        cursor: "pointer", boxShadow: "0 3px 16px color-mix(in srgb, var(--staff) 30%, transparent)",
        animation: "slideUp 0.2s ease",
        maxWidth: 240,
      }}
    >
      <IcoMessage size={18} />
      <div>
        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>New DM</div>
        <div style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>{toast.from}</div>
      </div>
    </div>
  );
}
