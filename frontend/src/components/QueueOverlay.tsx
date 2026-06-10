import type { JukeboxState } from "../types";

interface Props {
  jukebox: JukeboxState;
  nowPlayingTitle: string;
  onClose: () => void;
}

export default function QueueOverlay({ jukebox, nowPlayingTitle, onClose }: Props) {
  return (
    <div style={{
      borderTop: "1px solid var(--border)", background: "var(--surface)",
      padding: "0.5rem 1rem", flexShrink: 0, maxHeight: 160, overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--amber-lt)" }}>♪ Queue</span>
        <button className="ghost" onClick={onClose} style={{ padding: "0 6px", fontSize: "0.75rem" }}>✕</button>
      </div>
      {jukebox.current && (
        <div style={{ fontSize: "0.8rem", marginBottom: "0.2rem" }}>
          <span style={{ color: "var(--amber)" }}>▶ </span>
          <span>{nowPlayingTitle || jukebox.current.videoId}</span>
          <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>@{jukebox.current.addedBy}</span>
        </div>
      )}
      {jukebox.queue.length === 0 && !jukebox.current && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Queue is empty.</div>
      )}
      {jukebox.queue.map((e, i) => (
        <div key={i} style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {i + 1}. <span style={{ fontFamily: "monospace" }}>{e.videoId}</span>
          <span style={{ color: "var(--amber-lt)", marginLeft: 6 }}>@{e.addedBy}</span>
        </div>
      ))}
    </div>
  );
}
