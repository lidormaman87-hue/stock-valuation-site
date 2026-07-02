/**
 * FearGreedGauge — CNN Fear & Greed Index, styled to match FinHacker gauge.
 * Data: production.dataviz.cnn.io/index/fearandgreed/graphdata (+ proxies)
 * Cache: 30 minutes.
 */
import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const CACHE_KEY = "fgi_cnn_v2";
const CACHE_TTL = 30 * 60 * 1000;

/* ── Types ───────────────────────────────────────────────── */
interface FGIData {
  score:      number;
  rating:     string;
  timestamp?: string;
}

/* ── Fetch ───────────────────────────────────────────────── */
async function fetchFGI(bust = false): Promise<FGIData | null> {
  if (!bust) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) return data;
      }
    } catch {}
  }

  // ── 1. Vercel serverless proxy (most reliable — no CORS) ──
  try {
    const res = await fetch("/api/feargreed", { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const json = await res.json();
      if (typeof json.score === "number") {
        const data: FGIData = { score: json.score, rating: json.rating, timestamp: json.timestamp };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
        return data;
      }
    }
  } catch {}

  // ── 2. Direct CNN + public proxies (fallback) ─────────────
  const cnnUrl = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  for (const src of [
    cnnUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(cnnUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(cnnUrl)}`,
  ]) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue;
      const json = JSON.parse(text);
      const fg   = json?.fear_and_greed;
      if (fg == null) continue;
      const data: FGIData = {
        score:     +(Number(fg.score)).toFixed(1),
        rating:    fg.rating ?? "",
        timestamp: fg.timestamp,
      };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
      return data;
    } catch {}
  }

  return null;
}

/* ── Helpers ─────────────────────────────────────────────── */
const ZONES = [
  { label: "Extreme\nFear",  from: 0,   to: 20,  color: "#7b1c1c" },
  { label: "Fear",           from: 20,  to: 45,  color: "#c0622b" },
  { label: "Neutral",        from: 45,  to: 55,  color: "#9a9a9a" },
  { label: "Greed",          from: 55,  to: 80,  color: "#4e9e6e" },
  { label: "Extreme\nGreed", from: 80,  to: 100, color: "#2d6e4e" },
];

const scoreColor = (s: number) => {
  for (const z of ZONES) if (s >= z.from && s <= z.to) return z.color;
  return ZONES[ZONES.length - 1].color;
};

const ratingHe = (r: string) => ({
  "Extreme Fear":  "פחד קיצוני",
  "Fear":          "פחד",
  "Neutral":       "ניטרלי",
  "Greed":         "חמדנות",
  "Extreme Greed": "חמדנות קיצונית",
}[r] ?? r);

/* ── SVG Gauge ───────────────────────────────────────────── */
function Gauge({ score }: { score: number }) {
  const W = 340, H = 210;
  const cx = W / 2, cy = H - 40;
  const R = 120, r_inner = R - 28;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const polar = (deg: number, radius = R) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy  + radius * Math.sin(toRad(deg)),
  });

  // score 0..100 → angle 180..360 (left → top → right, upper semicircle)
  // In SVG y-axis is flipped, so 270° = visual top
  const scoreToAngle = (s: number) => 180 + s * 1.8;

  // Donut arc path for a zone (clockwise = sweep 1 = goes upward in SVG)
  const arcPath = (fromScore: number, toScore: number) => {
    const a1 = scoreToAngle(fromScore);
    const a2 = scoreToAngle(toScore);
    const o1 = polar(a1, R);   const i1 = polar(a1, r_inner);
    const o2 = polar(a2, R);   const i2 = polar(a2, r_inner);
    return [
      `M ${o1.x} ${o1.y}`,
      `A ${R} ${R} 0 0 1 ${o2.x} ${o2.y}`,   // outer arc CW (upward)
      `L ${i2.x} ${i2.y}`,
      `A ${r_inner} ${r_inner} 0 0 0 ${i1.x} ${i1.y}`, // inner arc CCW
      "Z",
    ].join(" ");
  };

  // Needle
  const needleAngle = scoreToAngle(score);
  const needleTip   = polar(needleAngle, R - 6);
  const needleBase  = polar(needleAngle + 90, 6);
  const needleBase2 = polar(needleAngle - 90, 6);

  // Zone label positions (midpoint of each arc, just outside)
  const labelR = R + 18;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Background */}
      <rect x={4} y={4} width={W - 8} height={H - 8} rx={14}
        fill="hsl(var(--secondary)/0.5)" stroke="hsl(var(--border))" strokeWidth={1} />

      {/* Arc segments */}
      {ZONES.map((z) => (
        <path key={z.label} d={arcPath(z.from, z.to)} fill={z.color} opacity={0.92} />
      ))}

      {/* Gap lines between segments */}
      {ZONES.slice(0, -1).map((z) => {
        const ang = scoreToAngle(z.to);
        const o = polar(ang, R + 1);
        const i = polar(ang, r_inner - 1);
        return (
          <line key={z.to}
            x1={o.x} y1={o.y} x2={i.x} y2={i.y}
            stroke="hsl(var(--secondary)/0.8)" strokeWidth={2}
          />
        );
      })}

      {/* Zone labels */}
      {ZONES.map((z) => {
        const midScore = (z.from + z.to) / 2;
        const ang = scoreToAngle(midScore);
        const pos = polar(ang, labelR + (Math.abs(ang - 90) > 50 ? 6 : 0));
        const lines = z.label.split("\n");
        return (
          <text key={z.label} x={pos.x} y={pos.y + (lines.length > 1 ? -6 : 3)}
            textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))" fontWeight="500">
            {lines.map((l, i) => (
              <tspan key={i} x={pos.x} dy={i === 0 ? 0 : 12}>{l}</tspan>
            ))}
          </text>
        );
      })}

      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase.x},${needleBase.y} ${needleBase2.x},${needleBase2.y}`}
        fill="hsl(var(--muted-foreground)/0.6)"
      />
      {/* Needle pivot */}
      <circle cx={cx} cy={cy} r={9} fill="hsl(var(--muted-foreground)/0.7)" />
      <circle cx={cx} cy={cy} r={5} fill="hsl(var(--card))" />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────── */
export function FearGreedGauge({ ticker }: { ticker?: string }) {
  const [data,    setData]    = useState<FGIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async (bust = false) => {
    setLoading(true);
    setError(false);
    try {
      const d = await fetchFGI(bust);
      if (d) { setData(d); setUpdated(new Date()); }
      else setError(true);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  // Refresh with fresh data whenever a new ticker is loaded
  useEffect(() => { load(!!ticker); }, [ticker, load]);

  const color = data ? scoreColor(data.score) : "#9a9a9a";

  return (
    <div className="card-elegant p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-base">Fear &amp; Greed Index</h3>
          <p className="text-xs text-muted-foreground">Live market sentiment</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Score + Label row */}
      {data && (
        <div className="flex items-center gap-4">
          {/* Circle score */}
          <div className="flex-shrink-0 w-16 h-16 rounded-full border-4 flex items-center justify-center"
            style={{ borderColor: color, background: `${color}18` }}>
            <span className="text-xl font-black" style={{ color }}>
              {Math.floor(data.score)}
            </span>
          </div>
          {/* Label */}
          <div>
            <p className="text-2xl font-bold" style={{ color }}>{ratingHe(data.rating)}</p>
            <p className="text-xs text-muted-foreground">{data.rating}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <p className="text-sm text-muted-foreground text-center py-4">לא ניתן לטעון נתונים</p>
      )}

      {/* Loading placeholder */}
      {loading && !data && (
        <div className="space-y-2 animate-pulse py-2">
          <div className="h-16 bg-secondary rounded-xl" />
          <div className="h-36 bg-secondary rounded-xl" />
        </div>
      )}

      {/* Gauge */}
      {data && <Gauge score={data.score} />}

      {/* Footer */}
      {updated && (
        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
          <span>Updated</span>
          <span>{updated.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground -mt-1">
        <span>Source</span>
        <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer"
          className="text-primary hover:underline">CNN Fear &amp; Greed</a>
      </div>
    </div>
  );
}
