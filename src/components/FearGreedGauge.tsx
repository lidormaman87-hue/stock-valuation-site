/**
 * FearGreedGauge — CNN Fear & Greed Index dashboard.
 * Data: production.dataviz.cnn.io/index/fearandgreed/graphdata
 * Cache: 30 minutes.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity } from "lucide-react";

const CACHE_KEY = "fgi_cnn_v1";
const CACHE_TTL = 30 * 60 * 1000; // 30 min

/* ── Types ───────────────────────────────────────────────── */
interface FGIData {
  score:          number;
  rating:         string;
  prevClose:      number | null;
  prev1Week:      number | null;
  prev1Month:     number | null;
  prev1Year:      number | null;
}

/* ── Fetch ───────────────────────────────────────────────── */
async function fetchFGI(): Promise<FGIData | null> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch {}

  const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
  const proxies = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const src of proxies) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue;
      const json = JSON.parse(text);
      const fg   = json?.fear_and_greed;
      if (!fg) continue;

      const n = (v: any) => {
        const x = parseFloat(String(v ?? ""));
        return isFinite(x) ? +x.toFixed(1) : null;
      };

      const data: FGIData = {
        score:      +(Number(fg.score)).toFixed(1),
        rating:     fg.rating ?? "",
        prevClose:  n(fg.previous_close),
        prev1Week:  n(fg.previous_1_week),
        prev1Month: n(fg.previous_1_month),
        prev1Year:  n(fg.previous_1_year),
      };

      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
      return data;
    } catch { /* try next */ }
  }
  return null;
}

/* ── Color helpers ───────────────────────────────────────── */
const scoreColor = (s: number) =>
  s < 25  ? "#ef4444" :  // Extreme Fear
  s < 45  ? "#f97316" :  // Fear
  s < 56  ? "#eab308" :  // Neutral
  s < 75  ? "#84cc16" :  // Greed
              "#22c55e";  // Extreme Greed

const ratingHe = (r: string) => {
  const m: Record<string, string> = {
    "Extreme Fear": "פחד קיצוני",
    "Fear":         "פחד",
    "Neutral":      "ניטרלי",
    "Greed":        "חמדנות",
    "Extreme Greed":"חמדנות קיצונית",
  };
  return m[r] ?? r;
};

/* ── SVG Gauge ───────────────────────────────────────────── */
function Gauge({ score }: { score: number }) {
  const cx = 110, cy = 100, r = 80;
  // Arc: 180° semi-circle, left = 0, right = 100
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pointOnArc = (deg: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });

  // Score 0→100 maps to angle 180°→0° (left to right)
  const needleAngle = 180 - score * 1.8;
  const needle = pointOnArc(needleAngle);
  const color  = scoreColor(score);

  // Gradient arc segments
  const segments = [
    { from: 180, to: 144, color: "#ef4444" },  // 0–20 Extreme Fear
    { from: 144, to: 108, color: "#f97316" },  // 20–40 Fear
    { from: 108, to:  90, color: "#eab308" },  // 40–50 Neutral
    { from:  90, to:  36, color: "#84cc16" },  // 50–70 Greed
    { from:  36, to:   0, color: "#22c55e" },  // 70–100 Extreme Greed
  ];

  const arc = (fromDeg: number, toDeg: number) => {
    const s = pointOnArc(fromDeg);
    const e = pointOnArc(toDeg);
    const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
    // going counter-clockwise (sweep=0)
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
  };

  return (
    <svg viewBox="0 0 220 115" className="w-full max-w-[240px] mx-auto">
      {/* Track */}
      <path d={`M ${pointOnArc(180).x} ${pointOnArc(180).y} A ${r} ${r} 0 0 1 ${pointOnArc(0).x} ${pointOnArc(0).y}`}
        fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={14} strokeLinecap="round" />

      {/* Colored segments */}
      {segments.map((seg, i) => (
        <path key={i} d={arc(seg.from, seg.to)}
          fill="none" stroke={seg.color} strokeWidth={12} strokeLinecap="butt" opacity={0.85} />
      ))}

      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={needle.x} y2={needle.y}
        stroke={color} strokeWidth={2.5} strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={5} fill={color} />

      {/* Score */}
      <text x={cx} y={cy + 22} textAnchor="middle"
        fontSize={22} fontWeight="bold" fill={color}>
        {score.toFixed(0)}
      </text>
    </svg>
  );
}

/* ── Comparison pill ─────────────────────────────────────── */
const Pill = ({ label, score, current }: { label: string; score: number | null; current: number }) => {
  if (score === null) return null;
  const diff  = +(current - score).toFixed(1);
  const up    = diff > 0;
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{score.toFixed(0)}</span>
      <span className={`text-[10px] font-medium ${up ? "text-emerald-500" : "text-red-400"}`}>
        {up ? "▲" : "▼"}{Math.abs(diff)}
      </span>
    </div>
  );
};

/* ── Component ───────────────────────────────────────────── */
export function FearGreedGauge() {
  const [data,    setData]    = useState<FGIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchFGI()
      .then((d) => { setData(d); if (!d) setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          מדד פחד וחמדנות
        </CardTitle>
        <p className="text-xs text-muted-foreground">מקור: CNN Fear &amp; Greed Index</p>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-muted-foreground py-2 text-center">לא ניתן לטעון נתונים</p>
        )}

        {data && !loading && (
          <div className="space-y-3">
            {/* Gauge */}
            <Gauge score={data.score} />

            {/* Rating label */}
            <div className="text-center -mt-2">
              <span className="text-sm font-semibold" style={{ color: scoreColor(data.score) }}>
                {ratingHe(data.rating)}
              </span>
            </div>

            {/* Comparisons */}
            <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border/30">
              <Pill label="אתמול"       score={data.prevClose}  current={data.score} />
              <Pill label="שבוע שעבר"   score={data.prev1Week}  current={data.score} />
              <Pill label="חודש שעבר"   score={data.prev1Month} current={data.score} />
              <Pill label="שנה שעברה"   score={data.prev1Year}  current={data.score} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
