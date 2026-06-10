interface Props {
  onEnterChat: () => void;
}

export default function Lounge({ onEnterChat }: Props) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      {/* Flat Discord-dark surface with a subtle depth vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--surface) 60%, var(--bg)) 0%, var(--bg) 80%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}
