/**
 * FinancialDashboardSection
 * Renders Income / Balance / Cash-Flow charts in a single scrollable page,
 * matching the reference design: grouped bars, section headers, legends, expand modal.
 */
import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
  ComposedChart,
} from "recharts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";
import type { HistoricalData, SeriesPoint } from "@/services/alphaVantageService";

// ── Colors ────────────────────────────────────────────────
const C = {
  red:    "#e03535",
  orange: "#e06820",
  green:  "#22a06b",
  blue:   "#3d5fe8",
  purple: "#7c3aed",
  amber:  "#d97706",
  teal:   "#0d9488",
};

// ── Helpers ───────────────────────────────────────────────
const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};

const TooltipStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
  padding: "10px 14px",
  fontFamily: "Heebo, sans-serif",
  fontSize: 13,
  direction: "rtl" as const,
};

// Merge multiple SeriesPoint[] arrays by date into one record array
const merge = (keys: string[], series: SeriesPoint[][]): Record<string, any>[] => {
  const dateSet = new Set<string>();
  series.forEach((s) => s.forEach((p) => dateSet.add(p.date)));
  return Array.from(dateSet).sort().map((date) => {
    const row: Record<string, any> = { date };
    keys.forEach((k, i) => {
      const pt = series[i].find((p) => p.date === date);
      row[k] = pt?.value ?? null;
    });
    return row;
  });
};

// ── Expand button ─────────────────────────────────────────
const ExpandBtn = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground"
    title="הרחב"
  >
    <Maximize2 className="h-3.5 w-3.5" />
  </button>
);

// ── Single-series bar chart card ─────────────────────────
interface SimpleChartProps {
  title: string;
  data: SeriesPoint[];
  color: string;
  formatter?: (v: number) => string;
  pct?: boolean;
}

const SimpleChart = ({ title, data, color, formatter, pct }: SimpleChartProps) => {
  const [expanded, setExpanded] = useState(false);
  const fmt = formatter ?? (pct ? (v: number) => `${v?.toFixed(1)}%` : fmtShort);
  const valid = data.filter((p) => p.value !== null);
  const hasData = valid.length > 0;

  const chart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={valid} barCategoryGap="35%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={pct ? 45 : 55} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [fmt(v), title]} />
        {pct && <ReferenceLine y={0} stroke="#d1d5db" />}
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} name={title} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <div className="card-elegant p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <ExpandBtn onClick={() => setExpanded(true)} />
        </div>
        {hasData ? chart(180) : (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>
        )}
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl">
          <h2 className="text-base font-bold mb-4">{title}</h2>
          {hasData ? chart(360) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Multi-series grouped bar chart card ──────────────────
interface GroupedChartProps {
  title: string;
  subtitle?: string;
  data: Record<string, any>[];
  series: { key: string; label: string; color: string }[];
  formatter?: (v: number) => string;
}

const GroupedChart = ({ title, subtitle, data, series, formatter }: GroupedChartProps) => {
  const [expanded, setExpanded] = useState(false);
  const fmt = formatter ?? fmtShort;

  const chart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap="25%" barGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number, name: string) => [fmt(v), name]} />
        <Legend
          wrapperStyle={{ fontSize: 12, fontFamily: "Heebo", paddingTop: 12 }}
          iconType="circle"
          iconSize={8}
        />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <div className="card-elegant p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <ExpandBtn onClick={() => setExpanded(true)} />
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>}
        {data.length > 0 ? chart(220) : (
          <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>
        )}
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl">
          <h2 className="text-base font-bold mb-1">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
          {data.length > 0 ? chart(420) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Section header ────────────────────────────────────────
const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="mb-4">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
  </div>
);

