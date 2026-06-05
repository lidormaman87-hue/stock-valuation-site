// Valuation logic - based ONLY on "הערכת שווי מסכמת" tab logic.

export interface ValuationInputs {
  stockName: string;
  startYear: number;
  baseRevenue: number;
  revenueGrowth: number; // 0..1
  netMargin: number; // 0..1
  currentMarketCap: number;
  currentSharePrice: number;
  numberOfYears: number;
  peLow: number;
  peMid: number;
  peHigh: number;
  baseEPS: number;
  epsGrowthRate: number; // 0..1
  peYear5: number;
  discountRate: number; // 0..1
  marketSharePrice: number;
  grahamGrowthRates: [number, number, number]; // numeric percent values e.g. 10,13,15
  safetyMargins: [number, number, number]; // 0..1
  useDiscountRateForAll: boolean;
}

export interface RevenueRow {
  year: number;
  revenue: number;
  netIncome: number;
}

export interface ScenarioRow {
  label: string;
  multiple: number;
  marketCapFuture: number;
  cagr: number;
  futureSharePrice: number;
  pv: number;
}

export interface EPSRow {
  year: number;
  eps: number;
}

export interface GrahamRow {
  growth: number;
  value: number;
}

export interface ValuationResults {
  inputs: ValuationInputs;
  revenueTable: RevenueRow[];
  scenarios: ScenarioRow[];
  avgAll: number;
  epsTable: EPSRow[];
  priceYear5: number;
  fairPriceToday: number;
  grahamTable: GrahamRow[];
  grahamAverage: number;
  twoMethodsAverage: number;
  safetyPrices: { margin: number; price: number }[];
  marginOfSafety: number;
}

export const DEFAULT_INPUTS: ValuationInputs = {
  stockName: "amzn",
  startYear: 2026,
  baseRevenue: 90.8,
  revenueGrowth: 0.11,
  netMargin: 0.13,
  currentMarketCap: 282.8,
  currentSharePrice: 270,
  numberOfYears: 5,
  peLow: 30,
  peMid: 35,
  peHigh: 40,
  baseEPS: 8.37,
  epsGrowthRate: 0.15,
  peYear5: 30,
  discountRate: 0.12,
  marketSharePrice: 263,
  grahamGrowthRates: [10, 13, 15],
  safetyMargins: [0.1, 0.15, 0.2],
  useDiscountRateForAll: true,
};

