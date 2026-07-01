/**
 * CAPMSection — computes required rate of return using CAPM.
 *
 * Formula: r = Rf + β × ERP
 *   Rf  = 10-year US Treasury yield (fetched live from Yahoo Finance ^TNX)
 *   β   = stock beta (from Finnhub)
 *   ERP = Equity Risk Premium (user-adjustable, default 5.5%)
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Percent } from "lucide-react";
import { fetchKeyMetrics } from "@/services/finnhubService";

/* ── Fetch 10Y Treasury yield via Yahoo Finance ^TNX ─────── */
async function fetchRiskFreeRate(): Promise<number | null> {
  const CACHE_KEY = "capm_rf_v1";
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { ts, v } = JSON.parse(raw);
      if (Date.now() - ts < 3 * 3600 * 1000) return v; // 3-hour cache
    }
  } catch {}

  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d";
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
      const json   = JSON.parse(text);
      const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      // Last non-null close (^TNX is quoted directly as %, e.g. 4.23)
      const v = [...closes].reverse().find((c: number | null) => c !== null && isFinite(c));
      if (v !== undefined) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), v })); } catch {}
        return +(v as number).toFixed(2);
      }
    } catch { /* try next */ }
  }
  return null;
}

/* ── Row ─────────────────────────────────────────────────── */
const Row = ({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: boolean }) => (
  <div className={`flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 ${highlight ? "mt-1" : ""}`}>
    <div>
      <span className={`text-sm ${highlight ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
    <span className={`tabular-nums font-bold ${
      highlight ? "text-lg text-primary" : "text-sm text-foreground"
    }`}>
      {value}
    </span>
  </div>
);

/* ── Component ───────────────────────────────────────────── */
interface Props { ticker: string }

export function CAPMSection({ ticker }: Props) {
  const [rf,      setRf]      = useState<number | null>(null);
  const [beta,    setBeta]    = useState<number | null>(null);
  const [erp,     setErp]     = useState<number>(5.5);  // user-editable %
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setBeta(null);

    Promise.all([
      fetchRiskFreeRate(),
      fetchKeyMetrics(ticker),
    ])
      .then(([rfRate, metrics]) => {
        setRf(rfRate);
        setBeta(metrics.beta);
      })
      .finally(() => setLoading(false));
  }, [ticker]);

  // CAPM = Rf + β × ERP
  const capm: number | null = (() => {
    if (rf === null || beta === null) return null;
    return +(rf + beta * erp).toFixed(2);
  })();

  const fmt = (v: number | null, suffix = "%") =>
    v !== null ? `${v.toFixed(2)}${suffix}` : "—";

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" />
          שיעור היוון לפי CAPM — {ticker}
        </CardTitle>
        <p className="text-xs text-muted-foreground">r = Rf + β × ERP</p>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען נתונים...
          </div>
        )}

        {!loading && (
          <div>
            <Row
              label="ריבית חסרת סיכון (Rf)"
              value={fmt(rf)}
              sub="תשואת אגח ממשלת ארה\"ב ל-10 שנים"
            />
            <Row
              label={`בטא (β)`}
              value={beta !== null ? beta.toFixed(2) : "—"}
              sub="רגישות המניה לתנודות השוק"
            />

            {/* ERP — editable */}
            <div className="flex items-center justify-between py-2.5 border-b border-border/30">
              <div>
                <span className="text-sm text-muted-foreground">פרמיית סיכון שוק (ERP)</span>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">ניתן לשינוי</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.1}
                  value={erp}
                  onChange={(e) => setErp(Math.max(0, Math.min(15, Number(e.target.value))))}
                  className="w-16 text-right text-sm font-bold tabular-nums bg-transparent border border-border rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {/* Result */}
            <div className={`flex items-center justify-between pt-3 mt-1 ${capm !== null ? "border-t-2 border-primary/30" : ""}`}>
              <div>
                <span className="font-semibold text-foreground">שיעור היוון CAPM</span>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {rf !== null && beta !== null
                    ? `${rf.toFixed(2)}% + ${beta.toFixed(2)} × ${erp.toFixed(1)}%`
                    : "ממתין לנתונים..."}
                </p>
              </div>
              <span className={`text-2xl font-extrabold tabular-nums ${
                capm !== null ? "text-primary" : "text-muted-foreground/40"
              }`}>
                {capm !== null ? `${capm}%` : "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
