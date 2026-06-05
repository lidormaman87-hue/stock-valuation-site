/**
 * Alpha Vantage direct frontend service.
 * API key stored in localStorage under "av_api_key".
 */

const AV_BASE = "https://www.alphavantage.co/query";
const STORAGE_KEY = "av_api_key";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const getApiKey = (): string =>
  localStorage.getItem(STORAGE_KEY) ?? "";

export const setApiKey = (key: string) =>
  localStorage.setItem(STORAGE_KEY, key.trim());

/* ── Cache helpers ─────────────────────────────────────────── */
const cacheKey = (params: Record<string, string>) =>
  "av_cache_" + Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join("&");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheGet = (key: string): any | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheSet = (key: string, data: any) => {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
};

export const clearCache = () => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("av_cache_"));
  keys.forEach((k) => localStorage.removeItem(k));
};

/* ── Fetch with cache ──────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const avFetch = async (params: Record<string, string>): Promise<any> => {
  const key = getApiKey();
  if (!key) throw new Error("לא הוגדר מפתח API. הזן מפתח Alpha Vantage בהגדרות.");

  const ck = cacheKey(params);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = new URL(AV_BASE);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alpha Vantage שגיאה ${res.status}`);
  const json = await res.json();

  if (json?.["Error Message"]) throw new Error(`טיקר לא נמצא: ${params.symbol}`);
  if (json?.["Note"])          throw new Error("הגעת למגבלת 5 בקשות לדקה. המתן דקה ונסה שוב.");
  if (json?.["Information"])   throw new Error("הגעת למגבלת 25 בקשות ליום. הנתונים יתרעננו מחר אוטומטית.");

  cacheSet(ck, json);
  return json;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "None" || v === "-") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/* ─── Stock Snapshot ──────────────────────────────────────── */
export interface StockSnapshot {
  companyName: string | null;
  currentPrice: number | null;
  marketCap: number | null;       // billions
  baseRevenue: number | null;     // billions
  netMargin: number | null;       // 0..1
  grossMargin: number | null;
  operatingMargin: number | null;
  baseEPS: number | null;
  revenueGrowth: number | null;   // 0..1
  epsGrowth: number | null;
  missing: string[];
}

export async function fetchSnapshot(ticker: string): Promise<StockSnapshot> {
  const t = ticker.trim().toUpperCase();
  const ov = await avFetch({ function: "OVERVIEW", symbol: t });

  const missing: string[] = [];
  const get = (field: string, label: string): number | null => {
    const v = num(ov[field]);
    if (v === null) missing.push(label);
    return v;
  };

  // Derive price from MarketCap / shares outstanding (avoids extra API call)
  const marketCap = num(ov["MarketCapitalization"]);
  const shares = num(ov["SharesOutstanding"]);
  const currentPrice = marketCap && shares && shares > 0 ? marketCap / shares : null;

  return {
    companyName:     ov["Name"] ?? null,
    currentPrice,
    marketCap:       marketCap !== null ? marketCap / 1e9 : (missing.push("שווי שוק"), null),
    baseRevenue:     (() => { const v = num(ov["RevenueTTM"]); if (!v) missing.push("הכנסות"); return v ? v / 1e9 : null; })(),
    netMargin:       get("ProfitMargin", "שולי רווח נקי"),
    grossMargin:     num(ov["GrossProfitTTM"]) !== null && num(ov["RevenueTTM"]) !== null
                       ? (num(ov["GrossProfitTTM"])! / num(ov["RevenueTTM"])!)
                       : null,
    operatingMargin: num(ov["OperatingMarginTTM"]),
    baseEPS:         get("EPS", "EPS"),
    revenueGrowth:   num(ov["QuarterlyRevenueGrowthYOY"]),
    epsGrowth:       num(ov["QuarterlyEarningsGrowthYOY"]),
    missing,
  };
}

/* ─── Historical Dashboard ────────────────────────────────── */
export interface SeriesPoint { date: string; value: number | null }

