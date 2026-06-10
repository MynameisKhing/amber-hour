import { useRef } from "react";
import type { JukeboxNow } from "../types";

interface Props {
  current: JukeboxNow;
  nowPlayingTitle: string;
  skipVotes: number;
  skipThreshold: number;
  loopMode: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ytPlayerRef: React.RefObject<any>;
}

const VOLUME_KEY = "amber_volume";

export default function NowPlayingBanner({ current, nowPlayingTitle, skipVotes, skipThreshold, loopMode, ytPlayerRef }: Props) {
  const title = nowPlayingTitle || current.videoId;
  const savedVol = useRef(Number(localStorage.getItem(VOLUME_KEY) ?? 80));

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    savedVol.current = v;
    localStorage.setItem(VOLUME_KEY, String(v));
    ytPlayerRef.current?.setVolume?.(v);
  };

  return (
    <div style={{
      flexShrink: 0,
      borderLeft: "3px solid var(--amber)",
      background: "color-mix(in srgb, var(--amber) 8%, var(--surface))",
      display: "flex", alignItems: "center",
      padding: "0.3rem 0.75rem", gap: "0.6rem",
    }}>
      <a
        href={`https://www.youtube.com/watch?v=${current.videoId}`}
        target="_blank"
        rel="noreferrer"
        title="Open in YouTube"
        style={{ fontSize: "0.8rem", color: "var(--amber)", flexShrink: 0, textDecoration: "none" }}
      >
        ♪
      </a>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: "0.78rem", color: "var(--amber-lt)", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}
      </span>
      {loopMode && <span style={{ fontSize: "0.7rem", color: "var(--amber-lt)", flexShrink: 0 }}>↺</span>}
      <input
        type="range" min={0} max={100}
        defaultValue={savedVol.current}
        onChange={onVolume}
        title="Volume"
        style={{
          width: 72, flexShrink: 0, cursor: "pointer",
          accentColor: "var(--amber)", height: 3,
        }}
      />
      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>
        {skipVotes}/{skipThreshold} skip
      </span>
    </div>
  );
}
