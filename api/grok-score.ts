/**
 * Vercel Serverless Function — /api/grok-score
 * Calls xAI Grok to score a financial section and return a Hebrew analysis.
 *
 * POST body: { section: "income"|"balance"|"cashflow"|"valuation", ticker: string, summary: string }
 * Response:  { score: number, label: string, reason: string }
 *
 * Requires env var: GROK_API_KEY
 */

export const config = { runtime: "nodejs20.x" };

const SECTION_LABELS: Record<string, string> = {
  income:    "Income Statement",
  balance:   "Balance Sheet",
  cashflow:  "Cash Flow Statement",
  valuation: "Valuation Ratios",
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    return res.status(500).json({ error: "GROK_API_KEY not configured in Vercel environment variables" });
  }

  const { section, ticker, summary } = req.body ?? {};
  if (!section || !ticker || !summary) {
    return res.status(400).json({ error: "Missing section, ticker or summary" });
  }

  const sectionLabel = SECTION_LABELS[section] ?? section;

  const prompt = `You are a professional financial analyst. Analyze the ${sectionLabel} data for ${ticker} and give a score from 1 to 10.

Financial data summary:
${summary}

Scoring guidelines:
- 9-10: Exceptional — strong growth, healthy margins, excellent fundamentals
- 7-8: Good — solid performance with minor weaknesses
- 5-6: Average — mixed signals, some concerns
- 3-4: Below average — notable weaknesses or declining trends
- 1-2: Poor — serious fundamental problems

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "score": <integer 1-10>,
  "label": "<Exceptional|Good|Average|Weak|Poor>",
  "reason": "<1-2 sentences in Hebrew explaining the score>"
}`;

  try {
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "grok-3-mini",
        messages:    [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens:  250,
      }),
    });

    if (!grokRes.ok) {
      const errText = await grokRes.text();
      return res.status(502).json({ error: `Grok API error ${grokRes.status}: ${errText.slice(0, 200)}` });
    }

    const data    = await grokRes.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response (Grok sometimes wraps in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: "Could not parse Grok response", raw: content });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.json({
      score:  Math.min(10, Math.max(1, Math.round(Number(parsed.score)))),
      label:  String(parsed.label  ?? ""),
      reason: String(parsed.reason ?? ""),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
