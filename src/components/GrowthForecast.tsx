/**
 * GrowthForecast — Analyst consensus revenue + EPS estimates for next 5 years.
 * Data source: Finnhub /stock/revenue-estimate + /stock/eps-estimate (free tier).
 */
import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Users, ChevronUp, ChevronDown } from "lucide-react";
import { getFinnhubKey } from "@/services/finnhubService";

/* ── Types ──────────────────────────────────────────────── */
interface YearEstimate {
  year: number;
  revenueAvg: number | null;    // billions
  revenueHigh: number | null;
  revenueLow: number | null;
  revenueGrowth: number | null; // % YoY
  epsAvg: number | null;
  epsHigh: number | null;
  epsLow: number | null;
  epsGrowth: number | null;     // % YoY
  analysts: number;
}

/* ── Finnhub fetch ──────────────────────────────────────── */
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cacheGet = (k: string) => {
  try {
    const r = localStorage.getItem("fh_cache_" + k);
    if (!r) return null;
    const { ts, data } = JSON.parse(r);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem("fh_cache_" + k); return null; }
    return data;
  } catch { return null; }
};
const cacheSet = (k: string, data: unknown) => {
  try { localStorage.setItem("fh_cache_" + k, JSON.stringify({ ts: Date.now(), data })); } catch { /**/ }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fhGet = async (path: string, params: Record<string, string> = {}): Promise<any> => {
  const key = getFinnhubKey();
  const ck = path + JSON.stringify(params);
  const cached = cacheGet(ck);
  if (cached) return cached;
  const url = new URL(`https://finnhub.io/api/v1${path}`);
  url.searchParams.set("token", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const json = await res.json();
  cacheSet(ck, json);
  return json;
};

const n = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};

async function fetchForecasts(ticker: string): Promise<YearEstimate[]> {
  const t = ticker.trim().toUpperCase();
  const [revRaw, epsRaw] = await Promise.all([
    fhGet("/stock/revenue-estimate", { symbol: t, freq: "annual" }),
    fhGet("/stock/eps-estimate",     { symbol: t, freq: "annual" }),
  ]);

  const now = new Date().getFullYear();
  const revMap = new Map<number, any>();
  const epsMap = new Map<number, any>();

  for (const r of revRaw?.data ?? []) {
    const yr = n(r.year) ?? new Date(r.period).getFullYear();
    if (yr >= now - 1 && yr <= now + 5) revMap.set(yr, r);
  }
  for (const r of epsRaw?.data ?? []) {
    const yr = n(r.year) ?? new Date(r.period).getFullYear();
    if (yr >= now - 1 && yr <= now + 5) epsMap.set(yr, r);
  }

  const years = Array.from(new Set([...revMap.keys(), ...epsMap.keys()])).sort();
  const estimates: YearEstimate[] = years.map((yr) => {
    const rev = revMap.get(yr);
    const eps = epsMap.get(yr);
    return {
      year: yr,
      revenueAvg:  rev ? n(rev.revenueAvg)  !== null ? (n(rev.revenueAvg)!  / 1e9) : null : null,
      revenueHigh: rev ? n(rev.revenueHigh) !== null ? (n(rev.revenueHigh)! / 1e9) : null : null,
      revenueLow:  rev ? n(rev.revenueLow)  !== null ? (n(rev.revenueLow)!  / 1e9) : null : null,
      revenueGrowth: null,
      epsAvg:  eps ? n(eps.epsAvg)  : null,
      epsHigh: eps ? n(eps.epsHigh) : null,
      epsLow:  eps ? n(eps.epsLow)  : null,
      epsGrowth: null,
      analysts: Math.max(n(rev?.numberAnalysts) ?? 0, n(eps?.numberAnalysts) ?? 0),
    };
  });

  // Compute YoY growth
  for (let i = 1; i < estimates.length; i++) {
    const cur  = estimates[i];
    const prev = estimates[i - 1];
    if (cur.revenueAvg && prev.revenueAvg && prev.revenueAvg !== 0)
      cur.revenueGrowth = +((( cur.revenueAvg - prev.revenueAvg) / Math.abs(prev.revenueAvg)) * 100).toFixed(1);
    if (cur.epsAvg && prev.epsAvg && prev.epsAvg !== 0)
      cur.epsGrowth = +((( cur.epsAvg - prev.epsAvg) / Math.abs(prev.epsAvg)) * 100).toFixed(1);
  }

  return estimates;
}

/* ── Tooltip styles ─────────────────────────────────────── */
const TooltipStyle = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
  boxShadow: "0 4px 20px rgba(0,0,0,0.10)", padding: "10px 14px",
  fontFamily: "Heebo, sans-serif", fontSize: 13, direction: "rtl" as const,
};