export interface HistoricalData {
  ticker: string;
  companyName: string | null;
  income: {
    revenues: SeriesPoint[];
    grossProfit: SeriesPoint[];
    operatingIncome: SeriesPoint[];
    netIncome: SeriesPoint[];
    eps: SeriesPoint[];
    sharesDiluted: SeriesPoint[];
    dividendsPerShare: SeriesPoint[];
    rule40: SeriesPoint[];          // revenueGrowth% + netMargin%
  };
  ratios: {
    pe: SeriesPoint[];
    pb: SeriesPoint[];
    ps: SeriesPoint[];
    roe: SeriesPoint[];
    currentRatio: SeriesPoint[];
    debtToEquity: SeriesPoint[];
  };
  balance: {
    totalAssets: SeriesPoint[];
    totalLiabilities: SeriesPoint[];
    totalEquity: SeriesPoint[];
    totalDebt: SeriesPoint[];
    cashAndShortTerm: SeriesPoint[];
    totalCurrentAssets: SeriesPoint[];
    totalCurrentLiabilities: SeriesPoint[];
  };
  cashflow: {
    operatingCashFlow: SeriesPoint[];
    freeCashFlow: SeriesPoint[];
    capitalExpenditures: SeriesPoint[];
    stockBasedCompensation: SeriesPoint[];
    netIncome: SeriesPoint[];
  };
  missing: string[];
}

const pickDate = (r: any): string =>
  r?.fiscalDateEnding || r?.date || r?.calendarYear || "";

const toSeries = (rows: any[], field: string): SeriesPoint[] =>
  [...rows].reverse().map((r) => ({ date: pickDate(r).slice(0, 4), value: num(r[field]) }));

