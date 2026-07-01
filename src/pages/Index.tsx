import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Calculator, RotateCcw, Download, Upload, Info, TrendingUp, TrendingDown, AlertTriangle, Loader2, Search, Bookmark, Moon, Sun } from "lucide-react";
import { SavedStocksDashboard, type SavedStock } from "@/components/SavedStocksDashboard";
import { ValuationCharts } from "@/components/ValuationCharts";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  DEFAULT_INPUTS,
  ValuationInputs,
  calculateValuation,
  fmtMoney,
  fmtPct,
  resultsToCSV,
} from "@/lib/valuation";
import { fetchStockData } from "@/services/stockDataService";
import { setApiKey, getApiKey, fetchHistoricalData, type HistoricalData } from "@/services/alphaVantageService";
import { setFinnhubKey, getFinnhubKey, fetchFinnhubHistorical, type FinnhubHistoricalData } from "@/services/finnhubService";
import { fetchMacrotrends, type MacrotrendsHistorical } from "@/services/macrotrendsService";
import type { ValuationCharts } from "@/components/FinancialDashboardSection";
import { FinancialDashboardSection } from "@/components/FinancialDashboardSection";
import TradingViewWidget from "@/components/TradingViewWidget";
import { StockScreener } from "@/components/StockScreener";
import { KeyMetrics } from "@/components/KeyMetrics";
import { CAPMSection } from "@/components/CAPMSection";
import { StockAnalysis } from "@/components/StockAnalysis";
import { FearGreedGauge } from "@/components/FearGreedGauge";

// Initialize API keys on first load
if (!getApiKey())     setApiKey("LPL9LH322EVZ8F3W");
if (!getFinnhubKey()) setFinnhubKey("d8gnm4pr01qhjpmoshagd8gnm4pr01qhjpmoshb0");

const TARGET_SHEET = "הערכת שווי מסכמת";

