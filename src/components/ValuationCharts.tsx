import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ValuationResults, ValuationInputs } from "@/lib/valuation";

interface Props {
  results: ValuationResults;
  inputs: ValuationInputs;
}

// Shared chart colors — rich palette
const BLUE        = "hsl(234, 85%, 52%)";
const BLUE_LIGHT  = "hsl(234, 85%, 70%)";
const GREEN       = "hsl(152, 60%, 38%)";
const AMBER       = "hsl(34, 92%, 48%)";
const PURPLE      = "hsl(258, 78%, 58%)";


// Custom tooltip wrapper style
const TooltipStyle = {
  background: "hsl(0,0%,100%)",
  border: "1px solid hsl(214,20%,90%)",
  borderRadius: 12,
  boxShadow: "0 8px 28px -6px hsl(215 40% 20% / 0.11)",
  padding: "10px 14px",
  fontFamily: "Heebo, system-ui, sans-serif",
  fontSize: 13,
  direction: "rtl" as const,
};

/* ── Revenue & Net Income ───────────────────────────────── */
function RevenueChart({ results }: { results: ValuationResults }) {
  const data = results.revenueTable.map((r) => ({
    year: r.year.toString(),
    הכנסות: +r.revenue.toFixed(2),
    "רווח נקי": +r.netIncome.toFixed(2),
  }));

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">תחזית הכנסות ורווח נקי</CardTitle>
        <p className="text-xs text-muted-foreground">במיליארדים ($)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barGap={4} barCategoryGap="30%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${v}B`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip
              contentStyle={TooltipStyle}
              formatter={(v: number, name: string) => [`$${v.toFixed(1)}B`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Heebo", paddingTop: 8 }} />
            <Bar dataKey="הכנסות" fill={BLUE} radius={[6, 6, 0, 0]} />
            <Bar dataKey="רווח נקי" fill={GREEN} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ── EPS Growth ─────────────────────────────────────────── */
function EpsChart({ results }: { results: ValuationResults }) {
  const data = results.epsTable.map((r) => ({
    year: r.year.toString(),
    EPS: +r.eps.toFixed(3),
  }));

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">צמיחת EPS לאורך השנים</CardTitle>
        <p className="text-xs text-muted-foreground">רווח למניה ($)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={TooltipStyle}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "EPS"]}
            />
            <Line
              type="monotone"
              dataKey="EPS"
              stroke={BLUE}
              strokeWidth={2.5}
              dot={{ fill: BLUE, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: BLUE }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ── Scenarios PV comparison ────────────────────────────── */
function ScenariosChart({ results, inputs }: { results: ValuationResults; inputs: ValuationInputs }) {
  const scenarioColors = [BLUE_LIGHT, BLUE, PURPLE];
  const data = results.scenarios.map((s, i) => ({
    name: s.label,
    "שווי הוגן (PV)": +s.pv.toFixed(2),
    color: scenarioColors[i] ?? BLUE,
  }));

  // Add avg + market price reference
  const marketPrice = inputs.marketSharePrice;
  const avgAll = results.avgAll;

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">השוואת תרחישים — שווי הוגן (PV)</CardTitle>
        <p className="text-xs text-muted-foreground">מחיר מהוון להיום לפי תרחיש ($)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barCategoryGap="40%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={TooltipStyle}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "שווי הוגן"]}
            />
            <ReferenceLine y={marketPrice} stroke={AMBER} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `שוק $${marketPrice.toFixed(0)}`, position: "insideTopRight", fontSize: 11, fontFamily: "Heebo", fill: AMBER }} />
            <ReferenceLine y={avgAll} stroke={GREEN} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `AVG $${avgAll.toFixed(0)}`, position: "insideBottomRight", fontSize: 11, fontFamily: "Heebo", fill: GREEN }} />
            <Bar dataKey="שווי הוגן (PV)" radius={[7, 7, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground justify-end">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: AMBER }} />
            מחיר שוק
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: GREEN }} />
            AVG all
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Graham Values ──────────────────────────────────────── */
function GrahamChart({ results }: { results: ValuationResults }) {
  const data = results.grahamTable.map((r) => ({
    name: `${r.growth}% צמיחה`,
    "ערך גרהם": +r.value.toFixed(2),
  }));

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">ערכי גרהם לפי תרחיש צמיחה</CardTitle>
        <p className="text-xs text-muted-foreground">שווי הוגן לפי נוסחת גרהם ($)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barCategoryGap="45%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={TooltipStyle}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "ערך גרהם"]}
            />
            <ReferenceLine y={results.grahamAverage} stroke={GREEN} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `ממוצע $${results.grahamAverage.toFixed(0)}`, position: "insideTopRight", fontSize: 11, fontFamily: "Heebo", fill: GREEN }} />
            <Bar dataKey="ערך גרהם" fill={PURPLE} radius={[7, 7, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ── Main export ────────────────────────────────────────── */
export function ValuationCharts({ results, inputs }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <RevenueChart results={results} />
        <EpsChart results={results} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ScenariosChart results={results} inputs={inputs} />
        <GrahamChart results={results} />
      </div>
    </div>
  );
}
