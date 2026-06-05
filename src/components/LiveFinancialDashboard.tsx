import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ComposedChart,
} from "recharts";
import { fetchHistoricalData, type HistoricalData, getApiKey, setApiKey, clearCache } from "@/services/alphaVantageService";
import { toast } from "sonner";

interface SeriesPoint { date: string; value: number | null }


const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
};

const fmtDate = (d: string) => {
  if (!d) return "";
  // year only if it's a full date
  const m = d.match(/^(\d{4})/);
  return m ? m[1] : d;
};

const ChartCard = ({
  title,
  data,
  variant = "line",
  color = "hsl(var(--accent))",
}: {
  title: string;
  data: SeriesPoint[];
  variant?: "line" | "bar";
  color?: string;
}) => {
  const valid = data?.filter((p) => p.value !== null) ?? [];
  const hasData = valid.length > 0;

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            {variant === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
                <YAxis tickFormatter={(v) => fmtShort(v as number)} fontSize={11} width={50} />
                <Tooltip
                  formatter={(v) => fmtShort(v as number)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
                <YAxis tickFormatter={(v) => fmtShort(v as number)} fontSize={11} width={50} />
                <Tooltip
                  formatter={(v) => fmtShort(v as number)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            אין נתון זמין
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Margins & Revenue helpers ──────────────────────────────

const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

const TooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  boxShadow: "0 8px 28px -6px hsl(215 40% 20% / 0.11)",
  padding: "10px 14px",
  fontFamily: "Heebo, system-ui, sans-serif",
  fontSize: 13,
  direction: "rtl" as const,
};

const MarginsSection = ({ income }: { income: { revenues: SeriesPoint[]; grossProfit: SeriesPoint[]; operatingIncome: SeriesPoint[]; netIncome: SeriesPoint[]; eps: SeriesPoint[] } }) => {
  const revenues   = income["revenues"]        ?? [];
  const gross      = income["grossProfit"]     ?? [];
  const operating  = income["operatingIncome"] ?? [];
  const net        = income["netIncome"]       ?? [];

  // Build combined margin series aligned by date
  const dates = revenues.map((p) => p.date);

  const getVal = (series: SeriesPoint[], date: string) =>
    series.find((p) => p.date === date)?.value ?? null;

  const marginData = dates.map((date) => {
    const rev  = getVal(revenues, date);
    const gp   = getVal(gross, date);
    const op   = getVal(operating, date);
    const ni   = getVal(net, date);
    return {
      date,
      "שולי גולמי":    rev && gp   != null ? +((gp  / rev) * 100).toFixed(2) : null,
      "שולי תפעולי":   rev && op   != null ? +((op  / rev) * 100).toFixed(2) : null,
      "שולי נקי":      rev && ni   != null ? +((ni  / rev) * 100).toFixed(2) : null,
    };
  }).filter((d) => d["שולי גולמי"] !== null || d["שולי תפעולי"] !== null || d["שולי נקי"] !== null);

  const avgGross  = avg(marginData.map((d) => d["שולי גולמי"]  ?? 0).filter((v) => v !== 0));
  const avgOp     = avg(marginData.map((d) => d["שולי תפעולי"] ?? 0).filter((v) => v !== 0));
  const avgNet    = avg(marginData.map((d) => d["שולי נקי"]    ?? 0).filter((v) => v !== 0));

  // Revenue + YoY growth
  const revData = revenues
    .filter((p) => p.value !== null)
    .map((p, i, arr) => {
      const prev = arr[i - 1]?.value;
      const growth = prev && prev !== 0
        ? +((((p.value as number) - prev) / Math.abs(prev)) * 100).toFixed(1)
        : null;
      return { date: p.date, הכנסות: p.value as number, "גידול %": growth };
    });

  const hasMargins = marginData.length > 0;
  const hasRevenue = revData.length > 0;

  return (
    <div className="space-y-4">
      {/* Combined margins chart */}
      <Card className="card-elegant">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">שולי רווח — גולמי, תפעולי ונקי</CardTitle>
          <p className="text-xs text-muted-foreground">קווים מקווקוים = ממוצע לכל שוליים</p>
        </CardHeader>
        <CardContent>
          {hasMargins ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={marginData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={TooltipStyle}
                  formatter={(v: number, name: string) => [`${v?.toFixed(1)}%`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Heebo", paddingTop: 8 }} />

                {/* Avg reference lines */}
                {avgGross  !== null && <ReferenceLine y={avgGross}  stroke="hsl(168,65%,44%)"  strokeDasharray="5 3" strokeWidth={1.5} />}
                {avgOp     !== null && <ReferenceLine y={avgOp}     stroke="hsl(221,83%,50%)"  strokeDasharray="5 3" strokeWidth={1.5} />}
                {avgNet    !== null && <ReferenceLine y={avgNet}     stroke="hsl(255,70%,58%)"  strokeDasharray="5 3" strokeWidth={1.5} />}

                <Line type="monotone" dataKey="שולי גולמי"   stroke="hsl(168,65%,44%)"  strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
                <Line type="monotone" dataKey="שולי תפעולי"  stroke="hsl(221,83%,50%)"  strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
                <Line type="monotone" dataKey="שולי נקי"     stroke="hsl(255,70%,58%)"  strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              אין נתוני הכנסות/רווח זמינים
            </div>
          )}
        </CardContent>
      </Card>

      {/* Margin averages summary */}
      {hasMargins && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "ממוצע שולי גולמי",   val: avgGross,  color: "hsl(168,65%,44%)" },
            { label: "ממוצע שולי תפעולי",  val: avgOp,     color: "hsl(221,83%,50%)" },
            { label: "ממוצע שולי נקי",     val: avgNet,    color: "hsl(255,70%,58%)" },
          ].map(({ label, val, color }) => (
            <Card key={label} className="card-elegant">
              <CardContent className="py-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-muted-foreground font-medium">{label}</span>
                </div>
                <div className="text-2xl font-bold" style={{ color }}>
                  {val !== null ? `${val.toFixed(1)}%` : "—"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Revenue + Growth */}
      <Card className="card-elegant">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">הכנסות ושיעור גידול שנתי</CardTitle>
          <p className="text-xs text-muted-foreground">עמודות = הכנסות · קו = גידול YoY (%)</p>
        </CardHeader>
        <CardContent>
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={revData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fontFamily: "Heebo" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="rev"
                  tickFormatter={fmtShort}
                  tick={{ fontSize: 11, fontFamily: "Heebo" }}
                  axisLine={false} tickLine={false} width={55}
                />
                <YAxis
                  yAxisId="growth"
                  orientation="left"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fontFamily: "Heebo" }}
                  axisLine={false} tickLine={false} width={40}
                  hide
                />
                <Tooltip
                  contentStyle={TooltipStyle}
                  formatter={(v: number, name: string) =>
                    name === "גידול %" ? [`${v?.toFixed(1)}%`, name] : [fmtShort(v), name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Heebo", paddingTop: 8 }} />
                <ReferenceLine yAxisId="growth" y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                <Bar yAxisId="rev" dataKey="הכנסות" fill="hsl(221,83%,60%)" radius={[6, 6, 0, 0]} opacity={0.85} />
                <Line yAxisId="growth" type="monotone" dataKey="גידול %" stroke="hsl(32,95%,50%)" strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(32,95%,50%)", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              אין נתוני הכנסות זמינים
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface Props { initialTicker?: string }

export const LiveFinancialDashboard = ({ initialTicker = "AAPL" }: Props) => {
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const [data, setData] = useState<HistoricalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKeyState] = useState(getApiKey);
  const [showKeyInput, setShowKeyInput] = useState(!getApiKey());

  const handleSaveKey = () => {
    setApiKey(apiKey.trim());
    setShowKeyInput(false);
    toast.success("מפתח API נשמר");
  };

  const fetchData = async () => {
    if (!ticker.trim()) { toast.error("יש להזין טיקר"); return; }
    if (!getApiKey())   { toast.error("הזן מפתח Alpha Vantage תחילה"); setShowKeyInput(true); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchHistoricalData(ticker.trim().toUpperCase(), period);
      setData(resp);
      toast.success(`נתונים נטענו עבור ${ticker.toUpperCase()}`);
    } catch (e) {
      const msg = (e as Error).message || "שגיאה בטעינת נתונים";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="card-elegant">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <Label className="text-sm font-medium">טיקר מניה</Label>
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && !loading && fetchData()}
                placeholder="AAPL, MSFT..."
                className="text-right"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">תקופה</Label>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as "annual" | "quarterly")}
                className="justify-start"
              >
                <ToggleGroupItem value="annual">שנתי</ToggleGroupItem>
                <ToggleGroupItem value="quarterly">רבעוני</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Button onClick={fetchData} disabled={loading} className="rounded-xl" style={{ background: "var(--gradient-primary)" }}>
              {loading ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> טוען...</>
              ) : (
                <><RefreshCw className="h-4 w-4 ml-2" /> טען / רענן</>
              )}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setShowKeyInput((v) => !v)}>
              🔑 API Key
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => { clearCache(); toast.info("המטמון נוקה — הנתונים יורדו מחדש"); }}>
              🗑 נקה מטמון
            </Button>
          </div>

          {showKeyInput && (
            <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px] space-y-1">
                <Label className="text-xs font-medium">מפתח Alpha Vantage (חינמי)</Label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                  placeholder="הדבק את המפתח כאן..."
                  className="text-left font-mono text-sm"
                  dir="ltr"
                />
              </div>
              <Button size="sm" className="rounded-xl" onClick={handleSaveKey}>שמור מפתח</Button>
              <button className="text-xs text-muted-foreground underline" onClick={() => setShowKeyInput(false)}>ביטול</button>
            </div>
          )}

          {data && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">מקור: Alpha Vantage</Badge>
              {data.companyName && <span>{data.companyName}</span>}
              {data.missing?.length > 0 && (
                <Badge variant="outline" className="border-warning text-warning">
                  {data.missing.length} מדדים חסרים
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="card-elegant border-destructive/50">
          <CardContent className="py-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="card-elegant">
              <CardContent className="h-[260px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <Tabs defaultValue="margins" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="margins">📊 שולי רווח והכנסות</TabsTrigger>
            <TabsTrigger value="ratios">מכפילים ויחסים</TabsTrigger>
            <TabsTrigger value="income">רווח והפסד</TabsTrigger>
            <TabsTrigger value="balance">מאזן</TabsTrigger>
            <TabsTrigger value="cashflow">תזרים מזומנים</TabsTrigger>
          </TabsList>

          <TabsContent value="margins">
            <MarginsSection income={data.income} />
          </TabsContent>

          <TabsContent value="ratios">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ChartCard title="Price to Earnings (P/E)"        data={data.ratios.pe}           variant="line" />
              <ChartCard title="Price to Sales (P/S)"           data={data.ratios.ps}           variant="line" />
              <ChartCard title="Price to Book (P/B)"            data={data.ratios.pb}           variant="line" />
              <ChartCard title="Return on Equity (ROE)"         data={data.ratios.roe}          variant="line" />
              <ChartCard title="Current Ratio"                  data={data.ratios.currentRatio} variant="line" />
              <ChartCard title="Debt to Equity"                 data={data.ratios.debtToEquity} variant="line" />
            </div>
          </TabsContent>

          <TabsContent value="income">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ChartCard title="Total Revenues"    data={data.income.revenues}        variant="bar" />
              <ChartCard title="Gross Profit"      data={data.income.grossProfit}     variant="bar" />
              <ChartCard title="Operating Income"  data={data.income.operatingIncome} variant="bar" />
              <ChartCard title="Net Income"        data={data.income.netIncome}       variant="bar" />
              <ChartCard title="EPS"               data={data.income.eps}             variant="line" />
            </div>
          </TabsContent>

          <TabsContent value="balance">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ChartCard title="Total Assets"       data={data.balance.totalAssets}       variant="bar" />
              <ChartCard title="Total Liabilities"  data={data.balance.totalLiabilities}  variant="bar" />
              <ChartCard title="Total Equity"       data={data.balance.totalEquity}       variant="bar" />
              <ChartCard title="Total Debt"         data={data.balance.totalDebt}         variant="bar" />
              <ChartCard title="Cash & Short Term"  data={data.balance.cashAndShortTerm}  variant="bar" />
            </div>
          </TabsContent>

          <TabsContent value="cashflow">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ChartCard title="Operating Cash Flow"    data={data.cashflow.operatingCashFlow}   variant="bar" />
              <ChartCard title="Free Cash Flow"         data={data.cashflow.freeCashFlow}        variant="bar" />
              <ChartCard title="Capital Expenditures"   data={data.cashflow.capitalExpenditures} variant="bar" />
              <ChartCard title="Net Income"             data={data.cashflow.netIncome}           variant="bar" />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default LiveFinancialDashboard;
