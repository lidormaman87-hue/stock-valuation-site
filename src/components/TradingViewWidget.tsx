import { useEffect, useRef, memo } from "react";

interface Props {
  symbol: string;
  exchange?: string;
  isDark?: boolean;
}

const TradingViewWidget = memo(({ symbol, exchange, isDark }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId  = `tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = `<div id="${containerId}" style="height:100%;width:100%;"></div>`;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView === "undefined") return;
      new (window as any).TradingView.widget({
        autosize: true,
        symbol: exchange ? `${exchange}:${symbol}` : symbol,
        interval: "W",
        timezone: "Etc/UTC",
        theme: isDark ? "dark" : "light",
        style: "1",
        locale: "he",
        toolbar_bg: isDark ? "#131722" : "#ffffff",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        container_id: containerId,
        studies: [
          { id: "RSI@tv-basicstudies", inputs: { length: 10 } },
          { id: "StochasticRSI@tv-basicstudies" },
        ],
        show_popup_button: true,
        popup_width: "1000",
        popup_height: "650",
      });
    };

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, exchange]);

  return (
    <div className="card-elegant overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-border/40">
        <div>
          <h2 className="text-base font-semibold">גרף מחיר — {symbol}</h2>
          <p className="text-xs text-muted-foreground">מופעל על ידי TradingView</p>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${symbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          פתח ב-TradingView ↗
        </a>
      </div>
      <div ref={containerRef} style={{ height: 500 }} />
    </div>
  );
});

TradingViewWidget.displayName = "TradingViewWidget";
export default TradingViewWidget;
