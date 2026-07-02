/**
 * GrokForecast — Grok AI financial forecast card
 * Shows: forecast table (actual + consensus + estimates) + CAGR summary + analyst note
 */
import { useState, useCallback, useEffect } from "react";
import { Loader2, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import type { FinnhubHistoricalData } from "@/services/finnhubService";
import {
  fetchGrokForecast,
  buildForecastSummary,
  type ForecastResult,
  type ForecastRow,
} from "@/services/grokForecastService";

/* ── Helpers ──────────────────────────────────────────────── */
const confMeta = (c: string) =>
  ({ HIGH: { bg: "#16a34a18", color: "#16a34a", label: "ביטחון גבוה" },
     MEDIUM: { bg: "#d9770618", color: "#d97706", label: "ביטחון בינוני" },
     LOW:  { bg: "#dc262618", color: "#dc2626", label: "ביטחון נמוך"  },
   }[c] ?? { bg: "#6b728018", color: "#6b7280", label: c });

const typeMeta = (t: string) =>
  ({ actual:    { label: "בפועל",    color: "#6b7280", bg: "#6b728018" },
     consensus: { label: "קונצנזוס", color: "#2563eb", bg: "#2563eb18" },
     estimate:  { label: "הערכה",    color: "#9333ea", bg: "#9333ea18" },
   }[t] ?? { label: t, color: "#6b7280", bg: "#6b728018" });

const fmtRev = (v: number) =>
  Math.abs(v) >= 1000
    ? `$${(v / 1000).toFixed(1)}B`
    : `$${Math.round(v).toLocaleString()}M`;

const fmtPct = (v: number) =>
  (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

/* ── Sub-components ──────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  const m = typeMeta(type);
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function ConfBadge({ confidence }: { confidence: string }) {
  const m = confMeta(confidence);
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function ForecastTable({ rows }: { rows: ForecastRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[740px]" dir="rtl">
        <thead>
          <tr className="bg-secondary/60 text-muted-foreground text-[11px] uppercase tracking-wide">
            {["שנה","סוג","הכנסות","צמיחה","EPS","צמיחת EPS","שולי רווח","ביטחון"].map((h) => (
              <th key={h} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isActual = row.type === "actual";
            const revPos   = row.revenueGrowth >= 0;
            const epsPos   = row.epsGrowth >= 0;
            const margin   = row.netMargin ?? null;
            return (
              <tr key={row.year}
                className={`border-t border-border/40 transition-colors hover:bg-secondary/30 ${isActual ? "bg-secondary/30 font-medium" : ""}`}>
                <td className="px-3 py-2.5 font-bold tabular-nums">{row.year}</td>
                <td className="px-3 py-2.5"><TypeBadge type={row.type} /></td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{fmtRev(row.revenue)}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono font-semibold tabular-nums"
                    style={{ color: revPos ? "#16a34a" : "#dc2626" }}>
                    {fmtPct(row.revenueGrowth)}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums">${row.eps.toFixed(2)}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono font-semibold tabular-nums"
                    style={{ color: epsPos ? "#16a34a" : "#dc2626" }}>
                    {fmtPct(row.epsGrowth)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {margin != null ? (
                    <span className="font-mono tabular-nums text-xs"
                      style={{ color: margin >= 15 ? "#16a34a" : margin >= 8 ? "#d97706" : "#dc2626" }}>
                      {margin.toFixed(1)}%
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5"><ConfBadge confidence={row.confidence} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CAGRGrid({ cagr }: { cagr: ForecastResult["cagr"] }) {
  const items = [
    { label: "CAGR הכנסות 3 שנים", ...cagr.revenue3y },
    { label: "CAGR הכנסות 5 שנים", ...cagr.revenue5y },
    { label: "CAGR EPS 3 שנים",     ...cagr.eps3y },
    { label: "CAGR EPS 5 שנים",     ...cagr.eps5y },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const valColor = item.value >= 12 ? "#16a34a"
          : item.value >= 6  ? "#d97706"
          : item.value >= 0  ? "#6b7280"
          : "#dc2626";
        return (
          <div key={item.label} className="card-elegant p-4 text-center space-y-1.5">
            <p className="text-[11px] text-muted-foreground leading-tight" dir="rtl">{item.label}</p>
            <p className="text-2xl font-black tabular-nums" style={{ color: valColor }}>
              {item.value >= 0 ? "+" : ""}{item.value.toFixed(1)}%
            </p>
            <ConfBadge confidence={item.confidence} />
          </div>
        );
      })}
    </div>
  );
}

function MarginOutlookCard({ margin }: { margin: ForecastResult["marginOutlook"] }) {
  const delta3 = margin.year3 - margin.current;
  const delta5 = margin.year5 - margin.current;
  const sign   = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1) + "pp";
  const col    = (v: number) => v >= 0 ? "#16a34a" : "#dc2626";

  return (
    <div className="rounded-xl border border-violet-300/40 bg-violet-500/5 p-4 space-y-3" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-base">📐</span>
        <h3 className="text-sm font-bold">שולי רווח נקי — תחזית אם התזה תתממש</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Current */}
        <div className="card-elegant p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground">היום (בפועל)</p>
          <p className="text-xl font-black text-foreground tabular-nums">
            {margin.current.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">בסיס</p>
        </div>

        {/* 3Y */}
        <div className="card-elegant p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground">3 שנים קדימה</p>
          <p className="text-xl font-black tabular-nums" style={{ color: col(delta3) }}>
            {margin.year3.toFixed(1)}%
          </p>
          <p className="text-[10px] font-semibold tabular-nums" style={{ color: col(delta3) }}>
            {sign(delta3)}
          </p>
        </div>

        {/* 5Y */}
        <div className="card-elegant p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground">5 שנים קדימה</p>
          <p className="text-xl font-black tabular-nums" style={{ color: col(delta5) }}>
            {margin.year5.toFixed(1)}%
          </p>
          <p className="text-[10px] font-semibold tabular-nums" style={{ color: col(delta5) }}>
            {sign(delta5)}
          </p>
        </div>
      </div>

      {margin.thesisDriver && (
        <p className="text-xs text-foreground/70 leading-relaxed border-t border-border/30 pt-2">
          💡 {margin.thesisDriver}
        </p>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────── */
export function GrokForecast({
  ticker,
  historicalData,
}: {
  ticker: string;
  historicalData: FinnhubHistoricalData;
}) {
  const [result,    setResult]    = useState<ForecastResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Clear result when ticker changes
  useEffect(() => {
    setResult(null);
    setError(null);
    setCollapsed(false);
  }, [ticker]);

  const generate = useCallback(async (bust = false) => {
    if (!ticker || !historicalData) return;
    setLoading(true);
    setError(null);
    try {
      const summary = buildForecastSummary(historicalData);
      const res = await fetchGrokForecast(
        ticker,
        historicalData.companyName,
        summary,
        bust,
      );
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "שגיאה בניתוח Grok");
    } finally {
      setLoading(false);
    }
  }, [ticker, historicalData]);

  return (
    <div className="card-elegant p-5 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4.5 w-4.5 text-violet-500" />
          </div>
          <div>
            <h2 className="font-bold text-base">Grok AI — תחזית פיננסית</h2>
            <p className="text-xs text-muted-foreground" dir="rtl">
              שנה בסיס + קונצנזוס שנים 1–2 + הערכה 3–5 שנים קדימה
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {result && !loading && (
            <>
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {collapsed ? "הצג ▼" : "הסתר ▲"}
              </button>
              <button
                onClick={() => generate(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-2.5 py-1.5 transition-colors"
                title="רענן ניתוח"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </>
          )}
          {!result && (
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />
              }
              צור תחזית
            </button>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Grok AI מנתח את {ticker}…</p>
            <p className="text-xs mt-1 opacity-60">בונה תחזית + קונצנזוס + CAGR</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="flex items-start gap-2 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">שגיאה בניתוח</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
            <button
              onClick={() => generate(true)}
              className="text-xs underline mt-1 hover:no-underline"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground" dir="rtl">
          <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-violet-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">תחזית AI מלאה</p>
            <p className="text-xs mt-1 max-w-xs">
              קונצנזוס אנליסטים לשנים 1–2 + מודל AI לשנים 3–5 +
              CAGR + זיהוי פריטים חד-פעמיים
            </p>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && !collapsed && !loading && (
        <div className="space-y-4">
          {/* Forecast table */}
          <ForecastTable rows={result.forecast} />

          {/* Legend */}
          <div className="flex gap-3 flex-wrap text-[11px] text-muted-foreground" dir="rtl">
            {(["actual","consensus","estimate"] as const).map((t) => {
              const m = typeMeta(t);
              return (
                <span key={t} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
                  {m.label}
                </span>
              );
            })}
          </div>

          {/* CAGR summary */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2" dir="rtl">
              ממוצעי צמיחה שנתיים (CAGR)
            </h3>
            <CAGRGrid cagr={result.cagr} />
          </div>

          {/* Margin outlook */}
          {result.marginOutlook && (
            <MarginOutlookCard margin={result.marginOutlook} />
          )}

          {/* One-time items */}
          {result.oneTimeItems?.hasItems && (
            <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 p-4" dir="rtl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                    פריטים חד-פעמיים — משפיעים על EPS
                  </p>
                  <p className="text-sm text-amber-700/80 dark:text-amber-300/80">
                    {result.oneTimeItems.description}
                  </p>
                  {(result.oneTimeItems.cleanEpsCAGR3y != null || result.oneTimeItems.cleanEpsCAGR5y != null) && (
                    <div className="flex gap-4 mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      {result.oneTimeItems.cleanEpsCAGR3y != null && (
                        <span>CAGR EPS נקי 3 שנים: {result.oneTimeItems.cleanEpsCAGR3y.toFixed(1)}%</span>
                      )}
                      {result.oneTimeItems.cleanEpsCAGR5y != null && (
                        <span>CAGR EPS נקי 5 שנים: {result.oneTimeItems.cleanEpsCAGR5y.toFixed(1)}%</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Analyst note */}
          {result.analystNote && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4" dir="rtl">
              <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wide mb-2">
                📊 הערת אנליסט Grok
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.analystNote}</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/50 text-left">
            ⚠ ניתוח AI בלבד — לא המלצת השקעה. נתוני קונצנזוס מבסיס הידע של Grok (לא בזמן אמת).
          </p>
        </div>
      )}
    </div>
  );
}
