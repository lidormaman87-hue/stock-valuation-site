/**
 * KeyMetrics — live snapshot of key valuation & profitability ratios.
 * Primary source: Finnhub (direct API, no proxy needed).
 * Forward EPS: Yahoo Finance via proxy (optional — shows "—" if unavailable).
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart2 } from "lucide-react";
import { fetchKeyMetrics, type FinnhubKeyMetrics } from "@/services/finnhubService";
import { toast } from "sonner";

/* ── Optional: Forward EPS from Yahoo Finance ─────────────── */
async function fetchForwardEPS(ticker: string): Promise<number | null> {
  const t = ticker.trim().toUpperCase();
  // Try cached value first
  const ck = `fwd_eps_${t}`;
  try {
    const raw = localStorage.getItem(ck);
    if (raw) {
      const { ts, v } = JSON.parse(raw);
      if (Date.now() - ts < 6 * 3600 * 1000) return v;
    }
  } catch {}

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=defaultKeyStatistics`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue;
      const json = JSON.parse(text);
      const v = json?.quoteSummary?.result?.[0]?.defaultKeyStatistics?.forwardEps?.raw ?? null;
      if (v !== null && isFinite(Number(v))) {
        try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), v: Number(v) })); } catch {}
        return Number(v);
      }
    } catch { /* try next */ }
  }
  return null;
}

/* ── Metric row ──────────────────────────────────────────── */
interface MetricItemProps {
  label: string;
  value: number | null;
  suffix?: string;
  decimals?: number;
  hint?: string;
}

const MetricItem = ({ label, value, suffix = "", decimals = 1, hint }: MetricItemProps) => {
  const display =
    value !== null && isFinite(value)
      ? `${value.toFixed(decimals)}${suffix}`
      : "—";

  const isPos = value !== null && suffix === "%" && value > 0;
  const isNeg = value !== null && suffix === "%" && value < 0;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <div>
        <span className="text-sm text-muted-foreground">{label}</span>
        {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
      </div>
      <span
        className={`text-sm font-bold tabular-nums ${
          display === "—"
            ? "text-muted-foreground/50"
            : isPos ? "text-emerald-600"
            : isNeg ? "text-red-500"
            : "text-foreground"
        }`}
      >
        {display}
      </span>
    </div>
  );
};

/* ── Component ───────────────────────────────────────────── */
interface Props { ticker: string }

export function KeyMetrics({ ticker }: Props) {
  const [metrics,    setMetrics]    = useState<FinnhubKeyMetrics | null>(null);
  const [forwardEPS, setForwardEPS] = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMetrics(null);
    setForwardEPS(null);

    // Finnhub is mandatory; forward EPS is best-effort
    fetchKeyMetrics(ticker)
      .then((m) => {
        setMetrics(m);
        // Try to get forward EPS in the background (don't await)
        fetchForwardEPS(ticker).then(setForwardEPS).catch(() => {});
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Forward P/E = current price / forward EPS
  const forwardPE: number | null = (() => {
    if (metrics?.currentPrice && forwardEPS) {
      const v = metrics.currentPrice / forwardEPS;
      if (isFinite(v) && v > 0) return +v.toFixed(1);
    }
    return null;
  })();

  // Forward PEG = Forward P/E / EPS growth 3Y %
  const forwardPEG: number | null = (() => {
    const fpe = forwardPE ?? metrics?.pe ?? null;
    const g   = metrics?.epsGrowth3Y ?? null;
    if (!fpe || !g || g <= 0) return null;
    const v = fpe / g;
    return isFinite(v) && v > 0 ? +v.toFixed(2) : null;
  })();

  const leftCol: MetricItemProps[] = [
    { label: "P/E (TTM)",   value: metrics?.pe        ?? null, decimals: 1 },
    { label: "Forward P/E", value: forwardPE,                   decimals: 1 },
    { label: "P/S",         value: metrics?.ps        ?? null, decimals: 1 },
    { label: "P/B",         value: metrics?.pb        ?? null, decimals: 1 },
  ];

  const rightCol: MetricItemProps[] = [
    { label: "ROE", value: metrics?.roe ?? null, suffix: "%", decimals: 1 },
    { label: "ROA", value: metrics?.roa ?? null, suffix: "%", decimals: 1 },
    { label: "ROI", value: metrics?.roi ?? null, suffix: "%", decimals: 1 },
    { label: "PEG",         value: metrics?.peg ?? null, decimals: 2 },
    { label: "Forward PEG", value: forwardPEG,             decimals: 2 },
  ];

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart2 className="h-4 w-4 text-primary" />
          מדדים פיננסיים עדכניים — {ticker}
        </CardTitle>
        <p className="text-xs text-muted-foreground">מקור: Finnhub</p>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען מדדים...
          </div>
        )}

        {!loading && metrics && (
          <div className="grid md:grid-cols-2 gap-0 md:gap-6">
            <div>{leftCol.map((m) => <MetricItem key={m.label} {...m} />)}</div>
            <div className="border-t md:border-t-0 mt-2 md:mt-0 pt-2 md:pt-0">
              {rightCol.map((m) => <MetricItem key={m.label} {...m} />)}
            </div>
          </div>
        )}

        {!loading && !metrics && (
          <p className="text-sm text-muted-foreground py-4 text-center">לא נמצאו נתונים</p>
        )}
      </CardContent>
    </Card>
  );
}