// ── Revenue card with toggle ($ value / % growth) ────────
const RevenueGrowthChart = ({ revenues }: { revenues: SeriesPoint[] }) => {
  const [view, setView]     = useState<"abs" | "pct">("abs");
  const [expanded, setExpanded] = useState(false);

  const valid = revenues.filter((p) => p.value !== null);
  const growthData = valid.map((p, i, arr) => {
    const prev = arr[i - 1]?.value;
    const pct  = prev && prev !== 0 && p.value !== null
      ? +((( p.value - prev) / Math.abs(prev)) * 100).toFixed(1)
      : null;
    return { date: p.date, "גידול %": pct };
  });

  const growthVals = growthData.map((d) => d["גידול %"] ?? 0).filter(Boolean) as number[];
  const avgGrowth  = avg(growthVals);

  const Toggle = () => (
    <div className="flex items-center gap-1 rounded-lg bg-secondary/70 p-0.5">
      {(["abs", "pct"] as const).map((v) => (
        <button key={v} onClick={() => setView(v)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
            view === v ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          {v === "abs" ? "ערך ($)" : "% גידול"}
        </button>
      ))}
    </div>
  );

  const absChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={valid} barCategoryGap="35%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [fmtShort(v), "הכנסות"]} />
        <Bar dataKey="value" name="הכנסות" fill={C.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const pctChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={growthData} barCategoryGap="35%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [`${v?.toFixed(1)}%`, "גידול YoY"]} />
        <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
        {avgGrowth !== 0 && <ReferenceLine y={avgGrowth} stroke={C.amber} strokeDasharray="5 3" strokeWidth={1.5}
          label={{ value: `ממוצע ${avgGrowth.toFixed(1)}%`, position: "insideTopRight", fontSize: 10, fill: C.amber }} />}
        <Bar dataKey="גידול %" fill={C.amber} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <div className="card-elegant p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Total Revenues</h3>
          <ExpandBtn onClick={() => setExpanded(true)} />
        </div>
        <div className="mb-3"><Toggle /></div>
        {view === "abs"
          ? (valid.length > 0        ? absChart(180) : <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>)
          : (growthData.length > 0   ? pctChart(180) : <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>)
        }
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">Total Revenues</h2>
            <Toggle />
          </div>
          {view === "abs" ? absChart(360) : pctChart(360)}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Shared margin helpers ─────────────────────────────────
const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
const stddev = (arr: number[]) => {
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};
const stabLabel = (cv: number) =>
  cv < 5  ? { label: "יציב מאוד", color: C.green } :
  cv < 15 ? { label: "יציב",      color: C.teal  } :
  cv < 30 ? { label: "תנודתי",    color: C.amber } :
            { label: "לא יציב",   color: C.red   };

// ── Single margin card with view toggle ──────────────────
interface MarginCardProps {
  title: string;
  color: string;
  marginData: { date: string; pct: number | null }[];   // % over time
  absoluteData: SeriesPoint[];                           // dollar values
}

const MarginCard = ({ title, color, marginData, absoluteData }: MarginCardProps) => {
  const [view, setView]     = useState<"pct" | "abs">("pct");
  const [expanded, setExpanded] = useState(false);

  const validPct = marginData.filter((d) => d.pct !== null);
  const vals     = validPct.map((d) => d.pct as number);
  const avgVal   = avg(vals);
  const cv       = avgVal !== 0 ? (stddev(vals) / Math.abs(avgVal)) * 100 : 100;
  const { label: stabText, color: stabColor } = stabLabel(cv);

  const Toggle = () => (
    <div className="flex items-center gap-1 rounded-lg bg-secondary/70 p-0.5">
      {(["pct", "abs"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
            view === v
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {v === "pct" ? "% שולי" : "ערך ($)"}
        </button>
      ))}
    </div>
  );

  const pctChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={validPct} barCategoryGap="35%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [`${v?.toFixed(1)}%`, title]} />
        {avgVal > 0 && <ReferenceLine y={avgVal} stroke={color} strokeDasharray="5 3" strokeWidth={1.5}
          label={{ value: `ממוצע ${avgVal.toFixed(1)}%`, position: "insideTopRight", fontSize: 10, fill: color }} />}
        <Bar dataKey="pct" name={title} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const absValid = absoluteData.filter((p) => p.value !== null);
  const absChart = (height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={absValid} barCategoryGap="35%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
        <Tooltip contentStyle={TooltipStyle} formatter={(v: number) => [fmtShort(v), title]} />
        <Bar dataKey="value" name={title} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <div className="card-elegant p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <div className="flex items-center gap-1.5">
            <ExpandBtn onClick={() => setExpanded(true)} />
          </div>
        </div>

        {/* Toggle + stability */}
        <div className="flex items-center justify-between mb-3">
          <Toggle />
          {view === "pct" && vals.length > 1 && (
            <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
              style={{ background: stabColor + "20", color: stabColor }}>
              {stabText}
            </span>
          )}
        </div>

        {view === "pct"
          ? (validPct.length > 0 ? pctChart(180) : <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>)
          : (absValid.length  > 0 ? absChart(180) : <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>)
        }
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">{title}</h2>
            <Toggle />
          </div>
          {view === "pct" ? pctChart(360) : absChart(360)}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Range filter helper ───────────────────────────────────
type Range  = "1Y" | "3Y" | "5Y" | "ALL";
type Period = "annual" | "quarterly";

const filterByRange = (series: SeriesPoint[], range: Range): SeriesPoint[] => {
  if (range === "ALL") return series;
  const n = range === "1Y" ? 1 : range === "3Y" ? 3 : 5;
  return series.slice(-n);
};

const filterRecord = (data: Record<string, any>[], range: Range): Record<string, any>[] => {
  if (range === "ALL") return data;
  const n = range === "1Y" ? 1 : range === "3Y" ? 3 : 5;
  return data.slice(-n);
};

// ── Controls bar ──────────────────────────────────────────
const ControlsBar = ({
  range, setRange, period, setPeriod, onPeriodChange,
}: {
  range: Range; setRange: (r: Range) => void;
  period: Period; setPeriod: (p: Period) => void;
  onPeriodChange: (p: Period) => void;
}) => (
  <div className="flex flex-wrap items-center gap-3 mb-6 p-3 card-elegant">
    {/* Period */}
    <div className="flex items-center gap-1 rounded-lg bg-secondary/70 p-0.5">
      {(["annual", "quarterly"] as Period[]).map((p) => (
        <button key={p} onClick={() => { setPeriod(p); onPeriodChange(p); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
            period === p ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          {p === "annual" ? "שנתי" : "רבעוני"}
        </button>
      ))}
    </div>

    <div className="w-px h-5 bg-border/60" />

    {/* Range */}
    <div className="flex items-center gap-1 rounded-lg bg-secondary/70 p-0.5">
      {(["1Y", "3Y", "5Y", "ALL"] as Range[]).map((r) => (
        <button key={r} onClick={() => setRange(r)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
            range === r ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          {r === "ALL" ? "הכל" : r}
        </button>
      ))}
    </div>

    <span className="text-xs text-muted-foreground mr-auto">
      {period === "quarterly" ? "תצוגה רבעונית" : "תצוגה שנתית"} · {range === "ALL" ? "כל ההיסטוריה" : `${range} אחרונות`}
    </span>
  </div>
);

// ── Main component ────────────────────────────────────────
export function FinancialDashboardSection({
  data,
  onPeriodChange,
}: {
  data: HistoricalData;
  onPeriodChange?: (p: Period) => void;
}) {
  const [range,  setRange]  = useState<Range>("ALL");
  const [period, setPeriod] = useState<Period>("annual");

  const f = (s: SeriesPoint[]) => filterByRange(s, range);

  // Apply range filter to all series
  const income  = {
    revenues:        f(data.income.revenues),
    grossProfit:     f(data.income.grossProfit),
    operatingIncome: f(data.income.operatingIncome),
    netIncome:       f(data.income.netIncome),
    eps:             f(data.income.eps),
    sharesDiluted:   f(data.income.sharesDiluted),
    dividendsPerShare: f(data.income.dividendsPerShare),
    rule40:          f(data.income.rule40),
  };

  const balance = {
    totalAssets:             f(data.balance.totalAssets),
    totalLiabilities:        f(data.balance.totalLiabilities),
    totalEquity:             f(data.balance.totalEquity),
    totalDebt:               f(data.balance.totalDebt),
    cashAndShortTerm:        f(data.balance.cashAndShortTerm),
    totalCurrentAssets:      f(data.balance.totalCurrentAssets),
    totalCurrentLiabilities: f(data.balance.totalCurrentLiabilities),
  };

  const cashflow = {
    operatingCashFlow:      f(data.cashflow.operatingCashFlow),
    freeCashFlow:           f(data.cashflow.freeCashFlow),
    capitalExpenditures:    f(data.cashflow.capitalExpenditures),
    stockBasedCompensation: f(data.cashflow.stockBasedCompensation),
    netIncome:              f(data.cashflow.netIncome),
  };

  // Balance grouped data
  const shortTermData = merge(
    ["מזומן", "נכסים שוטפים", "התחייבויות שוטפות"],
    [balance.cashAndShortTerm, balance.totalCurrentAssets, balance.totalCurrentLiabilities],
  );

  const structureData = merge(
    ["סך נכסים", "סך התחייבויות", "הון עצמי"],
    [balance.totalAssets, balance.totalLiabilities, balance.totalEquity],
  );

  const debtLiqData = merge(
    ["סך חוב", "מזומן"],
    [balance.totalDebt, balance.cashAndShortTerm],
  );

  // Cash flow grouped data
  const cfBreakdownData = merge(
    ["תזרים תפעולי", "תזרים חופשי", "פיצוי מבוסס מניות", "הוצאות הון"],
    [cashflow.operatingCashFlow, cashflow.freeCashFlow, cashflow.stockBasedCompensation, cashflow.capitalExpenditures],
  );

  const ocfVsNiData = merge(
    ["תזרים תפעולי", "רווח נקי"],
    [cashflow.operatingCashFlow, cashflow.netIncome],
  );

  return (
    <div className="space-y-10">
      <ControlsBar
        range={range} setRange={setRange}
        period={period} setPeriod={setPeriod}
        onPeriodChange={(p) => onPeriodChange?.(p)}
      />
      {/* ── Income Statement ── */}
      <section>
        <SectionHeader
          title="Income Statement Analysis"
          subtitle="Revenue, profitability, and share statistics over time"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <RevenueGrowthChart revenues={income.revenues} />
          <SimpleChart title="Earnings Per Share"      data={income.eps}             color={C.green}  formatter={(v) => `$${v?.toFixed(2)}`} />
          <SimpleChart title="Shares Outstanding"      data={income.sharesDiluted}   color={C.blue}   />
          <SimpleChart title="Rule of 40"              data={income.rule40}          color={C.blue}   pct />
          <SimpleChart title="Dividends Per Share" data={income.dividendsPerShare} color={C.blue} formatter={(v) => `$${v?.toFixed(2)}`} />

          {/* Margin cards — each with % / $ toggle */}
          {(() => {
            const dates = income.revenues.map((p) => p.date);
            const getVal = (s: SeriesPoint[], d: string) => s.find((p) => p.date === d)?.value ?? null;
            const margins = dates.map((date) => {
              const rev = getVal(income.revenues, date);
              const gp  = getVal(income.grossProfit, date);
              const op  = getVal(income.operatingIncome, date);
              const ni  = getVal(income.netIncome, date);
              return {
                date,
                gross: rev && gp != null ? +((gp / rev) * 100).toFixed(1) : null,
                op:    rev && op != null ? +((op / rev) * 100).toFixed(1) : null,
                net:   rev && ni != null ? +((ni / rev) * 100).toFixed(1) : null,
              };
            });
            return (
              <>
                <MarginCard
                  title="Gross Margin — שולי גולמי"
                  color={C.orange}
                  marginData={margins.map((d) => ({ date: d.date, pct: d.gross }))}
                  absoluteData={income.grossProfit}
                />
                <MarginCard
                  title="Operating Margin — שולי תפעולי"
                  color={C.blue}
                  marginData={margins.map((d) => ({ date: d.date, pct: d.op }))}
                  absoluteData={income.operatingIncome}
                />
                <MarginCard
                  title="Net Margin — שולי נקי"
                  color={C.purple}
                  marginData={margins.map((d) => ({ date: d.date, pct: d.net }))}
                  absoluteData={income.netIncome}
                />
              </>
            );
          })()}
        </div>
      </section>

      {/* ── Balance Sheet ── */}
      <section>
        <SectionHeader
          title="Balance Sheet Analysis"
          subtitle="Financial position breakdown - assets, liabilities, and equity structure"
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <GroupedChart
            title="Short-term Position"
            subtitle="Shows liquidity and short-term solvency over time"
            data={shortTermData}
            series={[
              { key: "מזומן",               label: "Cash & Short-Term",          color: C.green },
              { key: "נכסים שוטפים",        label: "Total Current Assets",       color: C.blue  },
              { key: "התחייבויות שוטפות",   label: "Total Current Liabilities",  color: C.red   },
            ]}
          />
          <GroupedChart
            title="Total Structure"
            subtitle="Balance sheet strength and debt vs. equity structure"
            data={structureData}
            series={[
              { key: "סך נכסים",        label: "Total Assets",       color: C.blue  },
              { key: "סך התחייבויות",   label: "Total Liabilities",  color: C.red   },
              { key: "הון עצמי",        label: "Total Equity",       color: C.green },
            ]}
          />
          <GroupedChart
            title="Debt vs Liquidity"
            subtitle="Liquidity vs. debt - company's ability to cover debts"
            data={debtLiqData}
            series={[
              { key: "סך חוב", label: "Total Debt",              color: C.red   },
              { key: "מזומן",  label: "Cash & Short-Term Inv.",  color: C.green },
            ]}
          />
        </div>
      </section>

      {/* ── Cash Flow ── */}
      <section>
        <SectionHeader
          title="Cash Flow Analysis"
          subtitle="Cash generation, capital efficiency, and earnings quality assessment"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GroupedChart
            title="Cash Flow Breakdown"
            subtitle="Complete breakdown of cash generation and usage"
            data={cfBreakdownData}
            series={[
              { key: "תזרים תפעולי",         label: "Operating Cash Flow",        color: C.blue   },
              { key: "תזרים חופשי",          label: "Free Cash Flow",             color: C.green  },
              { key: "פיצוי מבוסס מניות",    label: "Stock-Based Compensation",   color: C.amber  },
              { key: "הוצאות הון",           label: "Capital Expenditures",       color: C.red    },
            ]}
          />
          <GroupedChart
            title="OCF vs Net Income"
            subtitle="Earnings quality assessment - spots discrepancies between reported earnings and actual cash flow"
            data={ocfVsNiData}
            series={[
              { key: "תזרים תפעולי", label: "Operating Cash Flow", color: C.blue  },
              { key: "רווח נקי",    label: "Net Income",          color: C.green },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
