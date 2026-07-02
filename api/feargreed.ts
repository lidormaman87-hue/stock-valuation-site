/**
 * Vercel Serverless Function — /api/feargreed
 * Proxies the CNN Fear & Greed API server-side (no CORS issues).
 *
 * GET /api/feargreed
 * Returns: { score, rating, timestamp }
 */

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Cache at CDN level for 15 minutes
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=60");

  try {
    const response = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept":     "application/json, text/plain, */*",
          "Referer":    "https://edition.cnn.com/",
          "Origin":     "https://edition.cnn.com",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: `CNN API returned ${response.status}` });
    }

    const json = await response.json();
    const fg   = json?.fear_and_greed;

    if (fg == null) {
      return res.status(502).json({ error: "Unexpected CNN response shape" });
    }

    return res.json({
      score:     +(Number(fg.score)).toFixed(1),
      rating:    fg.rating    ?? "",
      timestamp: fg.timestamp ?? null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "fetch failed" });
  }
}
