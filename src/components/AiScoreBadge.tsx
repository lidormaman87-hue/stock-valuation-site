/**
 * AiScoreBadge — shows a Grok AI score (1–10) circle with color coding.
 * On hover / click shows the Hebrew reason in a tooltip.
 */
import { useState } from "react";
import type { GrokScore } from "@/services/grokService";

interface Props {
  score: GrokScore | null | "loading";
}

function scoreColor(s: number): { bg: string; text: string; ring: string } {
  if (s >= 9) return { bg: "#16a34a", text: "#ffffff", ring: "#bbf7d0" };   // green
  if (s >= 7) return { bg: "#65a30d", text: "#ffffff", ring: "#d9f99d" };   // lime
  if (s >= 5) return { bg: "#ca8a04", text: "#ffffff", ring: "#fef08a" };   // yellow
  if (s >= 3) return { bg: "#ea580c", text: "#ffffff", ring: "#fed7aa" };   // orange
  return       { bg: "#dc2626", text: "#ffffff", ring: "#fecaca" };          // red
}

export function AiScoreBadge({ score }: Props) {
  const [open, setOpen] = useState(false);

  // Loading spinner
  if (score === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span>AI Scoring…</span>
      </div>
    );
  }

  // Not loaded yet (API key not set or error)
  if (!score) return null;

  const { bg, text, ring } = scoreColor(score.score);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        title={score.reason}
        style={{
          backgroundColor: bg,
          color:           text,
          boxShadow:       `0 0 0 3px ${ring}`,
        }}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold transition-transform hover:scale-105 focus:outline-none"
      >
        {/* Robot / AI icon */}
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 opacity-90">
          <path d="M10 2a1 1 0 011 1v1h3a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h3V3a1 1 0 011-1zM6 6v8h8V6H6zm2 2a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0zm-3 4h4a.5.5 0 010 1H9a.5.5 0 010-1z"/>
        </svg>
        <span>{score.score}/10</span>
        <span className="opacity-80 text-xs font-normal">{score.label}</span>
      </button>

      {/* Reason popover */}
      {open && (
        <>
          {/* Backdrop to close */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-2 z-40 w-72 rounded-xl border bg-popover p-3 shadow-xl text-sm text-popover-foreground"
            dir="rtl"
          >
            <p className="font-semibold mb-1 text-xs text-muted-foreground tracking-wide uppercase">
              Grok AI Analysis
            </p>
            <p className="leading-relaxed">{score.reason}</p>
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 left-2 text-muted-foreground hover:text-foreground text-lg leading-none"
            >×</button>
          </div>
        </>
      )}
    </div>
  );
}