export function calculateValuation(inp: ValuationInputs): ValuationResults {
  const n = inp.numberOfYears;

  // 1) Revenue & Net Income forecast
  const revenueTable: RevenueRow[] = [];
  let rev = inp.baseRevenue;
  for (let i = 0; i < n; i++) {
    if (i > 0) rev = rev * (1 + inp.revenueGrowth);
    revenueTable.push({
      year: inp.startYear + i,
      revenue: rev,
      netIncome: rev * inp.netMargin,
    });
  }

  // 2) PE scenarios
  const lastNI = revenueTable[revenueTable.length - 1].netIncome;
  const buildScenario = (label: string, multiple: number, useDiscount: boolean): ScenarioRow => {
    const marketCapFuture = lastNI * multiple;
    const cagr = Math.pow(marketCapFuture / inp.currentMarketCap, 1 / n) - 1;
    const futureSharePrice = inp.currentSharePrice * Math.pow(1 + cagr, n);
    const discount = useDiscount ? inp.discountRate : cagr;
    const pv = futureSharePrice / Math.pow(1 + discount, n);
    return { label, multiple, marketCapFuture, cagr, futureSharePrice, pv };
  };

  const scenarios: ScenarioRow[] = [
    buildScenario("נמוך", inp.peLow, inp.useDiscountRateForAll),
    buildScenario("בינוני", inp.peMid, inp.useDiscountRateForAll),
    buildScenario("גבוה", inp.peHigh, inp.useDiscountRateForAll),
  ];

  const avgAll = (scenarios[0].pv + scenarios[1].pv + scenarios[2].pv) / 3;

  // 3) EPS forecast & Graham
  const epsTable: EPSRow[] = [];
  let eps = inp.baseEPS;
  for (let i = 0; i < n; i++) {
    if (i > 0) eps = eps * (1 + inp.epsGrowthRate);
    epsTable.push({ year: inp.startYear + i, eps });
  }
  const lastEPS = epsTable[epsTable.length - 1].eps;
  const priceYear5 = inp.peYear5 * lastEPS;
  const fairPriceToday = priceYear5 / Math.pow(1 + inp.discountRate, n);

  const grahamTable: GrahamRow[] = inp.grahamGrowthRates.map((g) => ({
    growth: g,
    value: (2 * g + 8.5) * inp.baseEPS,
  }));
  const grahamAverage = grahamTable.reduce((s, r) => s + r.value, 0) / grahamTable.length;

  // 4) Summary
  const twoMethodsAverage = (grahamAverage + avgAll) / 2;
  const safetyPrices = inp.safetyMargins.map((m) => ({
    margin: m,
    price: twoMethodsAverage * (1 - m),
  }));
  const marginOfSafety = (fairPriceToday - inp.marketSharePrice) / fairPriceToday;

  return {
    inputs: inp,
    revenueTable,
    scenarios,
    avgAll,
    epsTable,
    priceYear5,
    fairPriceToday,
    grahamTable,
    grahamAverage,
    twoMethodsAverage,
    safetyPrices,
    marginOfSafety,
  };
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fmtPct = (n: number) =>
  `${(n * 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function resultsToCSV(r: ValuationResults): string {
  const lines: string[] = [];
  lines.push("מחשבון הערכת שווי מסכמת");
  lines.push(`מניה,${r.inputs.stockName}`);
  lines.push("");
  lines.push("תחזית הכנסות ורווח נקי");
  lines.push("שנה,הכנסות,רווח נקי");
  r.revenueTable.forEach((row) => lines.push(`${row.year},${row.revenue.toFixed(2)},${row.netIncome.toFixed(2)}`));
  lines.push("");
  lines.push("תרחישי מכפילי רווח");
  lines.push("תרחיש,מכפיל,שווי שוק עתידי,CAGR,מחיר עתידי,PV");
  r.scenarios.forEach((s) =>
    lines.push(`${s.label},${s.multiple},${s.marketCapFuture.toFixed(2)},${(s.cagr * 100).toFixed(2)}%,${s.futureSharePrice.toFixed(2)},${s.pv.toFixed(2)}`)
  );
  lines.push(`AVG all,,,,,${r.avgAll.toFixed(2)}`);
  lines.push("");
  lines.push("תחזית EPS");
  lines.push("שנה,EPS");
  r.epsTable.forEach((row) => lines.push(`${row.year},${row.eps.toFixed(2)}`));
  lines.push(`מחיר בשנה 5,${r.priceYear5.toFixed(2)}`);
  lines.push(`מחיר הוגן היום,${r.fairPriceToday.toFixed(2)}`);
  lines.push("");
  lines.push("ערכי גרהם");
  lines.push("צמיחה,ערך");
  r.grahamTable.forEach((g) => lines.push(`${g.growth}%,${g.value.toFixed(2)}`));
  lines.push(`ממוצע גרהם,${r.grahamAverage.toFixed(2)}`);
  lines.push("");
  lines.push("סיכום");
  lines.push(`ממוצע 2 שיטות,${r.twoMethodsAverage.toFixed(2)}`);
  r.safetyPrices.forEach((s) => lines.push(`מחיר יעד ${(s.margin * 100).toFixed(0)}%,${s.price.toFixed(2)}`));
  lines.push(`מרווח ביטחון,${(r.marginOfSafety * 100).toFixed(2)}%`);
  return lines.join("\n");
}
