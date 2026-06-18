/**
 * Key metrics service — Yahoo Finance quoteSummary API (primary) + Finnhub ROI fallback.
 * Same data that Finviz shows, via a proper JSON API instead of HTML scraping.
 * Cache: 1 hour.
 */

const CACHE_PREFIX = "kmetrics_v1_";
const CACHE_TTL    = 60 * 60 * 1000; // 1 h

const cacheGet = (k: string): any | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + k);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + k); return null; }
    return data;
  } catch { return null; }
};

const cacheSet = (k: string, data: any) => {
  try { localStorage.setItem(CACHE_PREFIX + k, JSON.stringify({ ts: Date.now(), data })); } catch {}
};

const n = (v: any): number | null => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : null;
};

/* ── Public interface ────────────────────────────────────── */
export interface FinvizMetrics {
  pe:              number | null;
  forwardPE:       number | null;
  peg:             number | null;
  ps:              number | null;
  pb:              number | null;
  pfcf:            number | null;
  roe:             number | null;  // %
  roa:             number | null;  // %
  roi:             number | null;  // %
  epsGrowthNext5Y: number | null;  // % (for Forward PEG)
}

const NULL_METRICS: FinvizMetrics = {
  pe: null, forwardPE: null, peg: null, ps: null, pb: null,
  pfcf: null, roe: null, roa: null, roi: null, epsGrowthNext5Y: null,
};

/* ── Yahoo Finance quoteSummary ───────────────────────────── */
async function fetchYahooMetrics(ticker: string): Promise<FinvizMetrics | null> {
  const t = ticker.trim().toUpperCase();
  const modules = "summaryDetail,defaultKeyStatistics,financialData,earningsTrend";
  const url   = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${modules}`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue;

      const json   = JSON.parse(text);
      const result = json?.quoteSummary?.result?.[0];
      if (!result) continue;

      const sd  = result.summaryDetail       ?? {};
      const ks  = result.defaultKeyStatistics ?? {};
      const fd  = result.financialData       ?? {};
      const et  = result.earningsTrend?.result?.[0]?.trend ?? [];

      // P/FCF = market cap / free cash flow
      const marketCap  = n(sd.marketCap?.raw);
      const fcf        = n(fd.freeCashflow?.raw);
      const pfcf       = marketCap && fcf && fcf > 0 ? +(marketCap / fcf).toFixed(1) : null;

      // ROE & ROA come as decimals (e.g. 0.30 = 30%)
      const roe = n(fd.returnOnEquity?.raw);
      const roa = n(fd.returnOnAssets?.raw);

      // EPS growth next 5Y from earningsTrend
      const trend5y = et.find((t: any) => t.period === "+5y");
      const eps5y   = n(trend5y?.growth?.raw);  // e.g. 0.1523 = 15.23%

      const metrics: FinvizMetrics = {
        pe:              n(sd.trailingPE?.raw),
        forwardPE:       n(sd.forwardPE?.raw),
        peg:             n(ks.pegRatio?.raw),
        ps:              n(sd.priceToSalesTrailing12Months?.raw),
        pb:              n(ks.priceToBook?.raw),
        pfcf,
        roe:             roe !== null ? +(roe * 100).toFixed(1) : null,
        roa:             roa !== null ? +(roa * 100).toFixed(1) : null,
        roi:             null,  // not in Yahoo Finance; filled from Finnhub below
        epsGrowthNext5Y: eps5y !== null ? +(eps5y * 100).toFixed(2) : null,
      };

      if (metrics.pe !== null || metrics.ps !== null || metrics.roe !== null) {
        return metrics;
      }
    } catch { /* try next proxy */ }
  }
  return null;
}

/* ── Finnhub ROI (uses the key already stored in localStorage) ── */
async function fetchFinnhubROI(ticker: string): Promise<number | null> {
  try {
    const key = localStorage.getItem("fh_api_key") ?? "";
    if (!key) return null;
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker.toUpperCase()}&metric=all&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const m    = json?.metric ?? {};
    const roi  = m.roiTTM ?? m.roiAnnual ?? null;
    return roi !== null && isFinite(Number(roi)) ? +Number(roi).toFixed(1) : null;
  } catch { return null; }
}

/* ── Public fetch ─────────────────────────────────────────── */
export async function fetchFinvizMetrics(ticker: string): Promise<FinvizMetrics> {
  const t = ticker.trim().toUpperCase();

  const cached = cacheGet(t);
  if (cached) return cached;

  const [yahoo, roi] = await Promise.all([
    fetchYahooMetrics(t),
    fetchFinnhubROI(t),
  ]);

  if (!yahoo) return NULL_METRICS;

  const result: FinvizMetrics = { ...yahoo, roi };
  cacheSet(t, result);
  return result;
}
