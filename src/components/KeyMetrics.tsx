/**
 * KeyMetrics — live snapshot of key valuation & profitability ratios.
 * Fetches from Finnhub (free, cached) + Yahoo Finance for forward metrics.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart2 } from "lucide-react";
import { fetchKeyMetrics, type FinnhubKeyMetrics } from "@/services/finnhubService";
import { toast } from "sonner";

/* ── Yahoo Finance forward EPS ──────────────────────────── */
interface ForwardData {
  forwardEPS: number | null;
  growthRate5Y: number | null; // decimal e.g. 0.15
}

async function fetchForwardData(ticker: string): Promise<ForwardData> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/earningsTrend/${ticker.toUpperCase()}`;
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    if (!res.ok) return { forwardEPS: null, growthRate5Y: null };
    const json = await res.json();
    const trends: any[] = json?.earningsTrend?.result?.[0]?.trend ?? [];

    const nextYear = trends.find((t: any) => t.period === "+1y");
    const fiveYear = trends.find((t: any) => t.period === "+5y");

    const forwardEPS   = nextYear?.earningsEstimate?.avg?.raw ?? null;
    const growthRate5Y = fiveYear?.growth?.raw ?? null;

    return { forwardEPS, growthRate5Y };
  } catch {
    return { forwardEPS: null, growthRate5Y: null };
  }
}

/* ── Metric item ─────────────────────────────────────────── */
interface MetricItemProps {
  label: string;
  value: number | null;
  suffix?: string;
  decimals?: number;
  hint?: string;
  highlight?: boolean;
}

const MetricItem = ({ label, value, suffix = "", decimals = 1, hint }: MetricItemProps) => {
  const display = value !== null && isFinite(value)
    ? `${value.toFixed(decimals)}${suffix}`
    : "—";

  const isGood = value !== null && suffix === "%" && value > 0;
  const isNeg  = value !== null && suffix === "%" && value < 0;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <div>
        <span className="text-sm text-muted-foreground">{label}</span>
        {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
      </div>
      <span className={`text-sm font-bold tabular-nums ${
        display === "—" ? "text-muted-foreground/50" :
        isGood ? "text-emerald-600" :
        isNeg  ? "text-red-500" :
        "text-foreground"
      }`}>
        {display}
      </span>
    </div>
  );
};

/* ── Component ──────────────────────────────────────────── */
interface Props {
  ticker: string;
}

export function KeyMetrics({ ticker }: Props) {
  const [metrics,  setMetrics]  = useState<FinnhubKeyMetrics | null>(null);
  const [forward,  setForward]  = useState<ForwardData | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMetrics(null);
    setForward(null);

    Promise.all([
      fetchKeyMetrics(ticker),
      fetchForwardData(ticker),
    ])
      .then(([m, f]) => { setMetrics(m); setForward(f); })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Derived forward metrics
  const forwardPE: number | null = (() => {
    if (!metrics?.currentPrice || !forward?.forwardEPS) return null;
    const v = metrics.currentPrice / forward.forwardEPS;
    return isFinite(v) && v > 0 ? +v.toFixed(1) : null;
  })();

  const forwardPEG: number | null = (() => {
    if (!forwardPE || !forward?.growthRate5Y || forward.growthRate5Y === 0) return null;
    const g = forward.growthRate5Y * 100; // convert to % for PEG convention
    const v = forwardPE / g;
    return isFinite(v) && v > 0 ? +v.toFixed(2) : null;
  })();

  const peg: number | null = (() => {
    if (metrics?.peg !== null && metrics?.peg !== undefined) return metrics.peg;
    // Fallback: P/E TTM / 5Y growth
    if (!metrics?.pe || !forward?.growthRate5Y || forward.growthRate5Y === 0) return null;
    const g = forward.growthRate5Y * 100;
    const v = metrics.pe / g;
    return isFinite(v) && v > 0 ? +v.toFixed(2) : null;
  })();

  const metricsLeft: MetricItemProps[] = [
    { label: "P/E (TTM)",       value: metrics?.pe         ?? null, decimals: 1, hint: "Price / Earnings TTM" },
    { label: "Forward P/E",     value: forwardPE,                   decimals: 1, hint: "Price / אומדן EPS שנה הבאה" },
    { label: "P/S (TTM)",       value: metrics?.ps         ?? null, decimals: 1, hint: "Price / Sales TTM" },
    { label: "P/B",             value: metrics?.pb         ?? null, decimals: 1, hint: "Price / Book Value" },
  ];

  const metricsRight: MetricItemProps[] = [
    { label: "ROE",             value: metrics?.roe        ?? null, suffix: "%", decimals: 1, hint: "Return on Equity TTM" },
    { label: "ROA",             value: metrics?.roa        ?? null, suffix: "%", decimals: 1, hint: "Return on Assets TTM" },
    { label: "ROI",             value: metrics?.roi        ?? null, suffix: "%", decimals: 1, hint: "Return on Investment TTM" },
    { label: "PEG",             value: peg,                         decimals: 2, hint: "P/E / שיעור צמיחה 5Y" },
    { label: "Forward PEG",     value: forwardPEG,                  decimals: 2, hint: "Forward P/E / צמיחת EPS 5Y" },
  ];

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart2 className="h-4 w-4 text-primary" />
          מדדים פיננסיים עדכניים — {ticker}
        </CardTitle>
        <p className="text-xs text-muted-foreground">נתוני Finnhub · Forward מ-Yahoo Finance</p>
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
            {/* Left column */}
            <div className="divide-y divide-border/0">
              {metricsLeft.map((m) => (
                <MetricItem key={m.label} {...m} />
              ))}
            </div>
            {/* Right column */}
            <div className="divide-y divide-border/0 border-t md:border-t-0 mt-2 md:mt-0 pt-2 md:pt-0">
              {metricsRight.map((m) => (
                <MetricItem key={m.label} {...m} />
              ))}
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
