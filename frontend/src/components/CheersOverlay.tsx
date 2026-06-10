import { useEffect } from "react";

interface Props {
  from: string;
  onDone: () => void;
}

export default function CheersOverlay({ from, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      pointerEvents: "none",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "rgba(80,40,10,0.2)",
      animation: "fadeInOut 2.6s ease forwards",
    }}>
      <span style={{
        fontSize: "5.5rem", lineHeight: 1,
        display: "block",
        animation: "cheersEmoji 2.6s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}>
        🍻
      </span>
      <span style={{
        marginTop: "0.875rem",
        fontSize: "1.1rem", fontWeight: 700,
        color: "var(--amber-lt)",
        animation: "cheersText 2.6s ease forwards",
      }}>
        Cheers from {from}!
      </span>
    </div>
  );
}
