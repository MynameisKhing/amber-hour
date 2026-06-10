import { useEffect, useRef } from "react";
import type { PresencePayload } from "../types";

// ── Sprite config — adjust to match your images ───────────────────────────────
const SPRITE_H    = 96;   // px — rendered height (width scales automatically)
const WALK_SPEED  = 6;    // % of popup width per second
const TICK_MS     = 120;  // ms per tick (~8 fps movement)
// ─────────────────────────────────────────────────────────────────────────────

type Dir = "south" | "west" | "east";

interface Char {
  x: number;
  dir: Dir;
  idleTicks: number;
}

function spriteUrl(role: string, dir: Dir) {
  if (role === "staff") return `/sprites/bartainder/bartainder-${dir}.png`;
  return `/sprites/customer/customer-${dir}.png`;
}

function makeChars(count: number): Char[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 8 + (i / Math.max(count, 1)) * 80,
    dir: "south" as Dir,
    idleTicks: Math.floor(Math.random() * 8) + 2,
  }));
}

interface Props {
  onlineUsers: PresencePayload["users"];
  onClose: () => void;
}

export default function LoungePopup({ onlineUsers, onClose }: Props) {
  const visible = onlineUsers.slice(0, 8);

  // DOM refs — updated directly to avoid re-render flicker
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const imgRefs  = useRef<(HTMLImageElement | null)[]>([]);

  // Mutable sim state — never triggers re-renders
  const charsRef   = useRef<Char[]>(makeChars(visible.length));
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Popup root ref for drag
  const popupRef = useRef<HTMLDivElement>(null);
  const dragRef  = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(null);

  // Re-init when user count changes
  const prevCount = useRef(visible.length);
  useEffect(() => {
    if (prevCount.current === visible.length) return;
    prevCount.current = visible.length;
    charsRef.current = makeChars(visible.length);
  }, [visible.length]);

  // Animation loop — DOM-only updates, no setState
  useEffect(() => {
    const dx = (WALK_SPEED * TICK_MS) / 1000;

    const setIdle = (img: HTMLImageElement, role: string, offset: number) => {
      img.src = spriteUrl(role, "south");
      img.style.animation = `spriteIdleBob 1.8s ease-in-out ${offset.toFixed(1)}s infinite`;
    };

    const id = setInterval(() => {
      charsRef.current = charsRef.current.map((c, i) => {
        const wrap = wrapRefs.current[i];
        const img  = imgRefs.current[i];
        const user = visibleRef.current[i];
        if (!wrap || !img || !user) return c;

        let { x, dir, idleTicks } = c;

        // Idle countdown — always show south/bob sprite while waiting
        if (idleTicks > 0) {
          setIdle(img, user.role, i * 0.4);
          return { x, dir: "south" as Dir, idleTicks: idleTicks - 1 };
        }

        // Pick direction when standing still
        if (dir === "south") {
          dir = x < 50 ? "east" : "west";
          img.src = spriteUrl(user.role, dir);
          img.style.animation = "none";
        }

        // Move
        if (dir === "east") {
          x = Math.min(x + dx, 88);
          if (x >= 88) {
            setIdle(img, user.role, i * 0.4);
            wrap.style.left = `${x}%`;
            return { x, dir: "south" as Dir, idleTicks: Math.floor(Math.random() * 10) + 4 };
          }
        } else {
          x = Math.max(x - dx, 4);
          if (x <= 4) {
            setIdle(img, user.role, i * 0.4);
            wrap.style.left = `${x}%`;
            return { x, dir: "south" as Dir, idleTicks: Math.floor(Math.random() * 10) + 4 };
          }
        }

        wrap.style.left = `${x}%`;
        return { x, dir, idleTicks: 0 };
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []); // runs once — uses refs throughout

  // Drag handlers — attach to title bar onMouseDown
  const onTitleMouseDown = (e: React.MouseEvent) => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    // Convert to top/left positioning
    popupRef.current.style.bottom = "auto";
    popupRef.current.style.right  = "auto";
    popupRef.current.style.top    = `${rect.top}px`;
    popupRef.current.style.left   = `${rect.left}px`;

    dragRef.current = { ox: rect.left, oy: rect.top, startX: e.clientX, startY: e.clientY };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !popupRef.current) return;
      const nx = dragRef.current.ox + ev.clientX - dragRef.current.startX;
      const ny = dragRef.current.oy + ev.clientY - dragRef.current.startY;
      // Clamp inside viewport
      const maxX = window.innerWidth  - popupRef.current.offsetWidth;
      const maxY = window.innerHeight - popupRef.current.offsetHeight;
      popupRef.current.style.left = `${Math.max(0, Math.min(nx, maxX))}px`;
      popupRef.current.style.top  = `${Math.max(0, Math.min(ny, maxY))}px`;
    };

    const onUp = () => {
      dragRef.current = null;
      if (popupRef.current) popupRef.current.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    popupRef.current.style.cursor = "grabbing";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={popupRef}
      style={{
        position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 150,
        width: 360, borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)",
        boxShadow: "0 6px 32px rgba(80,40,10,0.28), 0 0 0 1px rgba(155,90,14,0.12)",
        animation: "popIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}
    >

      {/* Title bar — drag handle */}
      <div
        onMouseDown={onTitleMouseDown}
        style={{
          background: "var(--surface)", borderBottom: "1px solid var(--border)",
          padding: "0.35rem 0.6rem 0.35rem 0.75rem",
          display: "flex", alignItems: "center", gap: "0.5rem",
          cursor: "grab", userSelect: "none",
        }}
      >
        <span style={{ fontSize: "0.82rem", color: "var(--amber-lt)", fontWeight: 700, letterSpacing: "0.04em" }}>
          🍸 Lounge
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {onlineUsers.length} {onlineUsers.length === 1 ? "guest" : "guests"}
        </span>
        <button
          onClick={onClose}
          onMouseDown={e => e.stopPropagation()}
          style={{
            marginLeft: "auto", background: "transparent", border: "none",
            cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem",
            padding: "2px 6px", borderRadius: 4, lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
        >✕</button>
      </div>

      {/* Bar viewport */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "16 / 9",
        background: "var(--bg)", overflow: "hidden",
      }}>
        {/* Background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('/bar-background.gif')",
          backgroundSize: "cover", backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat", imageRendering: "pixelated",
        }} />

        {/* Scanlines */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)",
        }} />

        {/* Characters — rendered once, animated via DOM refs */}
        {visible.map((u, i) => {
          const c = charsRef.current[i] ?? { x: 10, dir: "south" as Dir };
          return (
            <div
              key={u.nickname}
              ref={el => { wrapRefs.current[i] = el; }}
              style={{
                position: "absolute", bottom: 0, left: `${c.x}%`,
                transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              }}
            >
              <span style={{
                fontSize: "0.5rem", color: "#fff", fontWeight: 700,
                textShadow: "0 1px 3px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.9)",
                whiteSpace: "nowrap", letterSpacing: "0.03em",
                maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {u.nickname}
              </span>
              <img
                ref={el => { imgRefs.current[i] = el; }}
                src={spriteUrl(u.role, c.dir)}
                alt={u.nickname}
                title={`${u.nickname} (${u.role}) — ${spriteUrl(u.role, c.dir)}`}
                draggable={false}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.cssText = `width:32px;height:${SPRITE_H}px;background:${u.role === "staff" ? "#fb923c" : "#7dd3fc"};border-radius:4px;`;
                  el.removeAttribute("src");
                }}
                style={{
                  height: SPRITE_H,
                  width: "auto",
                  imageRendering: "pixelated",
                  display: "block",
                  animation: `spriteIdleBob 1.8s ease-in-out ${(i * 0.4).toFixed(1)}s infinite`,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
