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
      background: "#0d0b1e",
    }}>
      {/* Pixel-art bar background */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url('/bar-background.gif')",
        backgroundSize: "cover",
        backgroundPosition: "center bottom",
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }} />

      {/* CRT scanlines */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)",
        pointerEvents: "none",
        zIndex: 1,
      }} />

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />
    </div>
  );
}
