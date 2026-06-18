/**
 * Finviz scraper — fetches the stock snapshot table via CORS proxy.
 * Cache: 1 hour (metrics change intraday but not every minute).
 */

const CACHE_PREFIX = "finviz_v1_";
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

/* ── Parse the Finviz snapshot table ─────────────────────── */
function extractMetrics(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, "text/html");
    const cells  = Array.from(doc.querySelectorAll("td"));
    for (let i = 0; i < cells.length - 1; i++) {
      const label = cells[i].textContent?.trim() ?? "";
      const val   = cells[i + 1]?.textContent?.trim() ?? "";
      // Short labels = metric names; skip long prose cells
      if (label.length > 0 && label.length <= 16 && val.length > 0) {
        map[label] = val;
      }
    }
  } catch { /* ignore parse errors */ }
  return map;
}

const parseNum = (s: string | undefined): number | null => {
  if (!s || s === "-" || s.toLowerCase() === "n/a" || s === "") return null;
  const clean = s.replace("%", "").replace(",", "").trim();
  const v = parseFloat(clean);
  return isFinite(v) ? v : null;
};

/* ── Public interface ────────────────────────────────────── */
export interface FinvizMetrics {
  pe:              number | null;  // P/E TTM
  forwardPE:       number | null;  // Fwd P/E
  peg:             number | null;  // PEG
  ps:              number | null;  // P/S
  pb:              number | null;  // P/B
  pfcf:            number | null;  // P/FCF
  roe:             number | null;  // % ROE
  roa:             number | null;  // % ROA
  roi:             number | null;  // % ROI
  epsGrowthNext5Y: number | null;  // % EPS next 5Y (for Forward PEG)
}

const NULL_METRICS: FinvizMetrics = {
  pe: null, forwardPE: null, peg: null, ps: null, pb: null,
  pfcf: null, roe: null, roa: null, roi: null, epsGrowthNext5Y: null,
};

export async function fetchFinvizMetrics(ticker: string): Promise<FinvizMetrics> {
  const t = ticker.trim().toUpperCase();

  const cached = cacheGet(t);
  if (cached) return cached;

  const url    = `https://finviz.com/quote.ashx?t=${t}`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 500) continue; // error-page guard

      const map = extractMetrics(html);

      const result: FinvizMetrics = {
        pe:              parseNum(map["P/E"]),
        forwardPE:       parseNum(map["Fwd P/E"] ?? map["Forward P/E"]),
        peg:             parseNum(map["PEG"]),
        ps:              parseNum(map["P/S"]),
        pb:              parseNum(map["P/B"]),
        pfcf:            parseNum(map["P/FCF"]),
        roe:             parseNum(map["ROE"]),
        roa:             parseNum(map["ROA"]),
        roi:             parseNum(map["ROI"]),
        epsGrowthNext5Y: parseNum(map["EPS next 5Y"]),
      };

      // Sanity check — at least one useful number
      if (result.pe !== null || result.ps !== null || result.roe !== null) {
        cacheSet(t, result);
        return result;
      }
    } catch { /* try next proxy */ }
  }

  return NULL_METRICS;
}
