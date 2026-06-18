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
    pe: SeriesPoint[];              // snapshot
    peHistorical: SeriesPoint[];    // annual avg price / annual EPS
    pfcfHistorical: SeriesPoint[];  // annual market cap / annual FCF
    psHistorical: SeriesPoint[];    // annual market cap / annual revenue
    pbHistorical: SeriesPoint[];    // annual market cap / annual equity
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

/** Group monthly price data into annual averages */
function groupByYear(timestamps: number[], closes: (number | null)[]): SeriesPoint[] {
  const byYear = new Map<number, number[]>();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null || !isFinite(c)) continue;
    const yr = new Date(timestamps[i] * 1000).getFullYear();
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(c);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, cs]) => ({
      date: String(year),
      value: +(cs.reduce((s, v) => s + v, 0) / cs.length).toFixed(2),
    }));
}

/** Fetch annual average closing prices — tries multiple sources */
export async function fetchAnnualPrices(ticker: string, years = 10): Promise<SeriesPoint[]> {
  const t  = ticker.trim().toUpperCase();
  const ck = `annual_prices_v3_${t}_${years}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  // ── 1. Yahoo Finance via multiple proxies (weekly data = more robust) ──
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1wk&range=${years}y`;
  const proxies  = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith('{')) continue; // HTML error page guard
      const json   = JSON.parse(text);
      const result = json?.chart?.result?.[0];
      if (result?.timestamp?.length > 0) {
        const ts: number[]          = result.timestamp;
        const cs: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
        const prices = groupByYear(ts, cs);
        if (prices.length > 0) { cacheSet(ck, prices); return prices; }
      }
    } catch { /* try next proxy */ }
  }

  // ── 2. Finnhub candles — weekly then daily ────────────────
  for (const resolution of ["W", "D"] as const) {
    try {
      const now  = Math.floor(Date.now() / 1000);
      const from = now - years * 365 * 24 * 3600;
      const data = await fhFetch("/stock/candle", { symbol: t, resolution, from: String(from), to: String(now) });
      if (data?.s !== "no_data" && data?.c?.length > 0) {
        const prices = groupByYear(data.t as number[], data.c as (number | null)[]);
        if (prices.length > 0) { cacheSet(ck, prices); return prices; }
      }
    } catch { /* try next */ }
  }

  return [];
}

/* ── Key Metrics snapshot ──────────────────────────────── */
export interface FinnhubKeyMetrics {
  pe:            number | null;  // P/E TTM
  ps:            number | null;  // P/S TTM
  pb:            number | null;  // P/B annual
  roe:           number | null;  // % TTM
  roa:           number | null;  // % TTM
  roi:           number | null;  // % TTM
  peg:           number | null;  // PEG annual (from Finnhub or computed)
  epsGrowth3Y:   number | null;  // EPS 3Y CAGR % (e.g. 15.5 = 15.5%)
  currentPrice:  number | null;
}

export async function fetchKeyMetrics(ticker: string): Promise<FinnhubKeyMetrics> {
  const t = ticker.trim().toUpperCase();
  const [metricsRaw, quoteRaw] = await Promise.all([
    fhFetch("/stock/metric", { symbol: t, metric: "all" }),
    fhFetch("/quote", { symbol: t }),
  ]);
  const m = metricsRaw?.metric ?? {};
  const pe           = n(m.peBasicExclExtraTTM ?? m.peTTM);
  const epsGrowth3Y  = n(m.epsGrowth3Y);  // already in % e.g. 15.5
  // PEG: use Finnhub's value or compute as P/E TTM / EPS growth 3Y
  const peg = n(m.pegAnnual) ??
    (pe !== null && epsGrowth3Y !== null && epsGrowth3Y !== 0
      ? +(pe / epsGrowth3Y).toFixed(2) : null);
  return {
    pe,
    ps:           n(m.psTTM ?? m.psAnnual),
    pb:           n(m.pbAnnual),
    roe:          n(m.roeTTM ?? m.roeAnnual),
    roa:          n(m.roaTTM ?? m.roaAnnual),
    roi:          n(m.roiTTM ?? m.roiAnnual),
    peg,
    epsGrowth3Y,
    currentPrice: n(quoteRaw?.c),
  };
}

