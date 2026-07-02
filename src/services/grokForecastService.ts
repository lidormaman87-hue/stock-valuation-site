/**
 * grokForecastService — financial forecast via Groq AI (direct browser call).
 * Uses the same Groq key + API pattern as StockAnalysis.tsx.
 */
import type { FinnhubHistoricalData } from "@/services/finnhubService";
import { getGeminiKey } from "@/components/StockAnalysis";

/* ── Types ───────────────────────────────────────────────── */
export interface ForecastRow {
  year:          string;
  type:          "actual" | "consensus" | "estimate";
  revenue:       number;   // millions USD
  revenueGrowth: number;   // YoY %
  eps:           number;   // USD diluted
  epsGrowth:     number;   // YoY %
  netMargin:     number;   // net profit margin %
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
  marginOutlook: {
    current:      number;         // last fiscal year net margin %
    currentTTM?:  number;         // TTM net margin % (if materially different from fiscal year)
    year3:        number;         // estimated net margin in 3 years (if thesis plays out)
    year5:        number;         // estimated net margin in 5 years (if thesis plays out)
    thesisDriver: string;         // Hebrew: what drives margin change
  };
  oneTimeItems: {
    hasItems:       boolean;
    description:    string | null;
    cleanEpsCAGR3y: number | null;
    cleanEpsCAGR5y: number | null;
  };
  analystNote: string;
}

/* ── Build historical summary text ───────────────────────── */
export function buildForecastSummary(data: FinnhubHistoricalData): string {
  const noTTM = <T extends { date: string }>(arr: T[]) =>
    arr.filter((p) => p.date !== "TTM");

  const revs  = noTTM(data.income.revenues).filter((p) => p.value !== null);
  const eps   = noTTM(data.income.eps).filter((p) => p.value !== null);
  const gross = noTTM(data.income.grossProfit).filter((p) => p.value !== null);
  const oi    = noTTM(data.income.operatingIncome).filter((p) => p.value !== null);
  const ni    = noTTM(data.income.netIncome).filter((p) => p.value !== null);

  const fmtM = (v: number | null) =>
    v == null ? "N/A"
    : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B`
    : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M`
    : `$${v.toFixed(0)}`;

  const fmtPct = (curr: number | null, prev: number | null) =>
    curr != null && prev != null && prev !== 0
      ? `(${((curr - prev) / Math.abs(prev) * 100).toFixed(1)}% YoY)`
      : "";

  const lines: string[] = [];

  lines.push("REVENUE:");
  for (let i = 0; i < revs.length; i++)
    lines.push(`  ${revs[i].date}: ${fmtM(revs[i].value)} ${fmtPct(revs[i].value, revs[i-1]?.value ?? null)}`);

  lines.push("\nEPS (diluted, USD):");
  for (let i = 0; i < eps.length; i++) {
    const v = eps[i].value;
    lines.push(`  ${eps[i].date}: $${v != null ? v.toFixed(2) : "N/A"} ${fmtPct(v, eps[i-1]?.value ?? null)}`);
  }

  if (gross.length && revs.length) {
    lines.push("\nGROSS MARGIN:");
    for (const g of gross) {
      const r = revs.find((r) => r.date === g.date);
      if (r?.value && g.value != null)
        lines.push(`  ${g.date}: ${(g.value / r.value * 100).toFixed(1)}%`);
    }
  }

  if (oi.length && revs.length) {
    lines.push("\nOPERATING MARGIN:");
    for (const o of oi) {
      const r = revs.find((r) => r.date === o.date);
      if (r?.value && o.value != null)
        lines.push(`  ${o.date}: ${(o.value / r.value * 100).toFixed(1)}%`);
    }
  }

  if (ni.length && revs.length) {
    lines.push("\nNET MARGIN:");
    for (const n of ni) {
      const r = revs.find((r) => r.date === n.date);
      if (r?.value && n.value != null)
        lines.push(`  ${n.date}: ${(n.value / r.value * 100).toFixed(1)}%`);
    }
  }

  // TTM (trailing 12 months) — may differ significantly from last fiscal year
  const ttmRev = data.income.revenues.find((p) => p.date === "TTM")?.value ?? null;
  const ttmNI  = data.income.netIncome.find((p) => p.date === "TTM")?.value ?? null;
  const ttmEps = data.income.eps.find((p) => p.date === "TTM")?.value ?? null;
  const ttmGP  = data.income.grossProfit.find((p) => p.date === "TTM")?.value ?? null;
  const ttmOI  = data.income.operatingIncome.find((p) => p.date === "TTM")?.value ?? null;
  if (ttmRev != null) {
    const ttmGM  = ttmRev && ttmGP  != null ? `GrossMargin=${(ttmGP  / ttmRev * 100).toFixed(1)}%` : "";
    const ttmOM  = ttmRev && ttmOI  != null ? `OpMargin=${(ttmOI  / ttmRev * 100).toFixed(1)}%`    : "";
    const ttmNM  = ttmRev && ttmNI  != null ? `NetMargin=${(ttmNI  / ttmRev * 100).toFixed(1)}%`   : "";
    lines.push(`\nTTM (trailing 12 months — IMPORTANT: use as the true current baseline):`);
    lines.push(`  Revenue=${fmtM(ttmRev)} NetIncome=${fmtM(ttmNI)} EPS=$${ttmEps?.toFixed(2) ?? "N/A"} ${ttmGM} ${ttmOM} ${ttmNM}`);
    lines.push(`  NOTE: If TTM net margin differs substantially from the last fiscal year, TTM is more representative of current profitability.`);
  }

  return lines.join("\n");
}

