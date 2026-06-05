/**
 * StockScreener — Hebrew natural-language criteria parser + multi-ticker evaluator.
 * Uses Finnhub snapshot data (unlimited free tier).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Filter } from "lucide-react";
import { fetchFinnhubSnapshot, type FinnhubSnapshot } from "@/services/finnhubService";
import { toast } from "sonner";

/* ── Criterion types ────────────────────────────────────── */
type Operator = ">" | "<" | ">=" | "<=" | "=";
interface Criterion {
  label: string;       // display label
  field: keyof FinnhubSnapshot;
  op: Operator;
  value: number;       // raw (e.g. 0.15 for 15%)
  display: string;     // human display e.g. "> 15%"
}

/* ── Hebrew parser ──────────────────────────────────────── */
const NUM = /(\d+(?:\.\d+)?)/;

const tryMatch = (
  text: string,
  patterns: RegExp[],
  field: keyof FinnhubSnapshot,
  label: string,
  scale = 1,          // 1 = raw, 100 = pct input → /100
): Criterion | null => {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (!m) continue;
    const raw = parseFloat(m[1] ?? m[2] ?? "0");
    const val = raw / scale;
    // Determine operator from context
    const before = text.slice(0, m.index ?? 0);
    const op: Operator =
      /מעל|יותר מ|גבוה מ|לפחות|מינימום|≥|>=/.test(before) ? ">=" :
      /מתחת|פחות מ|נמוך מ|לכל היותר|מקסימום|≤|<=/.test(before) ? "<=" :
      /מעל|גבוה/.test(before) ? ">" :
      /מתחת|נמוך/.test(before) ? "<" : ">";
    return {
      label,
      field,
      op,
      value: val,
      display: `${op} ${scale === 100 ? raw + "%" : raw}`,
    };
  }
  return null;
};

function parseHebrew(text: string): Criterion[] {
  const t = text.toLowerCase();
  const results: Criterion[] = [];

  const add = (c: Criterion | null) => c && results.push(c);

  // Net margin
  add(tryMatch(t, [new RegExp(`שולי רווח נקי[^\\d]*(${NUM.source})`), new RegExp(`net margin[^\\d]*(${NUM.source})`)],
    "netMargin", "שולי רווח נקי", 100));

  // Gross margin
  add(tryMatch(t, [new RegExp(`שולי רווח גולמי[^\\d]*(${NUM.source})`), new RegExp(`gross margin[^\\d]*(${NUM.source})`)],
    "grossMargin", "שולי גולמי", 100));

  // Operating margin
  add(tryMatch(t, [new RegExp(`שולי תפעולי[^\\d]*(${NUM.source})`), new RegExp(`operating margin[^\\d]*(${NUM.source})`)],
    "operatingMargin", "שולי תפעולי", 100));

  // Revenue growth
  add(tryMatch(t, [new RegExp(`צמיח(?:ת|ה)[^\\d]*(${NUM.source})`), new RegExp(`revenue growth[^\\d]*(${NUM.source})`)],
    "revenueGrowth", "צמיחת הכנסות", 100));

  // EPS growth
  add(tryMatch(t, [new RegExp(`צמיח(?:ת|ה) eps[^\\d]*(${NUM.source})`), new RegExp(`eps growth[^\\d]*(${NUM.source})`)],
    "epsGrowth", "צמיחת EPS", 100));

  // Market cap
  add(tryMatch(t, [new RegExp(`שווי שוק[^\\d]*(${NUM.source})`)],
    "marketCap", "שווי שוק (B$)", 1));

  // EPS
  add(tryMatch(t, [new RegExp(`\\beps\\b[^\\d]*(${NUM.source})`)],
    "baseEPS", "EPS", 1));

  // Revenue
  add(tryMatch(t, [new RegExp(`הכנסות[^\\d]*(${NUM.source})`)],
    "baseRevenue", "הכנסות (B$)", 1));

  return results;
}

/* ── Evaluation ─────────────────────────────────────────── */
const evaluate = (val: number | null, op: Operator, threshold: number): boolean | null => {
  if (val === null) return null;
  switch (op) {
    case ">":  return val > threshold;
    case ">=": return val >= threshold;
    case "<":  return val < threshold;
    case "<=": return val <= threshold;
    case "=":  return Math.abs(val - threshold) < 0.001;
  }
};

const fmtVal = (field: keyof FinnhubSnapshot, val: number | null): string => {
  if (val === null) return "—";
  const pctFields: (keyof FinnhubSnapshot)[] = ["netMargin", "grossMargin", "operatingMargin", "revenueGrowth", "epsGrowth"];
  if (pctFields.includes(field)) return `${(val * 100).toFixed(1)}%`;
  if (field === "marketCap") return `$${val.toFixed(1)}B`;
  return val.toFixed(2);
};

/* ── Row result ─────────────────────────────────────────── */
interface TickerResult {
  ticker: string;
  name: string | null;
  data: FinnhubSnapshot | null;
  error: string | null;
  passes: (boolean | null)[];
  allPass: boolean;
}

