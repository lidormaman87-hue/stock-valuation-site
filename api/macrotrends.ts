/**
 * Vercel Serverless Function — /api/macrotrends
 * Proxies MacroTrends HTML server-side (no CORS) and returns parsed ratio data.
 *
 * Query params:
 *   ticker  — e.g. AAPL
 *   slug    — e.g. apple  (company name slug)
 *   metric  — pe-ratio | price-sales | price-book | price-fcf
 */

export const config = { runtime: "nodejs" };

/* ── HTML table parser ──────────────────────────────────── */
function parseTable(html: string): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];

  // Match all <tr>…</tr> blocks
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[1];

    // Extract all <td> contents
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(rowHtml)) !== null) {
      // Strip inner HTML tags
      cells.push(td[1].replace(/<[^>]+>/g, "").trim());
    }

    if (cells.length < 3) continue;

    const date = cells[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // Last cell is always the ratio
    const rawVal = cells[cells.length - 1].replace(/[^0-9.]/g, "");
    const value = parseFloat(rawVal);
    if (Number.isFinite(value) && value > 0) {
      result.push({ date, value });
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Aggregate quarterly → annual ───────────────────────── */
function toAnnual(rows: { date: string; value: number }[]) {
  const byYear: Record<number, number> = {};
  for (const { date, value } of rows) {
    byYear[parseInt(date.slice(0, 4))] = value;
  }
  return Object.entries(byYear)
    .map(([y, v]) => ({ year: parseInt(y), value: v }))
    .sort((a, b) => a.year - b.year);
}

/* ── Handler ─────────────────────────────────────────────── */
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");

  const { ticker, slug, metric } = req.query as Record<string, string>;

  if (!ticker || !slug || !metric) {
    return res.status(400).json({ error: "Missing ticker, slug or metric" });
  }

  const url = `https://www.macrotrends.net/stocks/charts/${encodeURIComponent(ticker)}/${encodeURIComponent(slug)}/${encodeURIComponent(metric)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.macrotrends.net/",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `MacroTrends returned ${response.status}` });
    }

    const html = await response.text();

    if (!html.includes("macrotrends") || html.length < 5_000) {
      return res.status(502).json({ error: "Unexpected response from MacroTrends" });
    }

    const rows   = parseTable(html);
    const annual = toAnnual(rows);

    return res.json({ data: annual, count: annual.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "fetch failed" });
  }
}
