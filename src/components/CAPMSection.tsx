/**
 * CAPMSection — computes required rate of return using CAPM.
 *
 * Formula: E[Ri] = Rf + β × (E[Rm] − Rf)
 *   Rf     = ריבית הפד (Fed Funds Rate) — fetched live from FRED
 *   E[Rm]  = 10% (קבוע — תוחלת תיק השוק)
 *   σ²m    = 20% (קבוע — שונות תיק השוק, מוצגת לשקיפות)
 *   β      = from Finnhub
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Percent } from "lucide-react";
import { fetchKeyMetrics } from "@/services/finnhubService";

const MARKET_RETURN = 10;   // E[Rm] — קבוע %
const MARKET_VAR    = 20;   // σ²m    — קבוע % (מוצג, מגולם בבטא)

/* ── Fetch Fed Funds Rate from FRED ─────────────────────── */
async function fetchFedRate(): Promise<number | null> {
  const CACHE_KEY = "capm_fed_v1";
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { ts, v } = JSON.parse(raw);
      if (Date.now() - ts < 3 * 3600 * 1000) return v; // 3h cache
    }
  } catch {}

  // FRED CSV: DATE,EFFR (Effective Federal Funds Rate, daily)
  const fredUrl = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR";
  const sources = [
    fredUrl,                                                                 // direct (FRED allows CORS)
    `https://api.allorigins.win/raw?url=${encodeURIComponent(fredUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(fredUrl)}`,
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      // CSV header: DATE,EFFR — parse last non-empty data row
      const lines = text.trim().split("\n").slice(1).filter(Boolean);
      const last  = lines[lines.length - 1]?.split(",");
      if (!last) continue;
      const v = parseFloat(last[1]);
      if (isFinite(v) && v > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), v })); } catch {}
        return +v.toFixed(2);
      }
    } catch { /* try next */ }
  }
  return null;
}

/* ── Row ─────────────────────────────────────────────────── */
const Row = ({
  label, value, sub, badge,
}: {
  label: string; value: string; sub?: string; badge?: string;
}) => (
  <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
    <div>
      <span className="text-sm text-muted-foreground">{label}</span>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className="text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5">
          {badge}
        </span>
      )}
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
    </div>
  </div>
);

/* ── Component ───────────────────────────────────────────── */
interface Props { ticker: string }

export function CAPMSection({ ticker }: Props) {
  const [rf,      setRf]      = useState<number | null>(null);
  const [beta,    setBeta]    = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setBeta(null);

    Promise.all([fetchFedRate(), fetchKeyMetrics(ticker)])
      .then(([rate, metrics]) => {
        setRf(rate);
        setBeta(metrics.beta);
      })
      .finally(() => setLoading(false));
  }, [ticker]);

  // E[Rm] − Rf  =  פרמיית הסיכון
  const erp: number | null = rf !== null ? +(MARKET_RETURN - rf).toFixed(2) : null;

  // CAPM = Rf + β × (E[Rm] − Rf)
  const capm: number | null =
    rf !== null && beta !== null && erp !== null
      ? +(rf + beta * erp).toFixed(2)
      : null;

  const pct = (v: number | null, decimals = 2) =>
    v !== null ? `${v.toFixed(decimals)}%` : "—";

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" />
          שיעור היוון CAPM — {ticker}
        </CardTitle>
        <p className="text-xs text-muted-foreground font-mono">
          E[Ri] = Rf + β × (E[Rm] − Rf)
        </p>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען...
          </div>
        )}

        {!loading && (
          <div>
            <Row
              label="ריבית הפד (Rf)"
              value={pct(rf)}
              sub="Effective Federal Funds Rate — FRED"
              badge="live"
            />
            <Row
              label="תוחלת תיק השוק E[Rm]"
              value={pct(MARKET_RETURN, 1)}
              sub="קבוע — ממוצע היסטורי S&P 500"
              badge="קבוע"
            />
            <Row
              label="שונות תיק השוק σ²m"
              value={`${MARKET_VAR}%`}
              sub="קבוע — מגולם בבטא"
              badge="קבוע"
            />
            <Row
              label="בטא (β)"
              value={beta !== null ? beta.toFixed(2) : "—"}
              sub="Cov(Ri, Rm) / σ²m — Finnhub"
            />
            <Row
              label="פרמיית סיכון E[Rm] − Rf"
              value={pct(erp)}
              sub={rf !== null ? `${MARKET_RETURN}% − ${rf.toFixed(2)}%` : undefined}
            />

            {/* Result */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t-2 border-primary/30">
              <div>
                <p className="font-semibold text-foreground">שיעור היוון CAPM</p>
                {capm !== null && rf !== null && beta !== null && erp !== null && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                    {rf.toFixed(2)}% + {beta.toFixed(2)} × {erp.toFixed(2)}%
                  </p>
                )}
              </div>
              <span className={`text-3xl font-extrabold tabular-nums ${
                capm !== null ? "text-primary" : "text-muted-foreground/30"
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