export async function fetchFinnhubHistorical(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
): Promise<FinnhubHistoricalData> {
  const t = ticker.trim().toUpperCase();
  const freq = period === "quarterly" ? "quarterly" : "annual";

  const [profileRaw, finRaw, metricsRaw, quarterlyRaw] = await Promise.all([
    fhFetch("/stock/profile2", { symbol: t }),
    fhFetch("/stock/financials-reported", { symbol: t, freq }),
    fhFetch("/stock/metric", { symbol: t, metric: "all" }),
    // Always fetch quarterly for TTM computation (only when in annual mode)
    period === "annual"
      ? fhFetch("/stock/financials-reported", { symbol: t, freq: "quarterly" })
      : Promise.resolve(null),
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

  // ── Historical valuation ratios ───────────────────────────
  let peHistorical:   SeriesPoint[] = [];
  let pfcfHistorical: SeriesPoint[] = [];
  let psHistorical:   SeriesPoint[] = [];
  let pbHistorical:   SeriesPoint[] = [];

  // Helper: extract from Finnhub metric series (no extra API call — already in metricsRaw)
  const fromMetricSeries = (key: string): SeriesPoint[] => {
    const arr: { period: string; v: number }[] = metricsRaw?.series?.annual?.[key] ?? [];
    return arr
      .map((item) => ({
        date:  String(new Date(item.period).getFullYear()),
        value: +Number(item.v).toFixed(1),
      }))
      .filter((p) => p.value !== null && isFinite(p.value) && p.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // Try Finnhub metric series first (instant — already fetched)
  peHistorical = fromMetricSeries("peBasicExclExtraTTM") || fromMetricSeries("peTTM");
  psHistorical = fromMetricSeries("psTTM") || fromMetricSeries("psAnnual");
  pbHistorical = fromMetricSeries("pbAnnual");

  // For any ratio still empty (or for P/FCF which Finnhub doesn't provide), compute from annual prices
  try {
    const needsPrices = peHistorical.length === 0 || psHistorical.length === 0 ||
                        pbHistorical.length === 0;
    const annualPrices = await fetchAnnualPrices(t, 10);

    if (annualPrices.length > 0) {
      const priceMap  = new Map(annualPrices.map((p) => [p.date, p.value]));
      const sharesMap = new Map(sharesDiluted.map((p) => [p.date, p.value]));
      const mktCap    = (date: string): number | null => {
        const price  = priceMap.get(date);
        const shares = sharesMap.get(date);
        return price && shares ? price * shares : null;
      };

      if (peHistorical.length === 0) {
        peHistorical = eps
          .filter((e) => e.value !== null && e.value !== 0 && priceMap.has(e.date))
          .map((e) => ({ date: e.date, value: +(priceMap.get(e.date)! / e.value!).toFixed(1) }));
      }

      // P/FCF always computed (not in Finnhub series)
      pfcfHistorical = freeCashFlow
        .filter((r) => r.value !== null && r.value > 0 && priceMap.has(r.date) && sharesMap.has(r.date))
        .map((r) => { const mc = mktCap(r.date); return mc ? { date: r.date, value: +(mc / r.value!).toFixed(1) } : null; })
        .filter((p): p is SeriesPoint => p !== null);

      if (psHistorical.length === 0) {
        psHistorical = revenues
          .filter((r) => r.value !== null && r.value !== 0 && priceMap.has(r.date) && sharesMap.has(r.date))
          .map((r) => { const mc = mktCap(r.date); return mc ? { date: r.date, value: +(mc / r.value!).toFixed(1) } : null; })
          .filter((p): p is SeriesPoint => p !== null);
      }

      if (pbHistorical.length === 0) {
        pbHistorical = totalEquity
          .filter((r) => r.value !== null && r.value > 0 && priceMap.has(r.date) && sharesMap.has(r.date))
          .map((r) => { const mc = mktCap(r.date); return mc ? { date: r.date, value: +(mc / r.value!).toFixed(1) } : null; })
          .filter((p): p is SeriesPoint => p !== null);
      }

      void needsPrices; // used above
    }
  } catch { /* non-fatal */ }

  // ── TTM from last 4 quarters ──────────────────────────────
  const qSource = period === "annual" ? quarterlyRaw : finRaw;
  const qReports: any[] = (qSource?.data ?? [])
    .filter((r: any) => r.quarter !== 0)
    .sort((a: any, b: any) => a.year !== b.year ? b.year - a.year : b.quarter - a.quarter)
    .slice(0, 4);

  const sumQ = (...concepts: string[]): number | null => {
    const vals = qReports.map((r) => findConcept(ic(r), ...concepts));
    if (vals.every((v) => v === null)) return null;
    return vals.reduce((s, v) => (s ?? 0) + (v ?? 0), 0 as number);
  };
  const sumQCF = (...concepts: string[]): number | null => {
    const vals = qReports.map((r) => findConcept(cf(r), ...concepts));
    if (vals.every((v) => v === null)) return null;
    return vals.reduce((s, v) => (s ?? 0) + (v ?? 0), 0 as number);
  };

  const ttmLabel = "TTM";

  // TTM income
  const ttmRevenue  = sumQ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueNet");
  const ttmGross    = sumQ("GrossProfit");
  const ttmOp       = sumQ("OperatingIncomeLoss");
  const ttmNet      = sumQ("NetIncomeLoss", "NetIncome");
  const ttmEPS      = n(m.epsBasicExclExtraItemsTTM ?? m.epsInclExtraItemsTTM);
  const ttmOCF      = sumQCF("NetCashProvidedByUsedInOperatingActivities");
  const ttmCapex    = sumQCF("PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures");
  const ttmSBC      = sumQCF("ShareBasedCompensation", "AllocatedShareBasedCompensationExpense");
  const ttmFCF      = ttmOCF !== null && ttmCapex !== null ? ttmOCF - Math.abs(ttmCapex) : null;
  const ttmNI_CF    = sumQCF("NetIncomeLoss", "NetIncome");

  // Use Finnhub TTM metrics for margins (more accurate)
  const ttmNetMargin  = n(m.netProfitMarginTTM);
  const ttmGrossMargin= n(m.grossMarginTTM);

  const addTTM = (series: SeriesPoint[], val: number | null): SeriesPoint[] =>
    val !== null ? [...series, { date: ttmLabel, value: val }] : series;

  const revenuesFinal        = addTTM(revenues,        ttmRevenue);
  const grossProfitFinal     = addTTM(grossProfit,     ttmGross);
  const operatingIncomeFinal = addTTM(operatingIncome, ttmOp);
  const netIncomeFinal       = addTTM(netIncome,       ttmNet);
  const epsFinal             = addTTM(eps,             ttmEPS);
  const ocfFinal             = addTTM(operatingCashFlow, ttmOCF);
  const capexFinal           = addTTM(capitalExpenditures, ttmCapex);
  const sbcFinal             = addTTM(stockBasedComp,  ttmSBC);
  const fcfFinal             = addTTM(freeCashFlow,    ttmFCF);
  const cfNIFinal            = addTTM(cfNetIncome,     ttmNI_CF);

  return {
    ticker: t,
    companyName: profileRaw?.name ?? null,
    income:  { revenues: revenuesFinal, grossProfit: grossProfitFinal, operatingIncome: operatingIncomeFinal, netIncome: netIncomeFinal, eps: epsFinal, sharesDiluted, dividendsPerShare, rule40 },
    ratios:  {
      pe:             snap(n(m.peBasicExclExtraTTM ?? m.peTTM)),
      peHistorical,
      pfcfHistorical,
      psHistorical,
      pbHistorical,
      pb:             snap(n(m.pbAnnual)),
      ps:             snap(n(m.psTTM)),
      roe,
      currentRatio,
      debtToEquity,
    },
    balance:  { totalAssets, totalLiabilities, totalEquity, totalDebt, cashAndShortTerm, totalCurrentAssets, totalCurrentLiabilities },
    cashflow: { operatingCashFlow: ocfFinal, freeCashFlow: fcfFinal, capitalExpenditures: capexFinal, stockBasedCompensation: sbcFinal, netIncome: cfNIFinal },
    missing,
  };
}
