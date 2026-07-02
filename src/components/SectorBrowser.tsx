/**
 * SectorBrowser
 * Horizontal strip of sector cards (ETF daily/weekly %) with an
 * expandable top-10 movers panel when a sector is clicked.
 */
import { useState, useEffect, useCallback } from "react";
import { SECTORS, type SectorDef } from "@/data/sectors";
import {
  fetchAllEtfPerfs,
  fetchSectorTopMovers,
  type QuotePerf,
} from "@/services/sectorService";
import { Loader2, TrendingUp, TrendingDown, X, ArrowUpDown } from "lucide-react";

interface Props {
  onSelectTicker?: (ticker: string) => void;
}

type SortBy = "day" | "week";

/* ── Helpers ──────────────────────────────────────────── */
const pct = (v: number) => (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`);

function PctBadge({ value, size = "sm" }: { value: number; size?: "xs" | "sm" }) {
  const pos = value >= 0;
  const cls =
    size === "xs"
      ? "text-[11px] px-1.5 py-0.5 rounded font-semibold"
      : "text-xs px-2 py-0.5 rounded-md font-bold";
  return (
    <span
      className={cls}
      style={{
        background: pos ? "#16a34a22" : "#dc262622",
        color:      pos ? "#16a34a"   : "#dc2626",
      }}
    >
      {pct(value)}
    </span>
  );
}

/* ── Sector card (strip item) ─────────────────────────── */
function SectorCard({
  sector,
  perf,
  selected,
  loading,
  onClick,
}: {
  sector:   SectorDef;
  perf:     QuotePerf | null;
  selected: boolean;
  loading:  boolean;
  onClick:  () => void;
}) {
  const dayPos  = (perf?.dayPct  ?? 0) >= 0;
  const weekPos = (perf?.weekPct ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all hover:shadow-md focus:outline-none min-w-[130px] ${
        selected
          ? "border-2 shadow-lg scale-[1.03]"
          : "border hover:border-muted-foreground/40"
      }`}
      style={{
        borderColor:     selected ? sector.color : undefined,
        backgroundColor: selected ? `${sector.color}12` : undefined,
      }}
    >
      {/* Accent dot */}
      <span
        className="absolute top-2 right-2 h-2 w-2 rounded-full"
        style={{ background: sector.color }}
      />

      <span className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase pr-4">
        {sector.nameHe}
      </span>
      <span className="text-xs text-muted-foreground/70">{sector.etf}</span>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
      ) : perf ? (
        <div className="flex flex-col gap-0.5 mt-0.5">
          <div className="flex items-center gap-1">
            {dayPos ? (
              <TrendingUp  className="h-3 w-3" style={{ color: "#16a34a" }} />
            ) : (
              <TrendingDown className="h-3 w-3" style={{ color: "#dc2626" }} />
            )}
            <span
              className="text-sm font-bold"
              style={{ color: dayPos ? "#16a34a" : "#dc2626" }}
            >
              {pct(perf.dayPct)}
            </span>
            <span className="text-[10px] text-muted-foreground">יום</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="text-xs font-medium"
              style={{ color: weekPos ? "#16a34a" : "#dc2626" }}
            >
              {pct(perf.weekPct)}
            </span>
            <span className="text-[10px] text-muted-foreground">שבוע</span>
          </div>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground mt-1">—</span>
      )}
    </button>
  );
}

