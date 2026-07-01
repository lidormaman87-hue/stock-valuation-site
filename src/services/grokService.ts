/**
 * grokService — client-side service for AI section scoring via Grok.
 * Calls /api/grok-score (Vercel function) and caches results 24h per ticker+section.
 */

export type SectionKey = "income" | "balance" | "cashflow" | "valuation";

export interface GrokScore {
  score:  number;   // 1–10
  label:  string;   // "Exceptional" | "Good" | "Average" | "Weak" | "Poor"
  reason: string;   // 1–2 sentence Hebrew explanation
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheKey(ticker: string, section: SectionKey) {
  return `grok_score_v1_${ticker}_${section}`;
}

function cacheGet(ticker: string, section: SectionKey): GrokScore | null {
  try {
    const raw = localStorage.getItem(cacheKey(ticker, section));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return data as GrokScore;
  } catch {}
  return null;
}

function cacheSet(ticker: string, section: SectionKey, data: GrokScore) {
  try {
    localStorage.setItem(cacheKey(ticker, section), JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

/** Fetch Grok score for one section. Returns null if API not configured or error. */
export async function fetchGrokScore(
  ticker: string,
  section: SectionKey,
  summary: string
): Promise<GrokScore | null> {
  const cached = cacheGet(ticker, section);
  if (cached) return cached;

  try {
    const res = await fetch("/api/grok-score", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ section, ticker, summary }),
      signal:  AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;
    const score = (await res.json()) as GrokScore;
    if (typeof score.score !== "number") return null;

    cacheSet(ticker, section, score);
    return score;
  } catch {
    return null;
  }
}

/* ── Summary builders ──────────────────────────────────────────
   These convert raw chart data into compact text for the prompt.
   We take the last 7 years max and format as a short table.
─────────────────────────────────────────────────────────────── */

type Point = { date: string; value: number | null };

function fmt(v: number | null, unit = "$B"): string {
  if (v === null || !isFinite(v)) return "N/A";
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "$") return `$${v.toFixed(2)}`;
  // Billions
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

function last7(pts: Point[]) {
  return pts.filter((p) => p.value !== null).slice(-7);
}

function trend(pts: Point[]): string {
  const valid = pts.filter((p) => p.value !== null && isFinite(p.value as number));
  if (valid.length < 2) return "insufficient data";
  const first = valid[0].value as number;
  const last  = valid[valid.length - 1].value as number;
  if (first === 0) return "N/A";
  const pct = ((last - first) / Math.abs(first)) * 100;
  return pct > 0 ? `+${pct.toFixed(0)}% over ${valid.length} years` : `${pct.toFixed(0)}% over ${valid.length} years`;
}

export function buildIncomeSummary(data: {
  revenues:        Point[];
  grossProfit:     Point[];
  operatingIncome: Point[];
  netIncome:       Point[];
  eps:             Point[];
  rule40?:         Point[];
}): string {
  const rows = last7(data.revenues).map((r) => {
    const d  = r.date;
    const gp = data.grossProfit.find((p) => p.date === d)?.value ?? null;
    const op = data.operatingIncome.find((p) => p.date === d)?.value ?? null;
    const ni = data.netIncome.find((p) => p.date === d)?.value ?? null;
    const e  = data.eps.find((p) => p.date === d)?.value ?? null;
    const gm = r.value && gp !== null ? ((gp / r.value) * 100).toFixed(1) : "N/A";
    const nm = r.value && ni !== null ? ((ni / r.value) * 100).toFixed(1) : "N/A";
    return `${d}: Revenue=${fmt(r.value)} GrossMargin=${gm}% OpIncome=${fmt(op)} NetIncome=${fmt(ni)} NetMargin=${nm}% EPS=$${e?.toFixed(2) ?? "N/A"}`;
  });

  return [
    `Revenue trend: ${trend(data.revenues)}`,
    `Net income trend: ${trend(data.netIncome)}`,
    `EPS trend: ${trend(data.eps)}`,
    "",
    "Annual breakdown:",
    ...rows,
  ].join("\n");
}

export function buildBalanceSummary(data: {
  totalAssets:             Point[];
  totalLiabilities:        Point[];
  totalEquity:             Point[];
  totalDebt:               Point[];
  cashAndShortTerm:        Point[];
  totalCurrentAssets:      Point[];
  totalCurrentLiabilities: Point[];
}): string {
  const rows = last7(data.totalAssets).map((r) => {
    const d  = r.date;
    const li = data.totalLiabilities.find((p) => p.date === d)?.value ?? null;
    const eq = data.totalEquity.find((p) => p.date === d)?.value ?? null;
    const de = data.totalDebt.find((p) => p.date === d)?.value ?? null;
    const ca = data.cashAndShortTerm.find((p) => p.date === d)?.value ?? null;
    const de2eq = eq && de !== null && eq !== 0 ? (de / eq).toFixed(2) : "N/A";
    const cr    = data.totalCurrentLiabilities.find((p) => p.date === d)?.value;
    const curR  = data.totalCurrentAssets.find((p) => p.date === d)?.value;
    const currentRatio = cr && curR ? (curR / cr).toFixed(2) : "N/A";
    return `${d}: Assets=${fmt(r.value)} Liabilities=${fmt(li)} Equity=${fmt(eq)} Debt=${fmt(de)} Cash=${fmt(ca)} D/E=${de2eq} CurrentRatio=${currentRatio}`;
  });

  return [
    `Total equity trend: ${trend(data.totalEquity)}`,
    `Total debt trend: ${trend(data.totalDebt)}`,
    `Cash trend: ${trend(data.cashAndShortTerm)}`,
    "",
    "Annual breakdown:",
    ...rows,
  ].join("\n");
}

export function buildCashflowSummary(data: {
  operatingCashFlow:      Point[];
  freeCashFlow:           Point[];
  capitalExpenditures:    Point[];
  stockBasedCompensation: Point[];
  netIncome:              Point[];
}): string {
  const rows = last7(data.operatingCashFlow).map((r) => {
    const d    = r.date;
    const fcf  = data.freeCashFlow.find((p) => p.date === d)?.value ?? null;
    const capex = data.capitalExpenditures.find((p) => p.date === d)?.value ?? null;
    const ni   = data.netIncome.find((p) => p.date === d)?.value ?? null;
    const sbc  = data.stockBasedCompensation.find((p) => p.date === d)?.value ?? null;
    return `${d}: OCF=${fmt(r.value)} FCF=${fmt(fcf)} CapEx=${fmt(capex)} NetIncome=${fmt(ni)} SBC=${fmt(sbc)}`;
  });

  return [
    `Operating cash flow trend: ${trend(data.operatingCashFlow)}`,
    `Free cash flow trend: ${trend(data.freeCashFlow)}`,
    "",
    "Annual breakdown:",
    ...rows,
  ].join("\n");
}

export function buildValuationSummary(data: {
  pe:   Point[];
  ps:   Point[];
  pb:   Point[];
  pfcf: Point[];
}): string {
  const rows = last7(data.pe).map((r) => {
    const d    = r.date;
    const ps   = data.ps.find((p) => p.date === d)?.value ?? null;
    const pb   = data.pb.find((p) => p.date === d)?.value ?? null;
    const pfcf = data.pfcf.find((p) => p.date === d)?.value ?? null;
    return `${d}: P/E=${r.value?.toFixed(1) ?? "N/A"} P/S=${ps?.toFixed(1) ?? "N/A"} P/B=${pb?.toFixed(1) ?? "N/A"} P/FCF=${pfcf?.toFixed(1) ?? "N/A"}`;
  });

  return [
    `P/E trend: ${trend(data.pe)}`,
    `P/S trend: ${trend(data.ps)}`,
    "",
    "Annual valuation multiples:",
    ...rows,
  ].join("\n");
}