/* ── Groq direct call (same pattern as StockAnalysis) ─────── */
async function callGroq(userPrompt: string): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error("לא הוגדר מפתח Groq — הגדר אותו בכרטיס 'סקירת AI להכרת החברה'");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a senior equity research analyst. " +
            "Respond ONLY with a valid JSON object — no markdown fences, no text outside the JSON. " +
            "All string fields that are described as 'Hebrew' must be written in Hebrew.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens:  2800,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Groq שגיאה ${res.status}`);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

/* ── Forecast fetch with 24h cache ───────────────────────── */
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function fetchGrokForecast(
  ticker:            string,
  companyName:       string | null,
  historicalSummary: string,
  bust = false,
): Promise<ForecastResult> {
  const cacheKey = `groq_forecast_v2_${ticker}`;

  if (!bust) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) return data as ForecastResult;
      }
    } catch { /* ignore */ }
  }

  const baseYear = new Date().getFullYear() - 1;

  const userPrompt = `
Company: ${companyName ?? ticker} (ticker: ${ticker})

=== HISTORICAL FINANCIAL DATA ===
${historicalSummary}

=== TASK: FINANCIAL FORECAST ===
Build a table with the last actual year + 5 forward years, then provide margin outlook.

Return ONLY this JSON (no extra text):
{
  "forecast": [
    {
      "year": "YYYY",
      "type": "actual" | "consensus" | "estimate",
      "revenue": <number, millions USD>,
      "revenueGrowth": <number, YoY %>,
      "eps": <number, USD diluted>,
      "epsGrowth": <number, YoY %>,
      "netMargin": <number, net profit margin as %, e.g. 21.5>,
      "confidence": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "cagr": {
    "revenue3y": { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "revenue5y": { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "eps3y":     { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "eps5y":     { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" }
  },
  "marginOutlook": {
    "current":      <number, last FISCAL YEAR net margin %>,
    "currentTTM":   <number or null — TTM net margin % IF it differs from 'current' by more than 1.5pp, otherwise null>,
    "year3":        <number, estimated net margin in 3 years IF the investment thesis plays out %>,
    "year5":        <number, estimated net margin in 5 years IF the investment thesis plays out %>,
    "thesisDriver": "<1-2 sentences in Hebrew: what drives the margin expansion or contraction — scale, mix shift, pricing power, cost structure, competition>"
  },
  "oneTimeItems": {
    "hasItems": <boolean>,
    "description": "<string in Hebrew or null>",
    "cleanEpsCAGR3y": <number or null>,
    "cleanEpsCAGR5y": <number or null>
  },
  "analystNote": "<2-3 sentences in Hebrew: main growth driver, key risk, forecast reliability>"
}

Rules:
1. Include ${baseYear} as "actual" (base year, revenueGrowth = YoY vs prior year from historical data)
2. ${baseYear + 1} & ${baseYear + 2}: use analyst consensus you know (type "consensus")
   - HIGH confidence = solid consensus, narrow dispersion
   - MEDIUM = thin coverage or wide spread (>20% range)
3. ${baseYear + 3}–${baseYear + 5}: your model estimate (type "estimate", confidence LOW)
   - Ground in historical CAGR + sector dynamics + operating leverage
4. netMargin for each year = estimated net income / revenue — must be consistent with EPS and revenue
5. marginOutlook.current = last fiscal year GAAP net margin
   marginOutlook.currentTTM = TTM net margin IF it differs from current by >1.5pp (otherwise null)
   If TTM margin is much higher than fiscal year, it likely means one-time charges hit the fiscal year — TTM is the cleaner baseline; use TTM when projecting year3/year5
   marginOutlook.year3 and year5 = the net margin scenario assuming the bull thesis materialises
   (e.g. operating leverage, pricing power, new segment, cost cuts — whatever the thesis is)
6. If any EPS year is distorted by non-recurring items → hasItems=true, describe in Hebrew, provide clean CAGR
7. CAGR is from base year (${baseYear}) to target year
8. All Hebrew fields must be written in Hebrew
`.trim();

  const content = await callGroq(userPrompt);

  // Strip optional markdown wrapping
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("לא ניתן לנתח את תגובת ה-AI");

  const data: ForecastResult = JSON.parse(jsonMatch[0]);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* storage full */ }

  return data;
}