/* ── Top movers table ─────────────────────────────────── */
function TopMoversPanel({
  sector,
  movers,
  loading,
  sortBy,
  onSortChange,
  onSelectTicker,
  onClose,
}: {
  sector:          SectorDef;
  movers:          QuotePerf[];
  loading:         boolean;
  sortBy:          SortBy;
  onSortChange:    (s: SortBy) => void;
  onSelectTicker?: (ticker: string) => void;
  onClose:         () => void;
}) {
  return (
    <div
      className="mt-3 rounded-xl border p-4 relative"
      style={{ borderColor: `${sector.color}50`, background: `${sector.color}08` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full inline-block"
            style={{ background: sector.color }}
          />
          <h3 className="font-bold text-sm">
            Top 10 מניות — {sector.nameHe}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-secondary/70 p-0.5 text-xs">
            {(["day", "week"] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => onSortChange(s)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  sortBy === s
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "day" ? "יום" : "שבוע"}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> טוען נתוני מניות…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {movers.slice(0, 10).map((m, i) => (
            <button
              key={m.ticker}
              onClick={() => onSelectTicker?.(m.ticker)}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-background/60 hover:bg-background border border-transparent hover:border-border/50 text-left transition-all group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-muted-foreground/60 w-4 shrink-0">
                  {i + 1}
                </span>
                <span className="font-bold text-sm group-hover:underline">{m.ticker}</span>
                <span className="text-xs text-muted-foreground truncate">
                  ${m.close.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <PctBadge value={m.dayPct}  size="xs" />
                <PctBadge value={m.weekPct} size="xs" />
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && movers.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2 text-right">
          לחץ על מניה כדי לטעון אותה • ממוין לפי שינוי {sortBy === "day" ? "יומי" : "שבועי"} (אבסולוטי)
        </p>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────── */
export function SectorBrowser({ onSelectTicker }: Props) {
  const [etfPerfs,      setEtfPerfs]      = useState<Map<string, QuotePerf>>(new Map());
  const [etfLoading,    setEtfLoading]    = useState(true);
  const [selectedKey,   setSelectedKey]   = useState<string | null>(null);
  const [movers,        setMovers]        = useState<QuotePerf[]>([]);
  const [moversLoading, setMoversLoading] = useState(false);
  const [sortBy,        setSortBy]        = useState<SortBy>("day");
  const [collapsed,     setCollapsed]     = useState(false);

  // Load all ETF perfs on mount
  useEffect(() => {
    setEtfLoading(true);
    fetchAllEtfPerfs(SECTORS.map((s) => s.etf)).then((map) => {
      setEtfPerfs(map);
      setEtfLoading(false);
    });
  }, []);

  const handleSectorClick = useCallback(
    async (sector: SectorDef) => {
      if (selectedKey === sector.key) {
        setSelectedKey(null);
        return;
      }
      setSelectedKey(sector.key);
      setMovers([]);
      setMoversLoading(true);
      const result = await fetchSectorTopMovers(sector.stocks, sortBy);
      setMovers(result);
      setMoversLoading(false);
    },
    [selectedKey, sortBy]
  );

  const handleSortChange = useCallback(
    async (s: SortBy) => {
      setSortBy(s);
      if (!selectedKey) return;
      const sector = SECTORS.find((x) => x.key === selectedKey);
      if (!sector) return;
      setMoversLoading(true);
      const result = await fetchSectorTopMovers(sector.stocks, s);
      setMovers(result);
      setMoversLoading(false);
    },
    [selectedKey]
  );

  const selectedSector = SECTORS.find((s) => s.key === selectedKey) ?? null;

  return (
    <div className="mb-4">
      {/* Panel title + collapse toggle */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide">
          🌐 סקטורים — ביצועי S&P 500
        </h3>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? "הצג ▼" : "הסתר ▲"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* ETF strip — horizontally scrollable */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {SECTORS.map((sector) => (
              <SectorCard
                key={sector.key}
                sector={sector}
                perf={etfPerfs.get(sector.etf) ?? null}
                selected={selectedKey === sector.key}
                loading={etfLoading}
                onClick={() => handleSectorClick(sector)}
              />
            ))}
          </div>

          {/* Top movers panel */}
          {selectedSector && (
            <TopMoversPanel
              sector={selectedSector}
              movers={movers}
              loading={moversLoading}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              onSelectTicker={(t) => {
                onSelectTicker?.(t);
                setSelectedKey(null);
              }}
              onClose={() => setSelectedKey(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
