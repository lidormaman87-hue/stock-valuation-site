import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRight, BarChart3, Upload, X, Maximize2, ImageIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { LiveFinancialDashboard } from "@/components/LiveFinancialDashboard";
import ratios1 from "@/assets/ratios-1.png";
import ratios2 from "@/assets/ratios-2.png";
import incomeImg from "@/assets/income.png";
import balanceImg from "@/assets/balance.png";
import cashflowImg from "@/assets/cashflow.png";

interface PresetImage {
  title: string;
  src: string;
}

const PRESET_IMAGES: Record<string, PresetImage[]> = {
  ratios: [
    { title: "מכפילים ויחסים פיננסיים — חלק 1", src: ratios1 },
    { title: "מכפילים ויחסים פיננסיים — חלק 2", src: ratios2 },
  ],
  income: [{ title: "דוח רווח והפסד", src: incomeImg }],
  balance: [{ title: "מאזן", src: balanceImg }],
  cashflow: [{ title: "תזרים מזומנים", src: cashflowImg }],
};

type MetricKey = string;

interface MetricDef {
  key: MetricKey;
  label: string;
  hint?: string;
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  metrics: MetricDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "ratios",
    title: "מכפילים ויחסים פיננסיים",
    description: "Financial Ratios Analysis — מכפילים ויחסי איתנות פיננסית לאורך זמן.",
    metrics: [
      { key: "pe", label: "Price to Earnings (P/E)" },
      { key: "fwd_pe", label: "Forward P/E" },
      { key: "roe", label: "Return on Equity (ROE)" },
      { key: "ps", label: "Price to Sales (P/S)" },
      { key: "current_ratio", label: "Current Ratio" },
      { key: "de", label: "Debt to Equity" },
      { key: "tle", label: "Total Liabilities to Equity" },
      { key: "pcf", label: "Price to Cash Flow (P/CF)" },
      { key: "pfcf", label: "Price to Free Cash Flow (P/FCF)" },
      { key: "pb", label: "Price to Book (P/B)" },
    ],
  },
  {
    id: "income",
    title: "דוח רווח והפסד",
    description: "Income Statement Analysis — מגמות הכנסה, רווחיות ורווח למניה.",
    metrics: [
      { key: "revenues", label: "Total Revenues" },
      { key: "gross_profit", label: "Gross Profit" },
      { key: "op_income", label: "Operating Income" },
      { key: "net_income", label: "Net Income" },
      { key: "eps", label: "Earnings Per Share" },
      { key: "shares_diluted", label: "Shares Outstanding Diluted" },
      { key: "rule40", label: "Rule of 40" },
      { key: "dps", label: "Dividends Per Share" },
    ],
  },
  {
    id: "balance",
    title: "מאזן",
    description: "Balance Sheet Analysis — נכסים, התחייבויות והון עצמי.",
    metrics: [
      { key: "st_position", label: "Short-term Position" },
      { key: "total_structure", label: "Total Structure" },
      { key: "debt_vs_liq", label: "Debt vs Liquidity" },
      { key: "cash_sti", label: "Cash & Short Term Investments" },
      { key: "tca", label: "Total Current Assets" },
      { key: "tcl", label: "Total Current Liabilities" },
      { key: "ta", label: "Total Assets" },
      { key: "tl", label: "Total Liabilities" },
      { key: "te", label: "Total Equity" },
      { key: "td", label: "Total Debt" },
    ],
  },
  {
    id: "cashflow",
    title: "תזרים מזומנים",
    description: "Cash Flow Analysis — תזרים תפעולי, חופשי והשקעות הון.",
    metrics: [
      { key: "cf_breakdown", label: "Cash Flow Breakdown" },
      { key: "ocf_vs_ni", label: "OCF vs Net Income" },
      { key: "ocf", label: "Operating Cash Flow" },
      { key: "fcf", label: "Free Cash Flow" },
      { key: "sbc", label: "Stock-Based Compensation" },
      { key: "capex", label: "Capital Expenditures" },
      { key: "net_income_cf", label: "Net Income" },
    ],
  },
];

interface StoredImage {
  src: string;
  description?: string;
  uploadedAt: number;
}

type ImagesMap = Record<string, StoredImage>; // key: `${ticker}|${sectionId}|${metricKey}`

const STORAGE_KEY = "historical-dashboard-images-v1";
const TICKER_KEY = "historical-dashboard-ticker";

