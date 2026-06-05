/**
 * Yahoo Finance direct API service — no API key required.
 * Uses the public quoteSummary & chart endpoints.
 */

const BASE = "https://query2.finance.yahoo.com";
// CORS proxy for browser-side requests
const PROXY = "https://corsproxy.io/?url=";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yFetch = async (url: string): Promise<any> => {
  // Try direct first (works in some environments), fallback to proxy
  const tryFetch = async (target: string) => {
    const res = await fetch(target, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`שגיאה ${res.status}`);
    return res.json();
  };
  try {
    return await tryFetch(url);
  } catch {
    return await tryFetch(`${PROXY}${encodeURIComponent(url)}`);
  }
};

/* ─── Basic stock snapshot ─────────────────────────────────── */
export interface YahooStockData {
  companyName: string | null;
  currentPrice: number | null;
  marketCap: number | null;       // billions USD
  baseRevenue: number | null;     // billions USD
  netMargin: number | null;       // 0..1
  baseEPS: number | null;
  revenueGrowth: number | null;   // 0..1
  epsGrowth: number | null;       // 0..1
  grossMargin: number | null;     // 0..1
  operatingMargin: number | null; // 0..1
  missing: string[];
}

export async function fetchStockSnapshot(ticker: string): Promise<YahooStockData> {
  const t = ticker.trim().toUpperCase();
  const url =
    `${BASE}/v10/finance/quoteSummary/${t}` +
    `?modules=price,financialData,defaultKeyStatistics,incomeStatementHistory`;

  const json = await yFetch(url);
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error(`לא נמצאו נתונים עבור ${t}`);

  const price   = result.price ?? {};
  const finData = result.financialData ?? {};
  const stats   = result.defaultKeyStatistics ?? {};
  const income  = result.incomeStatementHistory?.incomeStatementHistory ?? [];

  const n = (v: { raw?: number } | undefined | null): number | null =>
    typeof v?.raw === "number" ? v.raw : null;

  const missing: string[] = [];
  const check = <T,>(val: T, label: string): T => {
    if (val === null || val === undefined) missing.push(label);
    return val;
  };

  // Revenue growth YoY from historical
  let revenueGrowth = n(finData.revenueGrowth) ?? null;
  if (revenueGrowth === null && income.length >= 2) {
    const cur  = n(income[0]?.totalRevenue);
    const prev = n(income[1]?.totalRevenue);
    if (cur && prev && prev !== 0) revenueGrowth = (cur - prev) / Math.abs(prev);
  }

  // EPS growth from stats or compute
  const trailingEps = n(stats.trailingEps);
  const forwardEps  = n(stats.forwardEpsOneyear ?? stats.forwardEps);
  let epsGrowth: number | null = null;
  if (trailingEps && forwardEps && trailingEps !== 0) {
    epsGrowth = (forwardEps - trailingEps) / Math.abs(trailingEps);
  }

  return {
    companyName:     check(price.longName ?? price.shortName ?? null, "שם חברה"),
    currentPrice:    check(n(price.regularMarketPrice), "מחיר נוכחי"),
    marketCap:       n(price.marketCap) !== null ? (n(price.marketCap)! / 1e9) : check(null, "שווי שוק"),
    baseRevenue:     n(finData.totalRevenue) !== null ? (n(finData.totalRevenue)! / 1e9) : check(null, "הכנסות"),
    netMargin:       check(n(finData.profitMargins), "שולי רווח נקי"),
    baseEPS:         check(trailingEps, "EPS"),
    revenueGrowth:   check(revenueGrowth, "צמיחת הכנסות"),
    epsGrowth:       epsGrowth,
    grossMargin:     n(finData.grossMargins),
    operatingMargin: n(finData.operatingMargins),
    missing,
  };
}

/* ─── Historical financials ────────────────────────────────── */
export interface SeriesPoint { date: string; value: number | null }

export interface HistoricalDashboard {
  ticker: string;
  companyName: string | null;
  income: {
    revenues: SeriesPoint[];
    grossProfit: SeriesPoint[];
    operatingIncome: SeriesPoint[];
    netIncome: SeriesPoint[];
    eps: SeriesPoint[];
  };
  ratios: {
    pe: SeriesPoint[];
    ps: SeriesPoint[];
    pb: SeriesPoint[];
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
  };
  cashflow: {
    operatingCashFlow: SeriesPoint[];
    freeCashFlow: SeriesPoint[];
    capitalExpenditures: SeriesPoint[];
    netIncome: SeriesPoint[];
  };
  missing: string[];
}

const toDate = (epoch: number | null): string => {
  if (!epoch) return "";
  return new Date(epoch * 1000).getFullYear().toString();
};

