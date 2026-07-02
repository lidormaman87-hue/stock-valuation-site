/**
 * Vercel Serverless — /api/grok-forecast
 * Grok AI financial forecast: last actual year + 5 forward years.
 *
 * POST body: { ticker, companyName, historicalSummary }
 * Returns:   { forecast[], cagr{}, oneTimeItems{}, analystNote }
 */

export const config = { runtime: "nodejs" };

/* ── Improved system prompt ─────────────────────────────── */
const SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier investment bank.
Your task: given a company's historical financials, produce a rigorous multi-year financial forecast.

OUTPUT FORMAT: respond with ONLY a valid JSON object — no markdown fences, no prose outside the JSON.

Schema:
{
  "forecast": [
    {
      "year": "2024",
      "type": "actual" | "consensus" | "estimate",
      "revenue": <number, millions USD, no commas>,
      "revenueGrowth": <number, YoY %, e.g. 8.5>,
      "eps": <number, USD diluted>,
      "epsGrowth": <number, YoY %>,
      "confidence": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "cagr": {
    "revenue3y": { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "revenue5y": { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "eps3y":     { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    "eps5y":     { "value": <number, %>, "confidence": "HIGH"|"MEDIUM"|"LOW" }
  },
  "oneTimeItems": {
    "hasItems": <boolean>,
    "description": <string | null>,
    "cleanEpsCAGR3y": <number | null>,
    "cleanEpsCAGR5y": <number | null>
  },
  "analystNote": "<2-3 sentences in Hebrew about key drivers, risks, and forecast confidence>"
}

Confidence rules:
- HIGH   → consensus-backed; <15% variance from historical trend; Year+1 or Year+2 with strong coverage
- MEDIUM → partial consensus; Year+2 with wide dispersion, or Year+1 with limited coverage
- LOW    → pure model assumption; Years+3 through +5

Always base Year+1 and Year+2 on analyst consensus you know from your training data.
If consensus for a ticker is unknown or stale, lower confidence to MEDIUM and note it.
Be conservative, not promotional. Distinguish clearly between consensus and your own estimates.`;

/* ── Handler ─────────────────────────────────────────────── */
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { ticker, companyName, historicalSummary, apiKey: clientKey } = req.body ?? {};
  if (!ticker) return res.status(400).json({ error: "ticker required" });

  // Accept key from env var (server) OR from client body (user's own key)
  const apiKey = process.env.GROK_API_KEY ?? clientKey ?? null;
  if (!apiKey) return res.status(500).json({ error: "GROK_API_KEY not configured" });

  const baseYear = new Date().getFullYear() - 1;

  const userPrompt = `Company: ${companyName ?? ticker} (ticker: ${ticker})

=== HISTORICAL DATA ===
${historicalSummary}

=== FORECAST INSTRUCTIONS ===
1. Include the LAST REPORTED FULL FISCAL YEAR (${baseYear}) as "actual" — base year for CAGR.
2. ${baseYear + 1} and ${baseYear + 2}: use known sell-side consensus estimates (type "consensus").
   - Mark HIGH confidence if consensus is well-established and has narrow dispersion.
   - Mark MEDIUM if coverage is thin or dispersion is wide (>20% range).
3. ${baseYear + 3}, ${baseYear + 4}, ${baseYear + 5}: your own modeled estimate (type "estimate", confidence LOW).
   - Ground assumptions in the company's historical growth trajectory, sector dynamics, and operating leverage.
   - State key assumptions in analystNote.
4. revenueGrowth for the base year = YoY vs prior year (from historical data).
5. If any EPS year is materially distorted by non-recurring items (restructuring charges, asset sales, legal settlements, tax windfalls, impairments): set oneTimeItems.hasItems = true, describe in Hebrew, and provide clean EPS CAGR.
6. analystNote must be in Hebrew and cover: main growth driver, key risk, and an honest assessment of forecast reliability.`;

  try {
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       "grok-3-mini",
        temperature: 0.1,
        max_tokens:  1600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt  },
        ],
      }),
      signal: AbortSignal.timeout(28_000),
    });

    if (!grokRes.ok) {
      const errText = await grokRes.text();
      return res.status(502).json({ error: `Grok API ${grokRes.status}`, detail: errText.slice(0, 400) });
    }

    const grokJson = await grokRes.json();
    const content  = grokJson.choices?.[0]?.message?.content ?? "";

    // Strip optional markdown fences
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: "No JSON in Grok response", raw: content.slice(0, 500) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.json(parsed);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "fetch failed" });
  }
}
