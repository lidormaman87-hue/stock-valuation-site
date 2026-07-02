/**
 * sectorService — daily & weekly % for sector ETFs and sector stocks.
 *
 * Daily %  → Finnhub /quote (dp field) — real-time, exact
 * Weekly % → Stooq weekly CSV (i=w), last 5 bars — free, no CORS
 */
import { getFinnhubKey } from "@/services/finnhubService";

export interface QuotePerf {
  ticker:  string;
  close:   number;
  dayPct:  number;   // daily % change
}

/* ── In-memory cache (15 min) ─────────────────────────── */
const CACHE_TTL = 15 * 60 * 1000;
interface CacheEntry { ts: number; data: QuotePerf }
const perfCache = new Map<string, CacheEntry>();

function fromCache(ticker: string): QuotePerf | null {
  const hit = perfCache.get(ticker.toUpperCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}
function toCache(perf: QuotePerf) {
  perfCache.set(perf.ticker.toUpperCase(), { ts: Date.now(), data: perf });
}

/* ── Finnhub quote (daily %) ──────────────────────────── */
async function fetchFinnhubQuote(
  ticker: string
): Promise<{ close: number; dayPct: number } | null> {
  const key = getFinnhubKey();
  if (!key) return null;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const j = await res.json();
    // c = current, dp = % change, d = absolute change
    if (typeof j.c !== "number" || j.c === 0) return null;
    return { close: j.c, dayPct: +(j.dp ?? 0).toFixed(2) };
  } catch {
    return null;
  }
}

/* ── Main: fetch single ticker perf ──────────────────── */
export async function fetchPerf(ticker: string): Promise<QuotePerf | null> {
  const t = ticker.trim().toUpperCase();
  const cached = fromCache(t);
  if (cached) return cached;

  const quote = await fetchFinnhubQuote(t);
  if (!quote) return null;

  const perf: QuotePerf = { ticker: t, close: quote.close, dayPct: quote.dayPct };
  toCache(perf);
  return perf;
}

/* ── Fetch all ETF perfs in parallel ─────────────────── */
export async function fetchAllEtfPerfs(etfs: string[]): Promise<Map<string, QuotePerf>> {
  const results = await Promise.all(
    etfs.map((etf) => fetchPerf(etf).then((p) => [etf, p] as const))
  );
  const map = new Map<string, QuotePerf>();
  for (const [etf, perf] of results) {
    if (perf) map.set(etf, perf);
  }
  return map;
}

/* ── Sector top movers ───────────────────────────────── */
export async function fetchSectorTopMovers(stocks: string[]): Promise<QuotePerf[]> {
  const results = await Promise.all(stocks.map((s) => fetchPerf(s)));
  return results
    .filter((p): p is QuotePerf => p !== null)
    .sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct));
}
