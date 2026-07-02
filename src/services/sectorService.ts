/**
 * sectorService — fetches daily & weekly % change for sector ETFs and
 * individual stocks via Stooq (free, no CORS, no API key needed).
 *
 * Stooq daily CSV: https://stooq.com/q/d/l/?s=xlk.us&i=d&d1=YYYYMMDD&d2=YYYYMMDD
 * Columns: Date, Open, High, Low, Close, Volume
 */

export interface QuotePerf {
  ticker:  string;
  close:   number;    // latest close
  dayPct:  number;    // % vs previous close
  weekPct: number;    // % vs close ~5 trading days ago
}

// Cache: 15 minutes
const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map<string, { ts: number; data: QuotePerf }>();

function cacheKey(ticker: string) {
  return `sector_${ticker.toLowerCase()}`;
}

/** Format date as YYYYMMDD for Stooq */
function toStooqDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Fetch last N calendar days of daily closes from Stooq */
async function fetchStooqDaily(ticker: string, calendarDays = 20): Promise<{ date: string; close: number }[]> {
  const ck = cacheKey(ticker);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return []; // already fresh — caller uses cache

  const today   = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - calendarDays);

  // Stooq uses {ticker}.us for US equities/ETFs
  const sym = ticker.toLowerCase().replace("-", "-") + ".us";
  const url  = `https://stooq.com/q/d/l/?s=${sym}&i=d&d1=${toStooqDate(fromDate)}&d2=${toStooqDate(today)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes(",") || text.toLowerCase().includes("no data")) return [];

    // Parse CSV (skip header line)
    const rows = text.trim().split("\n").slice(1);
    const result: { date: string; close: number }[] = [];
    for (const row of rows) {
      const cols  = row.split(",");
      const date  = cols[0]?.trim();
      const close = parseFloat(cols[4]?.trim() ?? "");
      if (date && isFinite(close) && close > 0) {
        result.push({ date, close });
      }
    }
    // Sort ascending (oldest first)
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  } catch {
    return [];
  }
}

/** Compute QuotePerf from a sorted array of daily prices */
function toPerf(ticker: string, rows: { date: string; close: number }[]): QuotePerf | null {
  if (rows.length < 2) return null;

  const latest  = rows[rows.length - 1].close;
  const prevDay = rows[rows.length - 2].close;

  // Weekly = ~5 trading days ago; clamp to first available
  const weekIdx  = Math.max(0, rows.length - 6);
  const weekAgo  = rows[weekIdx].close;

  return {
    ticker,
    close:   latest,
    dayPct:  +((latest - prevDay) / prevDay * 100).toFixed(2),
    weekPct: +((latest - weekAgo)  / weekAgo  * 100).toFixed(2),
  };
}

/** Fetch perf for a single ticker (with internal cache) */
export async function fetchPerf(ticker: string): Promise<QuotePerf | null> {
  // Check memory cache
  const ck  = cacheKey(ticker);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const rows = await fetchStooqDaily(ticker, 20);
  const perf = toPerf(ticker, rows);
  if (perf) cache.set(ck, { ts: Date.now(), data: perf });
  return perf;
}

/** Fetch all ETF perfs in parallel */
export async function fetchAllEtfPerfs(etfs: string[]): Promise<Map<string, QuotePerf>> {
  const results = await Promise.all(etfs.map((etf) => fetchPerf(etf).then((p) => [etf, p] as const)));
  const map = new Map<string, QuotePerf>();
  for (const [etf, perf] of results) {
    if (perf) map.set(etf, perf);
  }
  return map;
}

/** Fetch sector stock perfs, return sorted by |dayPct| desc */
export async function fetchSectorTopMovers(
  stocks: string[],
  sortBy: "day" | "week" = "day"
): Promise<QuotePerf[]> {
  const results = await Promise.all(stocks.map((s) => fetchPerf(s)));
  return results
    .filter((p): p is QuotePerf => p !== null)
    .sort((a, b) =>
      sortBy === "day"
        ? Math.abs(b.dayPct)  - Math.abs(a.dayPct)
        : Math.abs(b.weekPct) - Math.abs(a.weekPct)
    );
}
