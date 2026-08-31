import type { AgentShape } from "@/lib/agents";

export function AgentGlyph({
  shape,
  color,
  size = 22,
}: {
  shape: AgentShape;
  color: string;
  size?: number;
}) {
  const s = size;
  const c = s / 2;
  if (shape === "eyes") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill={color} />
        <ellipse cx="11.2" cy="16" rx="3.1" ry="5" fill="#05060a" />
        <ellipse cx="20.8" cy="16" rx="3.1" ry="5" fill="#05060a" />
      </svg>
    );
  }
  if (shape === "star") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <polygon
          points="16,2 19.4,12.2 30,12.6 21.4,19 24.4,29.5 16,23.2 7.6,29.5 10.6,19 2,12.6 12.6,12.2"
          fill={color}
        />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <polygon points="16,3 30,28 2,28" fill="none" stroke={color} strokeWidth="2.4" />
        <circle cx="16" cy="21" r="1.6" fill={color} />
        <rect x="15.1" y="11" width="1.8" height="7" rx="0.8" fill={color} />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <polygon points="16,3 29,16 16,29 3,16" fill={color} />
      </svg>
    );
  }
  if (shape === "hex") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <polygon points="16,2 28,9.5 28,22.5 16,30 4,22.5 4,9.5" fill={color} />
      </svg>
    );
  }
  if (shape === "shield") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <path
          d="M16 3 L27 8 V16.5 C27 23 22.5 27.5 16 29.5 C9.5 27.5 5 23 5 16.5 V8 Z"
          fill={color}
        />
      </svg>
    );
  }
  if (shape === "bolt") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <polygon points="18,2 8,18 15,18 12,30 26,12 18,12" fill={color} />
      </svg>
    );
  }
  if (shape === "bars") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <rect x="5" y="16" width="5" height="12" rx="1" fill={color} />
        <rect x="13.5" y="8" width="5" height="20" rx="1" fill={color} />
        <rect x="22" y="12" width="5" height="16" rx="1" fill={color} />
      </svg>
    );
  }
  if (shape === "coin") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke={color} strokeWidth="2.4" />
        <path d="M16 8 v16 M12 12 h6 c3 0 3 4 0 4 h-4 c-3 0 -3 4 0 4 h7" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  if (shape === "wave") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <path
          d="M3 20 C7 12, 11 12, 15 20 S23 28, 29 20"
          fill="none"
          stroke={color}
          strokeWidth="2.4"
        />
        <path
          d="M3 14 C7 6, 11 6, 15 14 S23 22, 29 14"
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          opacity="0.55"
        />
      </svg>
    );
  }
  if (shape === "feed") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <rect x="5" y="6" width="22" height="3.2" rx="1" fill={color} />
        <rect x="5" y="14.4" width="16" height="3.2" rx="1" fill={color} opacity="0.85" />
        <rect x="5" y="22.8" width="20" height="3.2" rx="1" fill={color} opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
      <circle cx={c} cy={c} r="6" fill={color} />
      <circle cx={c} cy={c} r="11" fill="none" stroke={color} strokeWidth="1.6" opacity="0.7" />
      <circle cx={c} cy={c} r="15" fill="none" stroke={color} strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

export function GrokCore({ size = 92 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 34% 30%, #ffffff 0%, #e8edf5 38%, #9aa3b5 72%, #5c6574 100%)",
          boxShadow:
            "0 0 48px rgb(232 237 245 / 0.22), inset -10px -14px 22px rgb(0 0 0 / 0.28), inset 8px 6px 12px rgb(255 255 255 / 0.45)",
        }}
      />
      <div
        className="absolute rounded-full bg-bg"
        style={{
          width: size * 0.16,
          height: size * 0.28,
          left: "28%",
          top: "36%",
        }}
      />
      <div
        className="absolute rounded-full bg-bg"
        style={{
          width: size * 0.16,
          height: size * 0.28,
          right: "28%",
          top: "36%",
        }}
      />
    </div>
  );
}
