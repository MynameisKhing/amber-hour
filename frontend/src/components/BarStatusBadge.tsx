import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  lastCallAt: string | null;
}

function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function BarStatusBadge({ open, lastCallAt }: Props) {
  const [countdown, setCountdown] = useState(() =>
    lastCallAt ? formatCountdown(lastCallAt) : ""
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!lastCallAt) { setCountdown(""); return; }
    setCountdown(formatCountdown(lastCallAt));
    intervalRef.current = setInterval(() => setCountdown(formatCountdown(lastCallAt)), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [lastCallAt]);

  const isLastCall = lastCallAt && new Date(lastCallAt).getTime() > Date.now();

  const color = isLastCall ? "#f0b232" : open ? "#23a55a" : "#f23f43";
  const label = isLastCall ? `LAST CALL ${countdown}` : open ? "OPEN" : "CLOSED";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.3rem",
      padding: "0.15rem 0.6rem", borderRadius: 99,
      border: `1px solid ${color}44`,
      background: `${color}18`,
      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em",
      color, flexShrink: 0,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}`,
        flexShrink: 0,
        ...(open ? { animation: "pulse 2s ease-in-out infinite" } : {}),
      }} />
      {label}
    </div>
  );
}
