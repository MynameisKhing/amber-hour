const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  display: "block" as const,
};

interface P { size?: number; style?: React.CSSProperties }

export function IcoMenu({ size = 18, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="16" y2="17" />
    </svg>
  );
}

export function IcoClose({ size = 16, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6"  y2="18" />
    </svg>
  );
}

export function IcoMembers({ size = 18, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function IcoAttach({ size = 16, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <path d="M21 13.5V17a4 4 0 01-8 0V6a2.5 2.5 0 015 0v10.5a1 1 0 01-2 0V8" />
    </svg>
  );
}

export function IcoEmoji({ size = 16, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2" />
      <circle cx="9"  cy="9.5" r="0.5" fill="currentColor" />
      <circle cx="15" cy="9.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IcoReply({ size = 16, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 00-4-4H4" />
    </svg>
  );
}

export function IcoEdit({ size = 15, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function IcoTrash({ size = 15, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

export function IcoMessage({ size = 15, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

export function IcoLock({ size = 14, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...S} style={style}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
