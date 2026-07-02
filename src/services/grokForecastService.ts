/**
 * grokForecastService — types, data builder, and fetch with caching
 * for the Grok AI financial forecast feature.
 */
import type { FinnhubHistoricalData } from "@/services/finnhubService";
import { getGrokKey } from "@/services/grokService";

/* ── Types ───────────────────────────────────────────────── */
export interface ForecastRow {
  year:          string;
  type:          "actual" | "consensus" | "estimate";
  revenue:       number;           // millions USD
  revenueGrowth: number;           // YoY %
  eps:           number;           // USD diluted
  epsGrowth:     number;           // YoY %
  confidence:    "HIGH" | "MEDIUM" | "LOW";
}

export interface ForecastResult {
  forecast: ForecastRow[];
  cagr: {
    revenue3y: { value: number; confidence: string };
    revenue5y: { value: number; confidence: string };
    eps3y:     { value: number; confidence: string };
    eps5y:     { value: number; confidence: string };
  };
  oneTimeItems: {
    hasItems:      boolean;
    description:   string | null;
    cleanEpsCAGR3y: number | null;
    cleanEpsCAGR5y: number | null;
  };
  analystNote: string;
}

/* ── Build compact historical summary for the prompt ─────── */
export function buildForecastSummary(data: FinnhubHistoricalData): string {
  const noTTM = <T extends { date: string }>(arr: T[]) =>
    arr.filter((p) => p.date !== "TTM");

  const revs  = noTTM(data.income.revenues).filter((p) => p.value !== null);
  const eps   = noTTM(data.income.eps).filter((p) => p.value !== null);
  const gross = noTTM(data.income.grossProfit).filter((p) => p.value !== null);
  const oi    = noTTM(data.income.operatingIncome).filter((p) => p.value !== null);
  const ni    = noTTM(data.income.netIncome).filter((p) => p.value !== null);

  const fmtM  = (v: number | null) =>
    v == null ? "N/A" :
    Math.abs(v) >= 1e9  ? `$${(v / 1e9).toFixed(1)}B` :
    Math.abs(v) >= 1e6  ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

  const fmtPct = (curr: number | null, prev: number | null): string =>
    curr != null && prev != null && prev !== 0
      ? `(${((curr - prev) / Math.abs(prev) * 100).toFixed(1)}% YoY)`
      : "";

  const lines: string[] = [];

  lines.push("REVENUE:");
  for (let i = 0; i < revs.length; i++) {
    const g = fmtPct(revs[i].value, revs[i - 1]?.value ?? null);
    lines.push(`  ${revs[i].date}: ${fmtM(revs[i].value)} ${g}`);
  }

  lines.push("\nEPS (diluted, USD):");
  for (let i = 0; i < eps.length; i++) {
    const g = fmtPct(eps[i].value, eps[i - 1]?.value ?? null);
    const v = eps[i].value;
    lines.push(`  ${eps[i].date}: $${v != null ? v.toFixed(2) : "N/A"} ${g}`);
  }

  if (gross.length > 0 && revs.length > 0) {
    lines.push("\nGROSS MARGIN:");
    for (const g of gross) {
      const r = revs.find((r) => r.date === g.date);
      if (r?.value && g.value != null) {
        lines.push(`  ${g.date}: ${(g.value / r.value * 100).toFixed(1)}%`);
      }
    }
  }

  if (oi.length > 0 && revs.length > 0) {
    lines.push("\nOPERATING MARGIN:");
    for (const o of oi) {
      const r = revs.find((r) => r.date === o.date);
      if (r?.value && o.value != null) {
        lines.push(`  ${o.date}: ${(o.value / r.value * 100).toFixed(1)}%`);
      }
    }
  }

  if (ni.length > 0 && revs.length > 0) {
    lines.push("\nNET MARGIN:");
    for (const n of ni) {
      const r = revs.find((r) => r.date === n.date);
      if (r?.value && n.value != null) {
        lines.push(`  ${n.date}: ${(n.value / r.value * 100).toFixed(1)}%`);
      }
    }
  }

  return lines.join("\n");
}

/* ── Fetch with 24h localStorage cache ───────────────────── */
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function fetchGrokForecast(
  ticker:           string,
  companyName:      string | null,
  historicalSummary: string,
  bust = false,
): Promise<ForecastResult> {
  const cacheKey = `grok_forecast_v1_${ticker}`;

  if (!bust) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) return data as ForecastResult;
      }
    } catch { /* ignore */ }
  }

  const res = await fetch("/api/grok-forecast", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ticker, companyName, historicalSummary, apiKey: getGrokKey() }),
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error ?? `שגיאת API ${res.status}`);
  }

  const data: ForecastResult = await res.json();

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* storage full */ }

  return data;
}
