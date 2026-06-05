/**
 * Finnhub direct frontend service.
 * Free tier: 60 requests/minute — no daily limit.
 * API key stored in localStorage under "fh_api_key".
 */

const BASE = "https://finnhub.io/api/v1";
const STORAGE_KEY = "fh_api_key";

export const getFinnhubKey = (): string =>
  localStorage.getItem(STORAGE_KEY) ?? "";

export const setFinnhubKey = (key: string) =>
  localStorage.setItem(STORAGE_KEY, key.trim());

/* ── Cache (24h) ───────────────────────────────────────── */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheGet = (k: string): any | null => {
  try {
    const raw = localStorage.getItem("fh_cache_" + k);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem("fh_cache_" + k); return null; }
    return data;
  } catch { return null; }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheSet = (k: string, data: any) => {
  try { localStorage.setItem("fh_cache_" + k, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fhFetch = async (path: string, params: Record<string, string> = {}): Promise<any> => {
  const key = getFinnhubKey();
  if (!key) throw new Error("לא הוגדר מפתח Finnhub");

  const ck = path + JSON.stringify(params);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("token", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (res.status === 429) throw new Error("הגעת למגבלת הבקשות. המתן דקה ונסה שוב.");
  if (!res.ok) throw new Error(`Finnhub שגיאה ${res.status}`);
  const json = await res.json();
  cacheSet(ck, json);
  return json;
};

/* ── Helpers ───────────────────────────────────────────── */
const n = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};

export interface SeriesPoint { date: string; value: number | null }

/** Parse Finnhub's financials-reported statement items array */
const findConcept = (items: any[], ...concepts: string[]): number | null => {
  for (const concept of concepts) {
    const item = items?.find((i: any) =>
      i.concept?.toLowerCase().includes(concept.toLowerCase())
    );
    if (item && n(item.value) !== null) return n(item.value);
  }
  return null;
};

/* ── Snapshot ──────────────────────────────────────────── */
export interface FinnhubSnapshot {
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

export async function fetchFinnhubSnapshot(ticker: string): Promise<FinnhubSnapshot> {
  const t = ticker.trim().toUpperCase();

  const [profile, quote, metrics] = await Promise.all([
    fhFetch("/stock/profile2", { symbol: t }),
    fhFetch("/quote",          { symbol: t }),
    fhFetch("/stock/metric",   { symbol: t, metric: "all" }),
  ]);

  const m = metrics?.metric ?? {};
  const missing: string[] = [];
  const check = <T,>(v: T, label: string): T => { if (v === null || v === undefined) missing.push(label); return v; };

  const mktCap = n(profile?.marketCapitalization); // already in millions
  const revenue = n(m.revenuePerShareTTM) !== null && n(m.shareFloat) !== null
    ? null  // skip - unreliable
    : null;

  // Get revenue from financials-reported
  let baseRevenue: number | null = null;
  let netMargin: number | null = n(m.netProfitMarginTTM) !== null ? n(m.netProfitMarginTTM)! / 100 : null;
  let grossMargin: number | null = n(m.grossMarginTTM) !== null ? n(m.grossMarginTTM)! / 100 : null;
  let operatingMargin: number | null = n(m.operatingMarginTTM) !== null ? n(m.operatingMarginTTM)! / 100 : null;

  try {
    const fin = await fhFetch("/stock/financials-reported", { symbol: t, freq: "annual" });
    const latest = fin?.data?.[0]?.report?.ic ?? [];
    const rev = findConcept(latest,
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues", "SalesRevenueNet", "RevenueNet", "Revenue"
    );
    if (rev) baseRevenue = rev / 1e9;
  } catch { /* fallback */ }

  return {
    companyName:     check(profile?.name ?? null, "שם חברה"),
    currentPrice:    check(n(quote?.c), "מחיר נוכחי"),
    marketCap:       mktCap !== null ? mktCap / 1000 : check(null, "שווי שוק"), // millions → billions
    baseRevenue:     check(baseRevenue, "הכנסות"),
    netMargin,
    grossMargin,
    operatingMargin,
    baseEPS:         check(n(m.epsBasicExclExtraItemsTTM ?? m.epsInclExtraItemsTTM), "EPS"),
    revenueGrowth:   n(m.revenueGrowth3Y) !== null ? n(m.revenueGrowth3Y)! / 100 : null,
    epsGrowth:       n(m.epsGrowth3Y) !== null ? n(m.epsGrowth3Y)! / 100 : null,
    missing,
  };
}

/* ── Historical Data ───────────────────────────────────── */
export interface FinnhubHistoricalData {
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
    rule40: SeriesPoint[];
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

export async function fetchFinnhubHistorical(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
): Promise<FinnhubHistoricalData> {
  const t = ticker.trim().toUpperCase();
  const freq = period === "quarterly" ? "quarterly" : "annual";

  const [profileRaw, finRaw, metricsRaw] = await Promise.all([
    fhFetch("/stock/profile2", { symbol: t }),
    fhFetch("/stock/financials-reported", { symbol: t, freq }),
    fhFetch("/stock/metric", { symbol: t, metric: "all" }),
  ]);

  const reports: any[] = (finRaw?.data ?? [])
    .filter((r: any) => period === "quarterly" ? r.quarter !== 0 : (r.quarter === 0 || r.freq === "annual"))
    .sort((a: any, b: any) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter)
    .slice(-12);

  const m = metricsRaw?.metric ?? {};

  const ic = (r: any) => r?.report?.ic ?? [];
  const bs = (r: any) => r?.report?.bs ?? [];
  const cf = (r: any) => r?.report?.cf ?? [];

  const getIC = (r: any, ...concepts: string[]) => findConcept(ic(r), ...concepts);
  const getBS = (r: any, ...concepts: string[]) => findConcept(bs(r), ...concepts);
  const getCF = (r: any, ...concepts: string[]) => findConcept(cf(r), ...concepts);

  const date = (r: any): string =>
    period === "quarterly" && r.quarter
      ? `${r.year} Q${r.quarter}`
      : String(r.year ?? r.period?.slice(0, 4) ?? "");

  // Income
  const revenues        = reports.map((r) => ({ date: date(r), value: getIC(r, "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueNet") }));
  const grossProfit     = reports.map((r) => ({ date: date(r), value: getIC(r, "GrossProfit") }));
  const operatingIncome = reports.map((r) => ({ date: date(r), value: getIC(r, "OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest") }));
  const netIncome       = reports.map((r) => ({ date: date(r), value: getIC(r, "NetIncomeLoss", "NetIncome") }));
  const eps             = reports.map((r) => ({ date: date(r), value: getIC(r, "EarningsPerShareBasic", "EarningsPerShareDiluted") }));
  const sharesDiluted   = reports.map((r) => ({ date: date(r), value: getIC(r, "WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic") }));

  // Dividends per share
  const dividendsPerShare = reports.map((r) => {
    const div    = getCF(r, "PaymentsOfDividendsCommonStock", "PaymentsOfDividends");
    const shares = getIC(r, "WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfDilutedSharesOutstanding");
    return { date: date(r), value: div && shares && shares > 0 ? Math.abs(div) / shares : 0 };
  });

  // Rule of 40
  const rule40 = revenues.map((rev, i) => {
    const prevRev = i > 0 ? revenues[i - 1].value : null;
    const ni      = netIncome[i].value;
    const revGrowth = prevRev && prevRev !== 0 && rev.value !== null ? ((rev.value - prevRev) / Math.abs(prevRev)) * 100 : null;
    const margin    = rev.value && rev.value !== 0 && ni !== null ? (ni / rev.value) * 100 : null;
    return { date: rev.date, value: revGrowth !== null && margin !== null ? revGrowth + margin : null };
  });

  // Balance
  const totalAssets             = reports.map((r) => ({ date: date(r), value: getBS(r, "Assets") }));
  const totalLiabilities        = reports.map((r) => ({ date: date(r), value: getBS(r, "Liabilities") }));
  const totalEquity             = reports.map((r) => ({ date: date(r), value: getBS(r, "StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest") }));
  const totalDebt               = reports.map((r) => ({ date: date(r), value: getBS(r, "LongTermDebtNoncurrent", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligation") }));
  const cashAndShortTerm        = reports.map((r) => ({ date: date(r), value: getBS(r, "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments") }));
  const totalCurrentAssets      = reports.map((r) => ({ date: date(r), value: getBS(r, "AssetsCurrent") }));
  const totalCurrentLiabilities = reports.map((r) => ({ date: date(r), value: getBS(r, "LiabilitiesCurrent") }));

  // Ratios derived
  const roe = reports.map((r, i) => {
    const ni = netIncome[i].value;
    const eq = totalEquity[i].value;
    return { date: date(r), value: ni !== null && eq && eq !== 0 ? ni / eq : null };
  });
  const currentRatio = reports.map((r, i) => {
    const ca = totalCurrentAssets[i].value;
    const cl = totalCurrentLiabilities[i].value;
    return { date: date(r), value: ca !== null && cl && cl !== 0 ? ca / cl : null };
  });
  const debtToEquity = reports.map((r, i) => {
    const td = totalDebt[i].value;
    const eq = totalEquity[i].value;
    return { date: date(r), value: td !== null && eq && eq !== 0 ? td / eq : null };
  });

  // Cashflow
  const operatingCashFlow   = reports.map((r) => ({ date: date(r), value: getCF(r, "NetCashProvidedByUsedInOperatingActivities") }));
  const capitalExpenditures = reports.map((r) => ({ date: date(r), value: getCF(r, "PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures") }));
  const cfNetIncome         = reports.map((r) => ({ date: date(r), value: getCF(r, "NetIncomeLoss", "NetIncome") }));
  const stockBasedComp      = reports.map((r) => ({ date: date(r), value: getCF(r, "ShareBasedCompensation", "AllocatedShareBasedCompensationExpense") }));

  const freeCashFlow = operatingCashFlow.map((ocf, i) => {
    const capex = capitalExpenditures[i].value;
    return { date: ocf.date, value: ocf.value !== null && capex !== null ? ocf.value - Math.abs(capex) : null };
  });

  // Snapshot ratios
  const snap = (v: number | null): SeriesPoint[] =>
    v !== null ? [{ date: "כעת", value: v }] : [];

  const missing: string[] = [];
  if (!reports.length) missing.push("אין דוחות כספיים");

  return {
    ticker: t,
    companyName: profileRaw?.name ?? null,
    income:  { revenues, grossProfit, operatingIncome, netIncome, eps, sharesDiluted, dividendsPerShare, rule40 },
    ratios:  {
      pe:           snap(n(m.peBasicExclExtraTTM ?? m.peTTM)),
      pb:           snap(n(m.pbAnnual)),
      ps:           snap(n(m.psTTM)),
      roe,
      currentRatio,
      debtToEquity,
    },
    balance:  { totalAssets, totalLiabilities, totalEquity, totalDebt, cashAndShortTerm, totalCurrentAssets, totalCurrentLiabilities },
    cashflow: { operatingCashFlow, freeCashFlow, capitalExpenditures, stockBasedCompensation: stockBasedComp, netIncome: cfNetIncome },
    missing,
  };
}
