/** S&P 500 sector definitions — ETF + top constituents */
export interface SectorDef {
  key:     string;
  name:    string;   // English short name
  nameHe:  string;   // Hebrew
  etf:     string;   // Sector ETF ticker
  color:   string;   // Card accent colour
  stocks:  string[]; // Major constituents (up to 15)
}

export const SECTORS: SectorDef[] = [
  {
    key:    "tech",
    name:   "Technology",
    nameHe: "טכנולוגיה",
    etf:    "XLK",
    color:  "#3b82f6",
    stocks: ["AAPL","MSFT","NVDA","AVGO","ORCL","AMD","QCOM","AMAT","TXN","ADI","KLAC","MU"],
  },
  {
    key:    "health",
    name:   "Healthcare",
    nameHe: "בריאות",
    etf:    "XLV",
    color:  "#22c55e",
    stocks: ["UNH","JNJ","LLY","ABBV","MRK","TMO","ABT","AMGN","PFE","ISRG","DHR","MDT"],
  },
  {
    key:    "fin",
    name:   "Financials",
    nameHe: "פיננסים",
    etf:    "XLF",
    color:  "#f59e0b",
    stocks: ["BRK-B","JPM","V","MA","BAC","WFC","GS","MS","AXP","BLK","C","SPGI"],
  },
  {
    key:    "condisc",
    name:   "Cons. Disc.",
    nameHe: "צרכנות שיקול",
    etf:    "XLY",
    color:  "#ec4899",
    stocks: ["AMZN","TSLA","HD","MCD","NKE","SBUX","TJX","LOW","BKNG","CMG","ABNB","EBAY"],
  },
  {
    key:    "constap",
    name:   "Cons. Staples",
    nameHe: "צרכנות בסיסית",
    etf:    "XLP",
    color:  "#06b6d4",
    stocks: ["WMT","PG","KO","PM","COST","MO","MDLZ","CL","GIS","KHC","CHD","SYY"],
  },
  {
    key:    "energy",
    name:   "Energy",
    nameHe: "אנרגיה",
    etf:    "XLE",
    color:  "#f97316",
    stocks: ["XOM","CVX","COP","EOG","SLB","MPC","PSX","VLO","OXY","BKR","HAL","DVN"],
  },
  {
    key:    "util",
    name:   "Utilities",
    nameHe: "תשתיות",
    etf:    "XLU",
    color:  "#8b5cf6",
    stocks: ["NEE","DUK","SO","D","AEP","EXC","SRE","PCG","ED","XEL","ES","ETR"],
  },
  {
    key:    "materials",
    name:   "Materials",
    nameHe: "חומרים",
    etf:    "XLB",
    color:  "#84cc16",
    stocks: ["LIN","SHW","APD","ECL","FCX","NEM","DD","CTVA","PPG","NUE","VMC","MLM"],
  },
  {
    key:    "industrial",
    name:   "Industrials",
    nameHe: "תעשייה",
    etf:    "XLI",
    color:  "#64748b",
    stocks: ["RTX","HON","UPS","CAT","DE","LMT","BA","GE","MMM","FDX","NOC","GD"],
  },
  {
    key:    "realestate",
    name:   "Real Estate",
    nameHe: 'נדל"ן',
    etf:    "XLRE",
    color:  "#a78bfa",
    stocks: ["AMT","PLD","CCI","EQIX","PSA","SPG","O","WELL","DLR","EQR","AVB","VTR"],
  },
  {
    key:    "comm",
    name:   "Comm. Svcs",
    nameHe: "תקשורת",
    etf:    "XLC",
    color:  "#0ea5e9",
    stocks: ["GOOGL","META","NFLX","DIS","CMCSA","T","VZ","CHTR","TMUS","EA","TTWO","OMC"],
  },
];
