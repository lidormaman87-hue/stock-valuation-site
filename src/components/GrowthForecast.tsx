/**
 * GrowthForecast — 5-year projection based on historical growth rates.
 * No additional API calls needed — uses already-fetched historical data.
 */
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { SeriesPoint } from "@/services/alphaVantageService";

/* ── Types ──────────────────────────────────────────────── */
interface HistoricalIncome {
  revenues: SeriesPoint[];
  netIncome: SeriesPoint[];
  eps: SeriesPoint[];
  grossProfit?: SeriesPoint[];
  operatingIncome?: SeriesPoint[];
}

interface Props {
  ticker: string;
  income: HistoricalIncome;
}

/* ── Helpers ────────────────────────────────────────────── */
const n = (v: number | null) => (v !== null && isFinite(v) ? v : null);

const avg = (arr: number[]) =>
  arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

/** Compute CAGR from a series of SeriesPoints */
const computeGrowthRate = (series: SeriesPoint[], years = 3): number | null => {
  const valid = series.filter((p) => p.value !== null && p.value !== 0);
  if (valid.length < 2) return null;
  const slice = valid.slice(-Math.min(years + 1, valid.length));
  const first = slice[0].value!;
  const last  = slice[slice.length - 1].value!;
  const yrs   = slice.length - 1;
  if (first <= 0 || yrs <= 0) return null;
  return Math.pow(last / first, 1 / yrs) - 1;
};

const fmtShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}T`;
  if (a >= 1)   return `$${v.toFixed(1)}B`;
  return `$${(v * 1000).toFixed(0)}M`;
};

const TooltipStyle = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
  boxShadow: "0 4px 20px rgba(0,0,0,0.10)", padding: "10px 14px",
  fontFamily: "Heebo, sans-serif", fontSize: 13, direction: "rtl" as const,
};

const BLUE   = "hsl(234,85%,52%)";
const PURPLE = "hsl(258,78%,58%)";
const LIGHT  = "hsl(234,85%,75%)";
const LIGHT2 = "hsl(258,78%,78%)";

/* ── Component ──────────────────────────────────────────── */
export function GrowthForecast({ ticker, income }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const projection = useMemo(() => {
    const revGrowth = computeGrowthRate(income.revenues, 3);
    const epsGrowth = computeGrowthRate(income.eps,      3);

    const lastRev = income.revenues.filter((p) => p.value !== null).at(-1);
    const lastEPS = income.eps.filter((p)      => p.value !== null).at(-1);

    if (!lastRev?.value) return null;

    const now  = new Date().getFullYear();
    const rg   = revGrowth ?? 0.08;
    const eg   = epsGrowth ?? 0.10;

    const rows = [];

    // Last known year (base)
    rows.push({
      year: lastRev.date ?? String(now - 1),
      rev:  +(lastRev.value).toFixed(2),
      eps:  lastEPS?.value != null ? +(lastEPS.value).toFixed(2) : null,
      revGrowth: null as number | null,
      epsGrowth: null as number | null,
      isForecast: false,
    });

    // 5 projected years
    for (let i = 1; i <= 5; i++) {
      const prevRev = rows[rows.length - 1].rev;
      const prevEPS = rows[rows.length - 1].eps;
      const projRev = +(prevRev * (1 + rg)).toFixed(2);
      const projEPS = prevEPS !== null ? +(prevEPS * (1 + eg)).toFixed(2) : null;

      rows.push({
        year: String(Number(lastRev.date ?? now) + i),
        rev:  projRev,
        eps:  projEPS,
        revGrowth: +((rg * 100).toFixed(1)),
        epsGrowth: +((eg * 100).toFixed(1)),
        isForecast: true,
      });
    }

    return { rows, rg, eg };
  }, [income]);

  if (!projection) return null;

  const { rows, rg, eg } = projection;

  const revChart = rows.map((r) => ({ year: r.year, "הכנסות ($B)": r.rev, isForecast: r.isForecast }));
  const epsChart = rows.map((r) => ({ year: r.year, EPS: r.eps,            isForecast: r.isForecast }));

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            תחזית צמיחה 5 שנים — {ticker}
          </CardTitle>
          <button onClick={() => setCollapsed((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
          <span>📈 צמיחת הכנסות הנחה: <strong className="text-foreground">{(rg * 100).toFixed(1)}%</strong>/שנה</span>
          <span>📊 צמיחת EPS הנחה: <strong className="text-foreground">{(eg * 100).toFixed(1)}%</strong>/שנה</span>
          <span className="text-[10px]">(לפי CAGR 3 שנים אחרונות)</span>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-5">
          {/* Revenue chart */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">הכנסות צפויות ($B)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={revChart} barCategoryGap="35%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [fmtShort(v), "הכנסות"]} />
                <Bar dataKey="הכנסות ($B)" radius={[5, 5, 0, 0]}>
                  {revChart.map((d, i) => (
                    <Cell key={i} fill={d.isForecast ? BLUE : LIGHT} fillOpacity={d.isForecast ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* EPS chart */}
          {rows.some((r) => r.eps !== null) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">EPS צפוי ($)</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={epsChart} barCategoryGap="35%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [`$${v?.toFixed(2)}`, "EPS"]} />
                  <Bar dataKey="EPS" radius={[5, 5, 0, 0]}>
                    {epsChart.map((d, i) => (
                      <Cell key={i} fill={d.isForecast ? PURPLE : LIGHT2} fillOpacity={d.isForecast ? 1 : 0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 border-b border-border/50">
                  <th className="text-right py-2.5 px-3 font-semibold text-xs">שנה</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-xs">הכנסות</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-xs">צמיחה %</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-xs">EPS</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-xs">צמיחת EPS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year}
                    className={`border-b border-border/30 hover:bg-primary/[0.02] transition-colors ${!r.isForecast ? "opacity-70" : ""}`}>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{r.year}</span>
                        {r.isForecast
                          ? <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">תחזית</span>
                          : <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">בסיס</span>
                        }
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium">{fmtShort(r.rev)}</td>
                    <td className="py-2.5 px-3 text-center">
                      {r.revGrowth !== null
                        ? <span className="font-semibold text-success">+{r.revGrowth.toFixed(1)}%</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium">
                      {r.eps !== null ? `$${r.eps.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {r.epsGrowth !== null
                        ? <span className="font-semibold text-success">+{r.epsGrowth.toFixed(1)}%</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-foreground">
            * התחזית מבוססת על ממוצע קצב הצמיחה של 3 השנים האחרונות. אינה מהווה המלצת השקעה.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
