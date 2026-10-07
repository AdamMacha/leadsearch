import { STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { scoreTone } from "@/lib/utils";

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** Circular score indicator. `invert` = high value is bad (need score). */
export function ScoreRing({
  value,
  size = 44,
  invert = false,
  label,
}: {
  value: number | null | undefined;
  size?: number;
  invert?: boolean;
  label?: string;
}) {
  const tone = scoreTone(value, invert);
  const color = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", muted: "var(--text-3)" }[tone];
  const stroke = Math.max(3, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(232 30% 70% / 0.1)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <span
          className="mono"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontSize: size * 0.3,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: value == null ? "var(--text-3)" : "var(--text)",
          }}
        >
          {value ?? "–"}
        </span>
      </div>
      {label && <span className="small muted">{label}</span>}
    </div>
  );
}

export function PriorityPill({ value }: { value: number | null }) {
  if (value == null) return <span className="badge">neanalyzováno</span>;
  const cls = value >= 70 ? "badge-bad" : value >= 50 ? "badge-warn" : "badge";
  return (
    <span className={`badge ${cls} mono`} style={value >= 70 ? { animation: "pulse-glow 2s infinite" } : undefined}>
      {value >= 70 ? "🔥 " : ""}
      {value}
    </span>
  );
}