const NumField = ({
  label,
  value,
  onChange,
  step = "any",
  min,
  max,
  suffix,
  hint,
  manual = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: string;
  manual?: boolean;
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium flex items-center gap-1.5">
      {label}
      {manual && (
        <span
          title="ערך זה דורש מילוי/בדיקה ידנית"
          className="inline-block h-2 w-2 rounded-full bg-yellow-400 ring-2 ring-yellow-200"
          aria-label="מילוי ידני"
        />
      )}
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent><p className="max-w-xs">{hint}</p></TooltipContent>
        </Tooltip>
      )}
    </Label>
    <div className="relative">
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`text-right ${
          manual
            ? "bg-yellow-100 dark:bg-yellow-500/20 border-yellow-400/70 focus-visible:ring-yellow-500"
            : ""
        }`}
      />
      {suffix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

const StatCard = ({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "primary";
}) => {
  const toneClass =
    tone === "success"
      ? "border-success/25 bg-success/[0.04]"
      : tone === "warning"
      ? "border-warning/25 bg-warning/[0.04]"
      : tone === "primary"
      ? "border-primary/20 bg-primary/[0.04]"
      : "border-border/60";
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  const dotClass =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
      ? "bg-warning"
      : tone === "primary"
      ? "bg-primary"
      : "bg-muted-foreground/30";
  return (
    <div className={`stat-card border ${toneClass}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</div>}
    </div>
  );
};

const Index = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("dark_mode");
    return saved === "true";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("dark_mode", String(isDark));
  }, [isDark]);

  const [inputs, setInputs] = useState<ValuationInputs>(DEFAULT_INPUTS);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [trigger, setTrigger] = useState(0);
  const [ticker, setTicker] = useState("AAPL");
  const [loadingTicker, setLoadingTicker] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalData | FinnhubHistoricalData | null>(null);
  const [macrotrendsData, setMacrotrendsData] = useState<MacrotrendsHistorical | null>(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [loadedStockData, setLoadedStockData] = useState<import("@/services/stockDataService").StockData | null>(null);

  const STORAGE_KEY = "saved-stocks-v1";
  const [savedStocks, setSavedStocks] = useState<SavedStock[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedStock[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedStocks));
    } catch { /* ignore */ }
  }, [savedStocks]);

  const handleLoadTicker = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) {
      toast.error("יש להזין טיקר מניה");
      return;
    }
    setLoadingTicker(true);
    setMacrotrendsData(null); // reset on new ticker
    const loadingId = toast.loading(`טוען נתונים עבור ${t}...`);
    try {
      const data = await fetchStockData(t);
      setLoadedStockData(data);
      setInputs((prev) => ({
        ...prev,
        stockName: data.companyName ?? t,
        currentSharePrice: data.currentPrice ?? prev.currentSharePrice,
        marketSharePrice: data.currentPrice ?? prev.marketSharePrice,
        currentMarketCap: data.marketCap ?? prev.currentMarketCap,
        baseRevenue: data.baseRevenue ?? prev.baseRevenue,
        netMargin: data.netMargin ?? prev.netMargin,
        baseEPS: data.baseEPS ?? prev.baseEPS,
        revenueGrowth: data.revenueGrowth ?? prev.revenueGrowth,
        epsGrowthRate: data.epsGrowth ?? prev.epsGrowthRate,
      }));
      toast.dismiss(loadingId);
      if (data.missing.length > 0) {
        toast.warning(`נטען בהצלחה. הנתונים הבאים לא נטענו אוטומטית: ${data.missing.join(", ")}`);
      } else {
        toast.success(`נתונים נטענו בהצלחה עבור ${data.companyName ?? t}`);
        // Fetch historical data — try Finnhub first (unlimited), fallback to Alpha Vantage
        setLoadingHistorical(true);
        const loadHistorical = async () => {
          // MacroTrends: fetch valuation ratios in parallel (best source)
          fetchMacrotrends(t, data.companyName ?? t)
            .then((mt) => { if (mt.pe.length > 0 || mt.ps.length > 0) setMacrotrendsData(mt); })
            .catch(() => {});

          // Try Finnhub
          if (getFinnhubKey()) {
            try {
              const fh = await fetchFinnhubHistorical(t);
              // Check if Finnhub returned meaningful data
              const hasData = fh.income.revenues.some((p) => p.value !== null);
              if (hasData) { setHistoricalData(fh); return; }
            } catch { /* fallthrough */ }
          }
          // Fallback: Alpha Vantage
          if (getApiKey()) {
            try {
              const av = await fetchHistoricalData(t);
              setHistoricalData(av);
            } catch { /* silent */ }
          }
        };
        loadHistorical().finally(() => setLoadingHistorical(false));
      }
    } catch (err) {
      toast.dismiss(loadingId);
      const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
      toast.error(`שגיאה: ${msg}`);
    } finally {
      setLoadingTicker(false);
    }
  };

  const set = <K extends keyof ValuationInputs>(key: K, value: ValuationInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const results = useMemo(() => {
    try {
      return calculateValuation(inputs);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdate ? inputs : trigger]);

  const handleCalculate = () => {
    setTrigger((t) => t + 1);
    toast.success("החישוב בוצע בהצלחה");
  };

  const handleReset = () => {
    setInputs(DEFAULT_INPUTS);
    toast.info("הערכים אופסו לברירת המחדל");
  };

  const handleSaveStock = () => {
    const t = (ticker || inputs.stockName || "").trim().toUpperCase();
    if (!t) {
      toast.error("יש להזין טיקר או שם מניה לפני שמירה");
      return;
    }
    const entry: SavedStock = {
      ticker: t,
      companyName: inputs.stockName || t,
      savedAt: Date.now(),
      inputs: { ...inputs },
      fairPriceToday: results?.fairPriceToday,
      marketSharePrice: inputs.marketSharePrice,
    };
    setSavedStocks((prev) => {
      const without = prev.filter((s) => s.ticker !== t);
      return [entry, ...without];
    });
    toast.success(`${t} נשמר בדשבורד`);
  };

  const handleLoadSaved = (s: SavedStock) => {
    setInputs(s.inputs);
    setTicker(s.ticker);
    toast.success(`${s.ticker} נטען מהדשבורד`);
  };

  const handleDeleteSaved = (t: string) => {
    setSavedStocks((prev) => prev.filter((s) => s.ticker !== t));
    toast.info(`${t} הוסר מהדשבורד`);
  };

  const handleExport = () => {
    if (!results) return;
    const csv = "\uFEFF" + resultsToCSV(results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valuation_${inputs.stockName}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("הקובץ יוצא בהצלחה");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.includes(TARGET_SHEET)) {
        toast.error(`הטאב "${TARGET_SHEET}" לא נמצא בקובץ`);
        return;
      }
      const ws = wb.Sheets[TARGET_SHEET];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false });
      // Try to extract numeric values - fallback to user-driven adjustments
      const flat: { key: string; val: any }[] = [];
      rows.forEach((r) => {
        if (Array.isArray(r) && r.length >= 2 && typeof r[0] === "string") {
          flat.push({ key: r[0].toString().trim(), val: r[1] });
        }
      });
      const find = (regex: RegExp) => {
        const f = flat.find((x) => regex.test(x.key));
        const v = typeof f?.val === "number" ? f.val : parseFloat(f?.val);
        return Number.isFinite(v) ? v : null;
      };
      const next = { ...inputs };
      const map: [RegExp, keyof ValuationInputs, boolean?][] = [
        [/שנה.*התחל/, "startYear"],
        [/הכנסות.*בסיס/, "baseRevenue"],
        [/צמיחת.*הכנסות/, "revenueGrowth", true],
        [/שולי.*רווח/, "netMargin", true],
        [/שווי.*שוק/, "currentMarketCap"],
        [/מחיר.*נוכחי/, "currentSharePrice"],
        [/מספר.*שנים/, "numberOfYears"],
        [/מכפיל.*נמוך/, "peLow"],
        [/מכפיל.*בינוני/, "peMid"],
        [/מכפיל.*גבוה/, "peHigh"],
        [/EPS.*בסיס/i, "baseEPS"],
        [/צמיחת.*EPS/i, "epsGrowthRate", true],
        [/מכפיל.*שנה/, "peYear5"],
        [/היוון/, "discountRate", true],
        [/מחיר.*בשוק|מחיר.*שוק/, "marketSharePrice"],
      ];
      let matched = 0;
      for (const [rx, key, isPct] of map) {
        const v = find(rx);
        if (v !== null) {
          let val: any = v;
          if (isPct && Math.abs(v) > 1) val = v / 100;
          (next as any)[key] = val;
          matched++;
        }
      }
      setInputs(next);
      toast.success(`הקובץ נטען. עודכנו ${matched} שדות מהטאב "${TARGET_SHEET}"`);
    } catch (err) {
      toast.error("שגיאה בקריאת הקובץ");
    } finally {
      e.target.value = "";
    }
  };

  const isUndervalued = results ? inputs.marketSharePrice < results.fairPriceToday : false;
  const mosTone: "success" | "warning" = isUndervalued ? "success" : "warning";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/85 backdrop-blur-xl sticky top-0 z-10"
          style={{ boxShadow: "0 1px 20px -4px hsl(224 40% 16% / 0.08)" }}>
          <div className="container py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white btn-primary-glow">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-bold gradient-text leading-tight">מחשבון הערכת שווי</h1>
                  <p className="text-[11px] text-muted-foreground tracking-wide">ניתוח פונדמנטלי · DCF · גרהם · נתונים היסטוריים</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors cursor-pointer shadow-sm">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" /> ייבוא Excel
                  </span>
                </label>
                <Button variant="outline" size="sm" className="rounded-xl shadow-sm border-border/80 bg-card hover:bg-secondary" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" /> איפוס
                </Button>
                <Button onClick={handleExport} size="sm" variant="outline" className="rounded-xl shadow-sm border-border/80 bg-card hover:bg-secondary">
                  <Download className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" /> ייצוא
                </Button>
                <Button onClick={handleCalculate} size="sm" className="rounded-xl text-white btn-primary-glow border-0">
                  <Calculator className="h-3.5 w-3.5 ml-1.5" /> חשב שווי
                </Button>
                {/* Dark mode toggle */}
                <Button
                  variant="outline" size="sm"
                  className="rounded-xl shadow-sm border-border/80 bg-card hover:bg-secondary w-9 px-0"
                  onClick={() => setIsDark((d) => !d)}
                  title={isDark ? "מצב יום" : "מצב לילה"}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container py-6 space-y-6">
          <Alert className="border-warning/40 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-sm space-y-1">
              <p>
                המידע באפליקציה אינו מהווה ייעוץ השקעות. החישובים מתבססים אך ורק על הלוגיקה של הטאב
                "הערכת שווי מסכמת" ואינם כוללים שיטות נוספות.
              </p>
              <p className="text-xs text-muted-foreground">
                נתוני השוק מגיעים ממקור חיצוני (Finviz) ועשויים להיות מעוכבים או לא מדויקים. חובה לוודא את הנתונים מול מקור רשמי לפני קבלת החלטות.
              </p>
              <p className="text-xs flex items-center gap-2 pt-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300 border border-yellow-500" />
                <span>
                  שדות המסומנים בצהוב הם <strong>למילוי עצמי</strong> — דורשים הערכה ידנית של המשתמש (מכפילים היסטוריים, שיעורי צמיחה, קצב היוון, מרווחי ביטחון וכו׳) ואינם נמשכים אוטומטית.
                </span>
              </p>
            </AlertDescription>
          </Alert>

          {/* Auto-load by ticker */}
          <Card className="card-elegant">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <Label className="text-sm font-medium">טיקר מניה</Label>
                  <Input
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && !loadingTicker && handleLoadTicker()}
                    placeholder="AAPL, MSFT, AMZN, NVDA..."
                    className="text-right"
                    disabled={loadingTicker}
                  />
                </div>
                <Button
                  onClick={handleLoadTicker}
                  disabled={loadingTicker}
                  className="rounded-xl text-white btn-primary-glow border-0"
                >
                  {loadingTicker ? (
                    <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> טוען...</>
                  ) : (
                    <><Search className="h-4 w-4 ml-2" /> טען נתונים</>
                  )}
                </Button>
                <Button
                  onClick={handleSaveStock}
                  variant="outline"
                  disabled={loadingTicker}
                  title="שמור את הנתונים הנוכחיים בדשבורד"
                >
                  <Bookmark className="h-4 w-4 ml-2" /> שמור מניה
                </Button>
                <p className="text-xs text-muted-foreground basis-full">
                  הנתונים נמשכים מ-Finviz וניתנים לעריכה ידנית בטופס. שמירה מתבצעת רק בלחיצה על "שמור מניה".
                </p>
              </div>
            </CardContent>
          </Card>

          <SavedStocksDashboard
            items={savedStocks}
            onLoad={handleLoadSaved}
            onDelete={handleDeleteSaved}
          />

          <div className="grid lg:grid-cols-5 gap-6">
            {/* Inputs */}
            <div className="lg:col-span-2">
              <Card className="card-elegant">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>נתוני קלט</span>
                    <div className="flex items-center gap-2 text-sm font-normal">
                      <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} id="auto" />
                      <Label htmlFor="auto" className="text-xs cursor-pointer">עדכון אוטומטי</Label>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="base" className="w-full">
                    <TabsList className="grid grid-cols-5 w-full mb-4">
                      <TabsTrigger value="base" className="text-xs">בסיס</TabsTrigger>
                      <TabsTrigger value="revenue" className="text-xs">הכנסות</TabsTrigger>
                      <TabsTrigger value="multiples" className="text-xs">מכפילים</TabsTrigger>
                      <TabsTrigger value="eps" className="text-xs">EPS/גרהם</TabsTrigger>
                      <TabsTrigger value="market" className="text-xs">היוון/שוק</TabsTrigger>
                    </TabsList>

                    <TabsContent value="base" className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">שם מניה</Label>
                        <Input value={inputs.stockName} onChange={(e) => set("stockName", e.target.value)} />
                      </div>
                      <NumField label="שנה התחלתית" value={inputs.startYear} onChange={(v) => set("startYear", v)} manual />
                      <NumField label="מספר שנים" value={inputs.numberOfYears} onChange={(v) => set("numberOfYears", Math.max(1, Math.min(20, v)))} min={1} max={20} hint="בין 1 ל-20" manual />
                      <NumField label="שווי שוק בהווה" value={inputs.currentMarketCap} onChange={(v) => set("currentMarketCap", Math.max(0, v))} min={0} hint="במיליארדים" />
                      <NumField label="מחיר מניה נוכחי" value={inputs.currentSharePrice} onChange={(v) => set("currentSharePrice", Math.max(0, v))} min={0} suffix="$" />
                    </TabsContent>

                    <TabsContent value="revenue" className="space-y-4">
                      <NumField label="הכנסות בסיס" value={inputs.baseRevenue} onChange={(v) => set("baseRevenue", Math.max(0, v))} min={0} hint="במיליארדים, נקודת ההתחלה לשנה הראשונה" />
                      <NumField
                        label="צמיחת הכנסות (%)"
                        value={+(inputs.revenueGrowth * 100).toFixed(4)}
                        onChange={(v) => set("revenueGrowth", Math.max(0, Math.min(100, v)) / 100)}
                        suffix="%"
                        min={0}
                        max={100}
                        hint="צמיחת הכנסות שנתית ממוצעת ל־5 שנים. מומלץ לקחת את הערך מ״גרהם 2״ (תרחיש בינוני)."
                        manual
                      />
                      <NumField
                        label="שולי רווח נקי (%)"
                        value={+(inputs.netMargin * 100).toFixed(4)}
                        onChange={(v) => set("netMargin", Math.max(0, Math.min(100, v)) / 100)}
                        suffix="%"
                        min={0}
                        max={100}
                      />
                    </TabsContent>

                    <TabsContent value="multiples" className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        בסס את המכפילים על המכפיל ההיסטורי הממוצע שבו המניה נסחרה בעבר (למשל ממוצע 5–10 שנים), והגדר תרחיש <strong className="text-foreground">נמוך / בינוני / גבוה</strong> סביבו.
                      </p>
                      <NumField label="מכפיל רווח נמוך" value={inputs.peLow} onChange={(v) => set("peLow", Math.max(0, v))} min={0} hint="הערכה שמרנית — מתחת לממוצע ההיסטורי" manual />
                      <NumField label="מכפיל רווח בינוני" value={inputs.peMid} onChange={(v) => set("peMid", Math.max(0, v))} min={0} hint="קרוב למכפיל ההיסטורי הממוצע של המניה" manual />
                      <NumField label="מכפיל רווח גבוה" value={inputs.peHigh} onChange={(v) => set("peHigh", Math.max(0, v))} min={0} hint="הערכה אופטימית — מעל הממוצע ההיסטורי" manual />
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                        <div>
                          <Label className="text-sm font-medium">השתמש בקצב היוון לכל התרחישים</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            כבוי = היוון לפי CAGR של כל תרחיש (כמו במקור)
                          </p>
                        </div>
                        <Switch
                          checked={inputs.useDiscountRateForAll}
                          onCheckedChange={(v) => set("useDiscountRateForAll", v)}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="eps" className="space-y-4">
                      <NumField label="EPS בסיסי" value={inputs.baseEPS} onChange={(v) => set("baseEPS", v)} suffix="$" />
                      <NumField
                        label="קצב צמיחת EPS (%)"
                        value={+(inputs.epsGrowthRate * 100).toFixed(4)}
                        onChange={(v) => set("epsGrowthRate", Math.max(0, Math.min(100, v)) / 100)}
                        suffix="%"
                        min={0}
                        max={100}
                        manual
                      />
                      <NumField label="מכפיל רווח בשנה האחרונה" value={inputs.peYear5} onChange={(v) => set("peYear5", Math.max(0, v))} min={0} manual />
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          שיעורי צמיחה משוערים לנוסחת גרהם — יש להזין ידנית לפי הערכתך:
                          <br />
                          <strong className="text-foreground">גרהם 1</strong> = צפי נמוך · <strong className="text-foreground">גרהם 2</strong> = בינוני · <strong className="text-foreground">גרהם 3</strong> = גבוה.
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {inputs.grahamGrowthRates.map((g, i) => (
                            <NumField
                              key={i}
                              label={`גרהם ${i + 1} (%)`}
                              value={g}
                              onChange={(v) => {
                                const arr = [...inputs.grahamGrowthRates] as [number, number, number];
                                arr[i] = Math.max(0, Math.min(100, v));
                                set("grahamGrowthRates", arr);
                              }}
                              suffix="%"
                              min={0}
                              max={100}
                              manual
                            />
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="market" className="space-y-4">
                      <NumField
                        label="קצב היוון (%)"
                        value={+(inputs.discountRate * 100).toFixed(4)}
                        onChange={(v) => set("discountRate", Math.max(0, Math.min(100, v)) / 100)}
                        suffix="%"
                        min={0}
                        max={100}
                        manual
                      />
                      <NumField label="מחיר מניה בשוק" value={inputs.marketSharePrice} onChange={(v) => set("marketSharePrice", Math.max(0, v))} min={0} suffix="$" />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">מרווחי ביטחון להצגת מחיר יעד</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {inputs.safetyMargins.map((m, i) => (
                            <NumField
                              key={i}
                              label={`מרווח ${i + 1}`}
                              value={+(m * 100).toFixed(2)}
                              onChange={(v) => {
                                const arr = [...inputs.safetyMargins] as [number, number, number];
                                arr[i] = Math.max(0, Math.min(100, v)) / 100;
                                set("safetyMargins", arr);
                              }}
                              suffix="%"
                              min={0}
                              max={100}
                              manual
                            />
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <Accordion type="single" collapsible className="mt-4">
                <AccordionItem value="formulas" className="card-elegant px-4 border-0">
                  <AccordionTrigger className="text-sm font-semibold">📐 נוסחאות מרכזיות</AccordionTrigger>
                  <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                    <p><strong className="text-foreground">הכנסות:</strong> Revenue[i] = Revenue[i-1] × (1 + צמיחה)</p>
                    <p><strong className="text-foreground">רווח נקי:</strong> NetIncome = Revenue × NetMargin</p>
                    <p><strong className="text-foreground">שווי שוק עתידי:</strong> NetIncome[N] × PE</p>
                    <p><strong className="text-foreground">CAGR:</strong> (MarketCap_future / CurrentMarketCap)^(1/N) − 1</p>
                    <p><strong className="text-foreground">מחיר עתידי:</strong> CurrentPrice × (1 + CAGR)^N</p>
                    <p><strong className="text-foreground">PV:</strong> FuturePrice / (1 + r)^N</p>
                    <p><strong className="text-foreground">EPS[i]:</strong> EPS[i-1] × (1 + צמיחת EPS)</p>
                    <p><strong className="text-foreground">מחיר הוגן היום:</strong> (PE × EPS[N]) / (1 + r)^N</p>
                    <p><strong className="text-foreground">גרהם:</strong> (2g + 8.5) × EPS</p>
                    <p><strong className="text-foreground">ממוצע 2 שיטות:</strong> (גרהם + AVG all) / 2</p>
                    <p><strong className="text-foreground">מרווח ביטחון:</strong> (FairPrice − MarketPrice) / FairPrice</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Stock Screener */}
              <div className="mt-4">
                <StockScreener />
              </div>

              {/* CAPM Discount Rate */}
              {loadedStockData && ticker && (
                <div className="mt-4">
                  <CAPMSection
                    ticker={ticker}
                    onRateChange={(rate) => set("discountRate", rate)}
                  />
                </div>
              )}

              {/* Key Metrics */}
              {loadedStockData && ticker && (
                <div className="mt-4">
                  <KeyMetrics ticker={ticker} />
                </div>
              )}

              {/* Fear & Greed Index */}
              <div className="mt-4">
                <FearGreedGauge ticker={ticker} />
              </div>
            </div>

            {/* Results */}
            <div className="lg:col-span-3 space-y-6">
              {results && (
                <>
                  {/* Summary Cards */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                    <StatCard
                      title="שווי הוגן היום (EPS)"
                      value={`$${fmtMoney(results.fairPriceToday)}`}
                      tone="primary"
                    />
                    <StatCard title="AVG all (מכפילים)" value={`$${fmtMoney(results.avgAll)}`} tone="primary" />
                    <StatCard
                      title="ממוצע 2 שיטות"
                      value={`$${fmtMoney(results.twoMethodsAverage)}`}
                      tone="primary"
                    />
                    <StatCard title="ממוצע גרהם" value={`$${fmtMoney(results.grahamAverage)}`} />
                    <StatCard title="מחיר בשנה האחרונה" value={`$${fmtMoney(results.priceYear5)}`} />
                    <StatCard
                      title="מרווח ביטחון מול שוק"
                      value={fmtPct(results.marginOfSafety)}
                      tone={mosTone}
                      hint={isUndervalued ? "מחיר השוק נמוך מהמחיר ההוגן" : "מחיר השוק גבוה מהמחיר ההוגן"}
                    />
                  </div>

                  {/* Charts */}
                  <ValuationCharts results={results} inputs={inputs} />

                  {/* Safety price targets */}
                  <Card className="card-elegant">
                    <CardHeader>
                      <CardTitle className="text-base">מחירי יעד לפי מרווח ביטחון</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-3 gap-3">
                        {results.safetyPrices.map((s, i) => {
                          const good = inputs.marketSharePrice <= s.price;
                          return (
                            <div
                              key={i}
                              className={`rounded-2xl p-4 border transition-all ${
                                good
                                  ? "border-success/50 bg-success/5"
                                  : "border-warning/40 bg-warning/5"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-muted-foreground">
                                  מרווח {(s.margin * 100).toFixed(0)}%
                                </span>
                                {good ? (
                                  <TrendingDown className="h-4 w-4 text-success" />
                                ) : (
                                  <TrendingUp className="h-4 w-4 text-warning" />
                                )}
                              </div>
                              <div className={`text-xl font-bold ${good ? "text-success" : "text-warning"}`}>
                                ${fmtMoney(s.price)}
                              </div>
                              <Badge variant="outline" className="mt-2 text-xs">
                                שוק: ${fmtMoney(inputs.marketSharePrice)}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Revenue table */}
                  <Card className="card-elegant">
                    <CardHeader>
                      <CardTitle className="text-base">תחזית הכנסות ורווח נקי</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-right py-2 px-3 font-medium">שנה</th>
                              <th className="text-right py-2 px-3 font-medium">הכנסות</th>
                              <th className="text-right py-2 px-3 font-medium">רווח נקי</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.revenueTable.map((r) => (
                              <tr key={r.year} className="border-b border-border/40 hover:bg-primary/[0.03] transition-colors">
                                <td className="py-2 px-3 font-medium">{r.year}</td>
                                <td className="py-2 px-3">{fmtMoney(r.revenue)}</td>
                                <td className="py-2 px-3">{fmtMoney(r.netIncome)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Scenarios */}
                  <Card className="card-elegant">
                    <CardHeader>
                      <CardTitle className="text-base">תרחישי מכפילי רווח</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-right py-2 px-3 font-medium">תרחיש</th>
                              <th className="text-right py-2 px-3 font-medium">מכפיל</th>
                              <th className="text-right py-2 px-3 font-medium">שווי שוק עתידי</th>
                              <th className="text-right py-2 px-3 font-medium">CAGR</th>
                              <th className="text-right py-2 px-3 font-medium">מחיר עתידי</th>
                              <th className="text-right py-2 px-3 font-medium">PV</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.scenarios.map((s) => (
                              <tr key={s.label} className="border-b border-border/40 hover:bg-primary/[0.03] transition-colors">
                                <td className="py-2 px-3 font-medium">{s.label}</td>
                                <td className="py-2 px-3">{s.multiple}</td>
                                <td className="py-2 px-3">{fmtMoney(s.marketCapFuture)}</td>
                                <td className="py-2 px-3">{fmtPct(s.cagr)}</td>
                                <td className="py-2 px-3">${fmtMoney(s.futureSharePrice)}</td>
                                <td className="py-2 px-3 font-semibold text-primary">${fmtMoney(s.pv)}</td>
                              </tr>
                            ))}
                            <tr className="bg-primary/5 font-semibold">
                              <td colSpan={5} className="py-2 px-3 text-left">AVG all</td>
                              <td className="py-2 px-3 text-primary">${fmtMoney(results.avgAll)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {!inputs.useDiscountRateForAll && (
                        <p className="text-xs text-muted-foreground mt-3">
                          ℹ️ מצב "מקור": ההיוון לכל תרחיש מתבצע לפי ה-CAGR שלו, בהתאם לקובץ המקורי.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* EPS & Graham */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card className="card-elegant">
                      <CardHeader>
                        <CardTitle className="text-base">תחזית EPS</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-right py-2 px-3 font-medium">שנה</th>
                              <th className="text-right py-2 px-3 font-medium">EPS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.epsTable.map((r) => (
                              <tr key={r.year} className="border-b border-border/50">
                                <td className="py-2 px-3 font-medium">{r.year}</td>
                                <td className="py-2 px-3">${fmtMoney(r.eps)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>

                    <Card className="card-elegant">
                      <CardHeader>
                        <CardTitle className="text-base">ערכי גרהם</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-right py-2 px-3 font-medium">צמיחה</th>
                              <th className="text-right py-2 px-3 font-medium">ערך</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.grahamTable.map((r, i) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 px-3 font-medium">{r.growth}%</td>
                                <td className="py-2 px-3">${fmtMoney(r.value)}</td>
                              </tr>
                            ))}
                            <tr className="bg-primary/5 font-semibold">
                              <td className="py-2 px-3">ממוצע</td>
                              <td className="py-2 px-3 text-primary">${fmtMoney(results.grahamAverage)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* AI Company Review */}
          {loadedStockData && ticker && (
            <StockAnalysis ticker={ticker} stockData={loadedStockData} />
          )}

          {/* TradingView Chart */}
          {inputs.stockName && ticker && (
            <TradingViewWidget symbol={ticker} isDark={isDark} />
          )}

          {/* Historical Financial Dashboard */}
          {loadingHistorical && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען נתונים היסטוריים...
            </div>
          )}
          {historicalData && !loadingHistorical && (
            <div className="mt-2">
              <FinancialDashboardSection
                data={historicalData}
                ticker={ticker.trim().toUpperCase()}
                valuationCharts={
                  // Prefer MacroTrends (direct ratios, more accurate) over Finnhub
                  macrotrendsData && macrotrendsData.pe.length > 0
                    ? {
                        peHistorical:   macrotrendsData.pe.map(p => ({ date: String(p.year), value: p.value })),
                        pfcfHistorical: macrotrendsData.pfcf.map(p => ({ date: String(p.year), value: p.value })),
                        psHistorical:   macrotrendsData.ps.map(p => ({ date: String(p.year), value: p.value })),
                        pbHistorical:   macrotrendsData.pb.map(p => ({ date: String(p.year), value: p.value })),
                      } as ValuationCharts
                    : historicalData && "ratios" in historicalData && "peHistorical" in (historicalData as FinnhubHistoricalData).ratios
                    ? {
                        peHistorical:   (historicalData as FinnhubHistoricalData).ratios.peHistorical,
                        pfcfHistorical: (historicalData as FinnhubHistoricalData).ratios.pfcfHistorical,
                        psHistorical:   (historicalData as FinnhubHistoricalData).ratios.psHistorical,
                        pbHistorical:   (historicalData as FinnhubHistoricalData).ratios.pbHistorical,
                      } as ValuationCharts
                    : undefined
                }
                onPeriodChange={(p) => {
                  const t = ticker.trim().toUpperCase();
                  if (!t) return;
                  setLoadingHistorical(true);
                  (async () => {
                    if (getFinnhubKey()) {
                      try {
                        const fh = await fetchFinnhubHistorical(t, p);
                        if (fh.income.revenues.some((x) => x.value !== null)) { setHistoricalData(fh); return; }
                      } catch { /* fallthrough */ }
                    }
                    if (getApiKey()) {
                      try { setHistoricalData(await fetchHistoricalData(t, p)); } catch { /* silent */ }
                    }
                  })().finally(() => setLoadingHistorical(false));
                }}
              />
            </div>
          )}

          <footer className="text-center text-xs text-muted-foreground py-6">
            מחשבון הערכת שווי מסכמת · מבוסס בלעדית על לוגיקת הטאב "הערכת שווי מסכמת"
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default Index;
