/**
 * macrotrendsService — fetches historical P/E, P/S, P/B, P/FCF from MacroTrends.
 *
 * URL pattern:
 *   https://www.macrotrends.net/stocks/charts/{TICKER}/{SLUG}/{METRIC}
 *
 * The data is embedded directly in the HTML table (server-side rendered),
 * so a CORS proxy is sufficient — no JS execution needed.
 *
 * Cache: 24 hours per ticker.
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;

/* ── Types ─────────────────────────────────────────────────── */
export interface RatioPoint {
  year:  number;
  value: number;
}

export interface MacrotrendsHistorical {
  pe:   RatioPoint[];
  ps:   RatioPoint[];
  pb:   RatioPoint[];
  pfcf: RatioPoint[];
  slug: string;  // resolved slug (for debugging)
}

/* ── Slug conversion ────────────────────────────────────────── */
/**
 * Convert a Finnhub company name → macrotrends URL slug.
 * Examples:
 *   "Amazon.com Inc"          → "amazon"
 *   "Apple Inc"               → "apple"
 *   "Meta Platforms Inc"      → "meta-platforms"
 *   "Booking Holdings Inc"    → "booking-holdings"
 *   "JPMorgan Chase & Co."    → "jpmorgan-chase"
 *   "Johnson & Johnson"       → "johnson-johnson"
 *   "NVIDIA Corporation"      → "nvidia"
 *   "3M Company"              → "3m"
 */
export function nameToSlug(name: string): string {
  let s = name.toLowerCase();

  // "Amazon.com Inc" → "amazon" (remove .com domain and everything after)
  s = s.replace(/\.com\b.*/g, "");

  // Remove "& Co" / "and Co" at end
  s = s.replace(/\s*(&|and)\s*co\.?\s*$/g, "");

  // Strip common legal suffixes at end of string (longest first to avoid partial matches)
  const suffixes = [
    "incorporated", "corporation", "company",
    "limited", "inc", "corp", "ltd", "plc", "llc", "lp",
    "n\\.v", "s\\.a", "s\\.e", "ag",
  ];
  for (const sfx of suffixes) {
    s = s.replace(new RegExp(`\\s+${sfx}\\.?\\s*$`), "");
  }

  // Remove remaining non-alphanumeric characters (keep spaces and hyphens)
  s = s.replace(/[^a-z0-9\s-]/g, " ");

  return s.trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/* ── HTML table parser ─────────────────────────────────────── */
/**
 * Parse the macrotrends quarterly data table from HTML.
 * Expects rows with: Date | Price | Per-Share-Value | Ratio
 * Returns array sorted date ASC.
 */
function parseTable(html: string): { date: string; value: number }[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }

  const result: { date: string; value: number }[] = [];

  doc.querySelectorAll("table tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 3) return;

    const dateText = cells[0].textContent?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return;

    // Last cell is always the ratio value
    const rawValue = cells[cells.length - 1].textContent?.trim() ?? "";
    const value = parseFloat(rawValue.replace(/[^0-9.]/g, ""));

    if (Number.isFinite(value) && value > 0) {
      result.push({ date: dateText, value });
    }
  });

  // Sort ascending (oldest first)
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Quarterly → Annual ────────────────────────────────────── */
/**
 * Take the LAST quarter's value for each calendar year.
 * (Data is sorted ASC so the last entry per year = Q4 or latest available quarter.)
 */
function toAnnual(data: { date: string; value: number }[]): RatioPoint[] {
  const byYear: Record<number, number> = {};
  for (const { date, value } of data) {
    const year = parseInt(date.substring(0, 4));
    byYear[year] = value; // overwrite → last chronological entry per year wins
  }
  return Object.entries(byYear)
    .map(([y, v]) => ({ year: parseInt(y), value: v }))
    .sort((a, b) => a.year - b.year);
}

/* ── Single metric fetch ───────────────────────────────────── */
const METRICS: Record<string, string> = {
  pe:   "pe-ratio",
  ps:   "price-sales",
  pb:   "price-book",
  pfcf: "price-fcf",
};

async function fetchOne(
  ticker: string,
  slug: string,
  metricKey: string
): Promise<{ date: string; value: number }[]> {
  const metric = METRICS[metricKey];
  const url = `https://www.macrotrends.net/stocks/charts/${ticker}/${slug}/${metric}`;

  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;

      const html = await res.text();
      // Sanity check: must contain macrotrends content
      if (!html.includes("macrotrends") || html.length < 5_000) continue;

      const rows = parseTable(html);
      if (rows.length > 2) return rows;
    } catch {
      // Try next proxy
    }
  }

  return [];
}

/* ── Main export ───────────────────────────────────────────── */
export async function fetchMacrotrends(
  ticker: string,
  companyName: string
): Promise<MacrotrendsHistorical> {
  const cacheKey = `mt_v2_${ticker}`;

  // Read cache
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return data as MacrotrendsHistorical;
    }
  } catch {}

  const slug = nameToSlug(companyName);

  // Fetch all 4 metrics in parallel
  const [peRaw, psRaw, pbRaw, pfcfRaw] = await Promise.all([
    fetchOne(ticker, slug, "pe"),
    fetchOne(ticker, slug, "ps"),
    fetchOne(ticker, slug, "pb"),
    fetchOne(ticker, slug, "pfcf"),
  ]);

  const result: MacrotrendsHistorical = {
    pe:   toAnnual(peRaw),
    ps:   toAnnual(psRaw),
    pb:   toAnnual(pbRaw),
    pfcf: toAnnual(pfcfRaw),
    slug,
  };

  // Cache only if we got meaningful data
  if (result.pe.length > 0 || result.ps.length > 0) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: result }));
    } catch {}
  }

  return result;
}