const loadImages = (): ImagesMap => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const HistoricalDashboard = () => {
  const [params] = useSearchParams();
  const initialTicker =
    params.get("ticker") ||
    (typeof window !== "undefined" ? localStorage.getItem(TICKER_KEY) || "" : "") ||
    "AAPL";
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [images, setImages] = useState<ImagesMap>(loadImages);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  }, [images]);

  useEffect(() => {
    if (ticker) localStorage.setItem(TICKER_KEY, ticker);
  }, [ticker]);

  const keyFor = (sectionId: string, metricKey: string) => `${ticker}|${sectionId}|${metricKey}`;

  const handleUpload = (sectionId: string, metricKey: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("יש להעלות קובץ תמונה בלבד");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל מקסימלי: 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImages((prev) => ({
        ...prev,
        [keyFor(sectionId, metricKey)]: { src, uploadedAt: Date.now() },
      }));
      toast.success("התמונה נשמרה");
    };
    reader.readAsDataURL(file);
  };

  const handleDescription = (sectionId: string, metricKey: string, description: string) => {
    const k = keyFor(sectionId, metricKey);
    setImages((prev) => {
      const existing = prev[k];
      if (!existing) return prev;
      return { ...prev, [k]: { ...existing, description } };
    });
  };

  const handleRemove = (sectionId: string, metricKey: string) => {
    setImages((prev) => {
      const next = { ...prev };
      delete next[keyFor(sectionId, metricKey)];
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-lg">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl gradient-text">דשבורד נתונים היסטוריים</h1>
                <p className="text-xs text-muted-foreground">
                  נתונים היסטוריים עבור: <span className="font-semibold text-foreground">{ticker || "—"}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowRight className="h-4 w-4 ml-2" /> חזרה למחשבון
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <Alert className="border-warning/40 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            הנתונים מגיעים ממקור חיצוני ועשויים להיות מעוכבים או לא מדויקים. אין מדובר בייעוץ השקעות.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList>
            <TabsTrigger value="live">נתונים חיים (API)</TabsTrigger>
            <TabsTrigger value="reference">תצוגת ייחוס / צילומי מסך</TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            <LiveFinancialDashboard initialTicker={ticker} />
          </TabsContent>

          <TabsContent value="reference" className="space-y-6">

        <Card className="card-elegant">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <Label className="text-sm font-medium">טיקר מניה</Label>
                <Input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL, MSFT..."
                  className="text-right"
                />
              </div>
              <p className="text-xs text-muted-foreground basis-full">
                התמונות נשמרות מקומית במכשיר שלך לפי טיקר ומדד. החלפת הטיקר תציג את הסט המתאים.
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="ratios" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {SECTIONS.map((section) => (
            <TabsContent key={section.id} value={section.id} className="space-y-4">
              <Card className="card-elegant">
                <CardHeader>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </CardHeader>
              </Card>

              {PRESET_IMAGES[section.id]?.map((preset, idx) => (
                <Card key={idx} className="card-elegant overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{preset.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="group relative w-full overflow-hidden rounded-md border border-border bg-muted">
                          <img src={preset.src} alt={preset.title} className="w-full h-auto object-contain" />
                          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <Maximize2 className="h-6 w-6 text-foreground" />
                          </div>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-7xl">
                        <img src={preset.src} alt={preset.title} className="w-full h-auto" />
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ))}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {section.metrics.map((metric) => {
                  const k = keyFor(section.id, metric.key);
                  const img = images[k];
                  return (
                    <Card key={metric.key} className="card-elegant overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{metric.label}</CardTitle>
                          {img && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemove(section.id, metric.key)}
                              title="הסר תמונה"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {img ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="group relative w-full overflow-hidden rounded-md border border-border bg-muted">
                                <img
                                  src={img.src}
                                  alt={metric.label}
                                  className="w-full h-auto object-contain max-h-72"
                                />
                                <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <Maximize2 className="h-6 w-6 text-foreground" />
                                </div>
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-6xl">
                              <img src={img.src} alt={metric.label} className="w-full h-auto" />
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 h-44 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-secondary/50 transition-colors">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">העלה צילום מסך</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(section.id, metric.key, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}

                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="תיאור / הערה (אופציונלי)"
                            value={img?.description || ""}
                            onChange={(e) => handleDescription(section.id, metric.key, e.target.value)}
                            className="text-right text-sm"
                            disabled={!img}
                          />
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(section.id, metric.key, f);
                                e.target.value = "";
                              }}
                            />
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors">
                              <Upload className="h-3.5 w-3.5" /> {img ? "החלף" : "העלה"}
                            </span>
                          </label>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default HistoricalDashboard;