export async function fetchHistoricalData(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
): Promise<HistoricalData> {
  const t = ticker.trim().toUpperCase();
  const reportKey = period === "annual" ? "annualReports" : "quarterlyReports";

  const [overview, incomeRaw, balanceRaw, cashflowRaw] = await Promise.all([
    avFetch({ function: "OVERVIEW",           symbol: t }),
    avFetch({ function: "INCOME_STATEMENT",   symbol: t }),
    avFetch({ function: "BALANCE_SHEET",      symbol: t }),
    avFetch({ function: "CASH_FLOW",          symbol: t }),
  ]);

  const incomeRows   = (incomeRaw?.[reportKey]   ?? []).slice(0, 10);
  const balanceRows  = (balanceRaw?.[reportKey]  ?? []).slice(0, 10);
  const cashflowRows = (cashflowRaw?.[reportKey] ?? []).slice(0, 10);

  // Derived: ROE, Current Ratio, D/E
  const orderedDates = [...balanceRows].reverse().map(pickDate).map((d) => d.slice(0, 4));
  const balMap = new Map(balanceRows.map((r: any) => [pickDate(r).slice(0, 4), r]));
  const incMap = new Map(incomeRows.map((r: any)  => [pickDate(r).slice(0, 4), r]));

  const roeSeries: SeriesPoint[] = orderedDates.map((d) => {
    const b = balMap.get(d) as any;
    const i = incMap.get(d) as any;
    const ni = num(i?.netIncome);
    const eq = num(b?.totalShareholderEquity);
    return { date: d, value: ni !== null && eq && eq !== 0 ? ni / eq : null };
  });

  const currentRatio: SeriesPoint[] = orderedDates.map((d) => {
    const b = balMap.get(d) as any;
    const ca = num(b?.totalCurrentAssets);
    const cl = num(b?.totalCurrentLiabilities);
    return { date: d, value: ca !== null && cl && cl !== 0 ? ca / cl : null };
  });

  const debtToEquity: SeriesPoint[] = orderedDates.map((d) => {
    const b = balMap.get(d) as any;
    const td = num(b?.shortLongTermDebtTotal ?? b?.longTermDebt);
    const eq = num(b?.totalShareholderEquity);
    return { date: d, value: td !== null && eq && eq !== 0 ? td / eq : null };
  });

  // EPS computed
  const epsSeries: SeriesPoint[] = orderedDates.map((d) => {
    const b = balMap.get(d) as any;
    const i = incMap.get(d) as any;
    const ni = num(i?.netIncome);
    const shares = num(b?.commonStockSharesOutstanding);
    return { date: d, value: ni !== null && shares && shares !== 0 ? ni / shares : null };
  });

  // Shares diluted
  const sharesDiluted = toSeries(balanceRows, "commonStockSharesOutstanding");

  // Dividends per share
  const dividendsPerShare: SeriesPoint[] = orderedDates.map((d) => {
    const cf = cfMap.get(d) as any;
    const b  = balMap.get(d) as any;
    const div    = num(cf?.dividendPayoutCommonStock ?? cf?.dividendPayout);
    const shares = num(b?.commonStockSharesOutstanding);
    return { date: d, value: div && shares && shares > 0 ? Math.abs(div) / shares : 0 };
  });

  // Rule of 40: revenueGrowthYoY% + netMargin%
  const revArr = [...incomeRows].reverse();
  const rule40: SeriesPoint[] = revArr.map((row, i) => {
    const rev     = num(row.totalRevenue);
    const prevRev = num(revArr[i - 1]?.totalRevenue);
    const ni      = num(row.netIncome);
    const revGrowth = prevRev && prevRev !== 0 && rev !== null ? ((rev - prevRev) / Math.abs(prevRev)) * 100 : null;
    const margin    = rev && rev !== 0 && ni !== null ? (ni / rev) * 100 : null;
    const value     = revGrowth !== null && margin !== null ? revGrowth + margin : null;
    return { date: pickDate(row).slice(0, 4), value };
  });

  // Free cash flow
  const cfMap = new Map(cashflowRows.map((r: any) => [pickDate(r).slice(0, 4), r]));
  const fcfDates = [...cashflowRows].reverse().map((r: any) => pickDate(r).slice(0, 4));
  const freeCashFlow: SeriesPoint[] = fcfDates.map((d) => {
    const cf = cfMap.get(d) as any;
    const ocf   = num(cf?.operatingCashflow);
    const capex = num(cf?.capitalExpenditures);
    return { date: d, value: ocf !== null && capex !== null ? ocf - Math.abs(capex) : null };
  });

  // Snapshot ratios from overview
  const snap = (v: number | null): SeriesPoint[] =>
    v !== null ? [{ date: "כעת", value: v }] : [];

  const missing: string[] = [];
  if (!incomeRows.length) missing.push("דוח רווח והפסד");
  if (!balanceRows.length) missing.push("מאזן");

  return {
    ticker: t,
    companyName: overview?.Name ?? null,
    income: {
      revenues:        toSeries(incomeRows, "totalRevenue"),
      grossProfit:     toSeries(incomeRows, "grossProfit"),
      operatingIncome: toSeries(incomeRows, "operatingIncome"),
      netIncome:       toSeries(incomeRows, "netIncome"),
      eps:             epsSeries,
      sharesDiluted,
      dividendsPerShare,
      rule40,
    },
    ratios: {
      pe:           snap(num(overview?.PERatio)),
      pb:           snap(num(overview?.PriceToBookRatio)),
      ps:           snap(num(overview?.PriceToSalesRatioTTM)),
      roe:          roeSeries,
      currentRatio,
      debtToEquity,
    },
    balance: {
      totalAssets:             toSeries(balanceRows, "totalAssets"),
      totalLiabilities:        toSeries(balanceRows, "totalLiabilities"),
      totalEquity:             toSeries(balanceRows, "totalShareholderEquity"),
      totalDebt:               toSeries(balanceRows, "shortLongTermDebtTotal"),
      cashAndShortTerm:        toSeries(balanceRows, "cashAndShortTermInvestments"),
      totalCurrentAssets:      toSeries(balanceRows, "totalCurrentAssets"),
      totalCurrentLiabilities: toSeries(balanceRows, "totalCurrentLiabilities"),
    },
    cashflow: {
      operatingCashFlow:      toSeries(cashflowRows, "operatingCashflow"),
      freeCashFlow,
      capitalExpenditures:    toSeries(cashflowRows, "capitalExpenditures"),
      stockBasedCompensation: toSeries(cashflowRows, "stockBasedCompensation"),
      netIncome:              toSeries(cashflowRows, "netIncome"),
    },
    missing,
  };
}