/* ── Component ──────────────────────────────────────────── */
export function StockScreener() {
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, NVDA, GOOGL, META");
  const [criteriaInput, setCriteriaInput] = useState(
    "שולי רווח נקי מעל 15% וצמיחת הכנסות מעל 10%"
  );
  const [running, setRunning] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [results, setResults] = useState<TickerResult[]>([]);
  const [parsed, setParsed] = useState(false);

  const handleRun = async () => {
    const tickers = tickerInput
      .split(/[,\s\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (!tickers.length) { toast.error("הזן לפחות טיקר אחד"); return; }

    const crit = parseHebrew(criteriaInput);
    setCriteria(crit);
    setParsed(true);

    if (!crit.length) {
      toast.warning("לא הצלחתי לפרש קריטריונים — נסה לנסח מחדש");
      return;
    }

    setRunning(true);
    setResults([]);

    const rows: TickerResult[] = [];

    for (const ticker of tickers) {
      try {
        const data = await fetchFinnhubSnapshot(ticker);
        const passes = crit.map((c) => evaluate(data[c.field] as number | null, c.op, c.value));
        const allPass = passes.every((p) => p === true);
        rows.push({ ticker, name: data.companyName, data, error: null, passes, allPass });
      } catch (e) {
        rows.push({ ticker, name: null, data: null, error: (e as Error).message, passes: [], allPass: false });
      }
      setResults([...rows]); // update progressively
    }

    setRunning(false);
    const passed = rows.filter((r) => r.allPass).length;
    toast.success(`סקריינר הסתיים — ${passed}/${tickers.length} מניות עברו את הקריטריונים`);
  };

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4 text-primary" />
          סקריינר מניות — חיפוש לפי קריטריונים
        </CardTitle>
        <p className="text-xs text-muted-foreground">כתוב קריטריונים בעברית חופשית וקבל דירוג מיידי</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Tickers */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">רשימת טיקרים</Label>
            <Textarea
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="AAPL, MSFT, NVDA..."
              className="text-left font-mono text-sm h-24 resize-none"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">הפרד בפסיקים או שורות חדשות</p>
          </div>

          {/* Criteria */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">קריטריונים בעברית</Label>
            <Textarea
              value={criteriaInput}
              onChange={(e) => { setCriteriaInput(e.target.value); setParsed(false); }}
              placeholder="שולי רווח נקי מעל 15%, צמיחת הכנסות מעל 10%, EPS גבוה מ-2..."
              className="text-right h-24 resize-none text-sm"
              dir="rtl"
            />
            <p className="text-xs text-muted-foreground">
              ניתן לציין: שולי רווח גולמי/תפעולי/נקי, צמיחת הכנסות, EPS, שווי שוק, הכנסות
            </p>
          </div>
        </div>

        <Button
          onClick={handleRun}
          disabled={running}
          className="w-full rounded-xl text-white btn-primary-glow border-0"
        >
          {running ? (
            <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> מריץ סקריינר...</>
          ) : (
            <><Filter className="h-4 w-4 ml-2" /> הרץ סקריינר</>
          )}
        </Button>

        {/* Parsed criteria pills */}
        {parsed && criteria.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
            <span className="text-xs font-medium text-muted-foreground w-full mb-1">קריטריונים שזוהו:</span>
            {criteria.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {c.label} {c.display}
              </Badge>
            ))}
          </div>
        )}

        {parsed && criteria.length === 0 && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-xl border border-warning/30 text-sm text-warning">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            לא זוהו קריטריונים. נסה לכתוב: "שולי רווח נקי מעל 15%" או "צמיחת הכנסות מעל 10%"
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/40 border-b border-border/60">
                  <th className="text-right py-2.5 px-4 font-semibold">מניה</th>
                  {criteria.map((c, i) => (
                    <th key={i} className="text-center py-2.5 px-3 font-semibold text-xs whitespace-nowrap">
                      {c.label}<br />
                      <span className="font-normal text-muted-foreground">{c.display}</span>
                    </th>
                  ))}
                  <th className="text-center py-2.5 px-4 font-semibold">תוצאה</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.ticker}
                    className={`border-b border-border/40 transition-colors ${r.allPass ? "bg-success/5 hover:bg-success/8" : "hover:bg-primary/[0.02]"}`}>
                    <td className="py-3 px-4">
                      <div className="font-bold">{r.ticker}</div>
                      {r.name && <div className="text-xs text-muted-foreground">{r.name}</div>}
                      {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                    </td>
                    {criteria.map((c, i) => {
                      const val = r.data ? r.data[c.field] as number | null : null;
                      const pass = r.passes[i];
                      return (
                        <td key={i} className="py-3 px-3 text-center">
                          <div className={`font-medium ${pass === true ? "text-success" : pass === false ? "text-destructive" : "text-muted-foreground"}`}>
                            {fmtVal(c.field, val)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-center">
                      {r.error ? (
                        <AlertCircle className="h-5 w-5 text-warning mx-auto" />
                      ) : r.allPass ? (
                        <div className="flex items-center justify-center gap-1">
                          <CheckCircle2 className="h-5 w-5 text-success" />
                          <span className="text-xs font-semibold text-success">עבר</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <XCircle className="h-5 w-5 text-destructive/70" />
                          <span className="text-xs text-muted-foreground">נכשל</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