/* ── Colors ─────────────────────────────────────────────── */
const BLUE   = "hsl(234,85%,52%)";
const GREEN  = "hsl(152,60%,38%)";
const PURPLE = "hsl(258,78%,58%)";
const AMBER  = "hsl(34,92%,48%)";

/* ── Component ──────────────────────────────────────────── */
export function GrowthForecast({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<YearEstimate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    fetchForecasts(ticker)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Separate past estimate (this year - 1) from forecasts
  const now = new Date().getFullYear();
  const actual   = data?.filter((d) => d.year < now)  ?? [];
  const forecast = data?.filter((d) => d.year >= now) ?? [];

  const revChartData = data?.map((d) => ({
    year: String(d.year),
    "הכנסות ($B)": d.revenueAvg ?? null,
    isForecast: d.year >= now,
  })) ?? [];

  const epsChartData = data?.map((d) => ({
    year: String(d.year),
    EPS: d.epsAvg ?? null,
    isForecast: d.year >= now,
  })) ?? [];

  const avgAnalysts = data?.length ? Math.round(data.reduce((s, d) => s + d.analysts, 0) / data.length) : 0;

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            תחזית צמיחה — {ticker}
            <span className="text-xs font-normal text-muted-foreground">קונצנזוס אנליסטים · Finnhub</span>
          </CardTitle>
          <button onClick={() => setCollapsed((v) => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {avgAnalysts > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            ממוצע {avgAnalysts} אנליסטים
          </div>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען תחזיות אנליסטים...
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive py-2">שגיאה: {error}</div>
          )}

          {data && !loading && (
            <>
              {/* Revenue chart */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">הכנסות צפויות ($B)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={revChartData} barCategoryGap="35%">
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}B`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [`$${v?.toFixed(1)}B`, "הכנסות"]} />
                    <Bar dataKey="הכנסות ($B)" radius={[5, 5, 0, 0]}>
                      {revChartData.map((d, i) => (
                        <Cell key={i} fill={d.isForecast ? BLUE : "hsl(234,85%,75%)"} fillOpacity={d.isForecast ? 1 : 0.6} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground justify-end">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "hsl(234,85%,75%)", opacity: 0.7 }} />היסטורי</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: BLUE }} />תחזית</span>
                </div>
              </div>

              {/* EPS chart */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">EPS צפוי ($)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={epsChartData} barCategoryGap="35%">
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [`$${v?.toFixed(2)}`, "EPS"]} />
                    <Bar dataKey="EPS" radius={[5, 5, 0, 0]}>
                      {epsChartData.map((d, i) => (
                        <Cell key={i} fill={d.isForecast ? PURPLE : "hsl(258,78%,78%)"} fillOpacity={d.isForecast ? 1 : 0.6} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border/50">
                      <th className="text-right py-2.5 px-3 font-semibold text-xs">שנה</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">הכנסות ($B)</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">צמיחה %</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">EPS</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">צמיחת EPS</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">אנליסטים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d) => {
                      const isFuture = d.year >= now;
                      return (
                        <tr key={d.year}
                          className={`border-b border-border/30 transition-colors hover:bg-primary/[0.02] ${isFuture ? "" : "opacity-70"}`}>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{d.year}</span>
                              {isFuture && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">תחזית</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="font-medium">{d.revenueAvg ? `$${d.revenueAvg.toFixed(1)}B` : "—"}</div>
                            {d.revenueLow && d.revenueHigh && (
                              <div className="text-[10px] text-muted-foreground">${d.revenueLow.toFixed(0)}B–${d.revenueHigh.toFixed(0)}B</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {d.revenueGrowth !== null ? (
                              <span className={`font-semibold ${d.revenueGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                                {d.revenueGrowth >= 0 ? "+" : ""}{d.revenueGrowth.toFixed(1)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="font-medium">{d.epsAvg ? `$${d.epsAvg.toFixed(2)}` : "—"}</div>
                            {d.epsLow && d.epsHigh && (
                              <div className="text-[10px] text-muted-foreground">${d.epsLow.toFixed(2)}–${d.epsHigh.toFixed(2)}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {d.epsGrowth !== null ? (
                              <span className={`font-semibold ${d.epsGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                                {d.epsGrowth >= 0 ? "+" : ""}{d.epsGrowth.toFixed(1)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${d.analysts >= 10 ? "bg-success/10 text-success" : d.analysts >= 5 ? "bg-amber-100 text-amber-700" : "bg-secondary text-muted-foreground"}`}>
                              {d.analysts > 0 ? d.analysts : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-muted-foreground">
                * תחזיות מבוססות על קונצנזוס אנליסטים מ-Finnhub. אינן מהוות המלצת השקעה.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