export async function fetchHistoricalDashboard(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
): Promise<HistoricalDashboard> {
  const t = ticker.trim().toUpperCase();
  const modules = [
    "price",
    "incomeStatementHistory",
    "incomeStatementHistoryQuarterly",
    "balanceSheetHistory",
    "balanceSheetHistoryQuarterly",
    "cashflowStatementHistory",
    "cashflowStatementHistoryQuarterly",
    "financialData",
    "defaultKeyStatistics",
  ].join(",");

  const url = `${BASE}/v10/finance/quoteSummary/${t}?modules=${modules}`;
  const json = await yFetch(url);
  const r = json?.quoteSummary?.result?.[0];
  if (!r) throw new Error(`לא נמצאו נתונים היסטוריים עבור ${t}`);

  const isQ = period === "quarterly";
  const incRows: any[] = isQ
    ? (r.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [])
    : (r.incomeStatementHistory?.incomeStatementHistory ?? []);
  const balRows: any[] = isQ
    ? (r.balanceSheetHistoryQuarterly?.balanceSheetStatements ?? [])
    : (r.balanceSheetHistory?.balanceSheetStatements ?? []);
  const cfRows: any[] = isQ
    ? (r.cashflowStatementHistoryQuarterly?.cashflowStatements ?? [])
    : (r.cashflowStatementHistory?.cashflowStatements ?? []);

  const price   = r.price ?? {};
  const finData = r.financialData ?? {};
  const stats   = r.defaultKeyStatistics ?? {};

  const n = (v: any): number | null =>
    typeof v?.raw === "number" ? v.raw : null;

  const toSeries = (rows: any[], field: string): SeriesPoint[] =>
    [...rows]
      .reverse()
      .map((row) => ({ date: toDate(n(row.endDate)), value: n(row[field]) }));

  // Build income series
  const revenues        = toSeries(incRows, "totalRevenue");
  const grossProfit     = toSeries(incRows, "grossProfit");
  const operatingIncome = toSeries(incRows, "ebit");
  const netIncome       = toSeries(incRows, "netIncome");
  const eps             = toSeries(incRows, "basicEps");

  // Balance
  const totalAssets      = toSeries(balRows, "totalAssets");
  const totalLiabilities = toSeries(balRows, "totalLiab");
  const totalEquity      = toSeries(balRows, "totalStockholderEquity");
  const totalDebt        = toSeries(balRows, "longTermDebt");
  const cashAndShortTerm = toSeries(balRows, "cash");

  // Cashflow
  const operatingCashFlow  = toSeries(cfRows, "totalCashFromOperatingActivities");
  const capitalExpenditures = toSeries(cfRows, "capitalExpenditures");
  const cfNetIncome         = toSeries(cfRows, "netIncome");
  const freeCashFlow: SeriesPoint[] = [...cfRows].reverse().map((row) => {
    const ocf   = n(row.totalCashFromOperatingActivities);
    const capex = n(row.capitalExpenditures);
    return {
      date: toDate(n(row.endDate)),
      value: ocf !== null && capex !== null ? ocf + capex : null, // capex is negative in Yahoo
    };
  });

  // Ratios — compute ROE, current ratio, D/E from balance + income
  const roeSeries: SeriesPoint[] = [...balRows].reverse().map((bRow, i) => {
    const iRow = [...incRows].reverse()[i];
    const ni = n(iRow?.netIncome);
    const eq = n(bRow?.totalStockholderEquity);
    return { date: toDate(n(bRow.endDate)), value: ni !== null && eq && eq !== 0 ? ni / eq : null };
  });

  const currentRatio: SeriesPoint[] = [...balRows].reverse().map((bRow) => {
    const ca = n(bRow.totalCurrentAssets);
    const cl = n(bRow.totalCurrentLiabilities);
    return { date: toDate(n(bRow.endDate)), value: ca !== null && cl && cl !== 0 ? ca / cl : null };
  });

  const debtToEquity: SeriesPoint[] = [...balRows].reverse().map((bRow) => {
    const td = n(bRow.longTermDebt);
    const eq = n(bRow.totalStockholderEquity);
    return { date: toDate(n(bRow.endDate)), value: td !== null && eq && eq !== 0 ? td / eq : null };
  });

  // Snapshot ratios
  const snap = (v: number | null): SeriesPoint[] =>
    v !== null ? [{ date: "כעת", value: v }] : [];

  const missing: string[] = [];
  if (!revenues.some((p) => p.value !== null)) missing.push("הכנסות");
  if (!netIncome.some((p) => p.value !== null)) missing.push("רווח נקי");

  return {
    ticker: t,
    companyName: price.longName ?? price.shortName ?? null,
    income:  { revenues, grossProfit, operatingIncome, netIncome, eps },
    ratios:  {
      pe:            snap(n(stats.trailingPE) ?? n(stats.forwardPE)),
      ps:            snap(n(stats.priceToSalesTrailing12Months)),
      pb:            snap(n(stats.priceToBook)),
      roe:           roeSeries,
      currentRatio,
      debtToEquity,
    },
    balance: { totalAssets, totalLiabilities, totalEquity, totalDebt, cashAndShortTerm },
    cashflow: { operatingCashFlow, freeCashFlow, capitalExpenditures, netIncome: cfNetIncome },
    missing,
  };
}
