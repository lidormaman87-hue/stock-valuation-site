import { fetchFinnhubSnapshot, getFinnhubKey } from "./finnhubService";
import { fetchSnapshot, getApiKey } from "./alphaVantageService";

export interface StockData {
  companyName: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  baseRevenue: number | null;
  netIncome: number | null;
  netMargin: number | null;
  baseEPS: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  missing: string[];
}

export async function fetchStockData(ticker: string): Promise<StockData> {
  const t = ticker.trim().toUpperCase();
  if (!t) throw new Error("יש להזין טיקר");

  // Try Finnhub first (60 req/min), fallback to Alpha Vantage
  if (getFinnhubKey()) {
    try {
      const data = await fetchFinnhubSnapshot(t);
      return {
        companyName:   data.companyName,
        currentPrice:  data.currentPrice,
        marketCap:     data.marketCap,
        baseRevenue:   data.baseRevenue,
        netIncome:     data.baseRevenue !== null && data.netMargin !== null ? data.baseRevenue * data.netMargin : null,
        netMargin:     data.netMargin,
        baseEPS:       data.baseEPS,
        revenueGrowth: data.revenueGrowth,
        epsGrowth:     data.epsGrowth,
        missing:       data.missing,
      };
    } catch (e) {
      const msg = (e as Error).message;
      // Only fall through on non-rate-limit errors
      if (msg.includes("מגבלת")) throw e;
    }
  }

  // Fallback: Alpha Vantage
  if (getApiKey()) {
    const data = await fetchSnapshot(t);
    return {
      companyName:   data.companyName,
      currentPrice:  data.currentPrice,
      marketCap:     data.marketCap,
      baseRevenue:   data.baseRevenue,
      netIncome:     data.baseRevenue !== null && data.netMargin !== null ? data.baseRevenue * data.netMargin : null,
      netMargin:     data.netMargin,
      baseEPS:       data.baseEPS,
      revenueGrowth: data.revenueGrowth,
      epsGrowth:     data.epsGrowth,
      missing:       data.missing,
    };
  }

  throw new Error("לא הוגדר מפתח API. הזן מפתח Finnhub או Alpha Vantage.");
}
