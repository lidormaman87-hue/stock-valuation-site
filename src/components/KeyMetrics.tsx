/**
 * KeyMetrics — live snapshot of key valuation & profitability ratios.
 * Data source: Finviz (via CORS proxy).
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart2 } from "lucide-react";
import { fetchFinvizMetrics, type FinvizMetrics } from "@/services/finvizService";
import { toast } from "sonner";

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
            : isPos
            ? "text-emerald-600"
            : isNeg
            ? "text-red-500"
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
  const [metrics, setMetrics] = useState<FinvizMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMetrics(null);
    fetchFinvizMetrics(ticker)
      .then(setMetrics)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Forward PEG = Fwd P/E ÷ EPS growth next 5Y
  const forwardPEG: number | null = (() => {
    if (!metrics?.forwardPE || !metrics.epsGrowthNext5Y || metrics.epsGrowthNext5Y <= 0)
      return null;
    const v = metrics.forwardPE / metrics.epsGrowthNext5Y;
    return isFinite(v) && v > 0 ? +v.toFixed(2) : null;
  })();

  const leftCol: MetricItemProps[] = [
    { label: "P/E (TTM)",     value: metrics?.pe        ?? null, decimals: 1 },
    { label: "Forward P/E",   value: metrics?.forwardPE ?? null, decimals: 1 },
    { label: "P/S",           value: metrics?.ps        ?? null, decimals: 1 },
    { label: "P/B",           value: metrics?.pb        ?? null, decimals: 1 },
    { label: "P/FCF",         value: metrics?.pfcf      ?? null, decimals: 1 },
  ];

  const rightCol: MetricItemProps[] = [
    { label: "ROE",           value: metrics?.roe       ?? null, suffix: "%", decimals: 1 },
    { label: "ROA",           value: metrics?.roa       ?? null, suffix: "%", decimals: 1 },
    { label: "ROI",           value: metrics?.roi       ?? null, suffix: "%", decimals: 1 },
    { label: "PEG",           value: metrics?.peg       ?? null, decimals: 2 },
    { label: "Forward PEG",   value: forwardPEG,                 decimals: 2,
      hint: "Fwd P/E ÷ EPS next 5Y" },
  ];

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart2 className="h-4 w-4 text-primary" />
          מדדים פיננסיים עדכניים — {ticker}
        </CardTitle>
        <p className="text-xs text-muted-foreground">מקור: Yahoo Finance · Finnhub</p>
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
