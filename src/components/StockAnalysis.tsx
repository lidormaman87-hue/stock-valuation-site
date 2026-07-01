/**
 * StockAnalysis — AI-powered stock review using Google Gemini Flash.
 * Generates a full 14-section analysis based on a Hebrew analyst prompt.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Brain, ChevronDown, ChevronUp, Key } from "lucide-react";
import { toast } from "sonner";
import type { FinnhubSnapshot } from "@/services/finnhubService";
import type { StockData } from "@/services/stockDataService";

/* ── Gemini key ─────────────────────────────────────────── */
const GEM_KEY = "gemini_api_key";
export const getGeminiKey = () => localStorage.getItem(GEM_KEY) ?? "";
export const setGeminiKey = (k: string) => localStorage.setItem(GEM_KEY, k.trim());

/* ── Groq call ──────────────────────────────────────────── */
async function callGroq(prompt: string): Promise<string> {
  const key = getGeminiKey(); // reusing same storage key
  if (!key) throw new Error("לא הוגדר מפתח Groq");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "אתה אנליסט פיננסי מקצועי שכותב בעברית. אתה מנתח מניות בצורה מסודרת ומקצועית." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Groq שגיאה ${res.status}`);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "אין תשובה מה-AI";
}

/* ── Analyst prompt template ────────────────────────────── */
const ANALYST_PROMPT = (ticker: string, data: Partial<StockData>) => `
אתה אנליסט פיננסי עצמאי מקצועי. נתח את המניה ${ticker} לפי המבנה הבא.

נתונים עדכניים שיש לי:
- מחיר נוכחי: ${data.currentPrice ? `$${data.currentPrice.toFixed(2)}` : "לא זמין"}
- שווי שוק: ${data.marketCap ? `$${data.marketCap.toFixed(1)}B` : "לא זמין"}
- הכנסות TTM: ${data.baseRevenue ? `$${data.baseRevenue.toFixed(1)}B` : "לא זמין"}
- שולי רווח נקי: ${data.netMargin ? `${(data.netMargin * 100).toFixed(1)}%` : "לא זמין"}
- EPS: ${data.baseEPS ? `$${data.baseEPS.toFixed(2)}` : "לא זמין"}
- צמיחת הכנסות YoY: ${data.revenueGrowth ? `${(data.revenueGrowth * 100).toFixed(1)}%` : "לא זמין"}

הוראות חשובות:
- השתמש בידע הכללי שלך על החברה ועל הענף — אל תכתוב "חסר מידע" כשאתה יודע את התשובה מהידע שלך.
- השתמש בנתונים שסיפקתי לאיסוש ותמיכה.
- ציין "חסר מידע" רק כשאתה באמת לא יודע.
- הפרד בין עובדות, הנחות ופרשנות.
- אל תיתן המלצת קנייה או מכירה.
- כתוב בעברית בלבד, מפורט ומקצועי.
- כל סעיף צריך להיות מפורט עם תוכן אמיתי.

כתוב ניתוח מלא לפי 14 הסעיפים:

## 1. פתיחה טכנית קצרה
מחיר נוכחי, מגמה שנתית, ממוצעים נעים (MA50/MA200), RSI משוער, רמות תמיכה והתנגדות עיקריות, מחזורי מסחר, האם נמצא באזור מעניין.

## 2. מי זו החברה?
הסבר פשוט ומקיף — מה עושה, למי מוכרת, מה הבעיה שפותרת, יתרון תחרותי, האם קל להחליפה.

## 3. מנוע הצמיחה המרכזי
הטרנד הגדול, האם כבר משפיע על הכנסות, מה ההנהלה מדגישה, מה ישנה את שווי החברה אם יצליח.

## 4. פירוק הכנסות
טבלה עם תחומי פעילות, הכנסות, אחוז מסך, קצב צמיחה, חשיבות לתזה.

## 5. גודל שוק ופוטנציאל
TAM, תחזית צמיחה, מתחרות מרכזיות, פוטנציאל נתח שוק, השפעה על הכנסות.

## 6. תרחישי הכנסות
שלושה תרחישים (שמרני / בסיס / אופטימי) — הנחה, הכנסות פוטנציאליות, תנאים לכל תרחיש.

## 7. השוואה היסטורית
מחיר דומה בעבר, השוואת מדדים פיננסיים אז והיום, האם החברה חזקה יותר היום.

## 8. בדיקה פיננסית
הכנסות, צמיחה, שולי רווח גולמי/תפעולי/נקי, FCF, חוב נטו, דילול, SBC, תחזית הנהלה. סיכום: האם משתפרת ברווחיות.

## 9. תמחור
שווי שוק, EV, EV/Sales, EV/EBITDA, P/E, Forward P/E, P/S, FCF Yield, השוואה למתחרות ולהיסטוריה. האם יקרה, סבירה או זולה.

## 10. פעילות בעלי עניין
קניות/מכירות אחרונות של בכירים, מי, כמה, אישי או אופציות, מסקנה.

## 11. סיכונים ואתגרים
לפחות 6 סיכונים עם הסבר, אופן מעקב, וחומרה (גבוהה/בינונית/נמוכה).

## 12. טריגר טכני למעקב
התנגדות, תמיכה, מחיר פריצה מעניין, מחיר שבירת תזה, יעד אם תהיה פריצה.

## 13. סיכום תזה
8 נקודות מובנות: מה החברה עושה / מנוע צמיחה / מה השוק מפספס / נתונים תומכים / סיכונים / רמה טכנית / מה יחזק / מה ישבור.

## 14. מסקנה
אחת בלבד: "מעניינת למעקב" / "מעניינת רק אם תגיע ל-[מחיר/פריצה]" / "לא מעניינת כרגע".

---
אין לראות בניתוח המלצה לקנייה או מכירה. מדובר בחומר לימודי ודעתי בלבד.
`;

/* ── Markdown renderer (simple) ─────────────────────────── */
function MarkdownView({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed" dir="rtl">
      {lines.map((line, i) => {
        if (/^#{1,2}\s/.test(line))
          return <h2 key={i} className="text-base font-bold text-foreground mt-5 mb-2 border-b border-border/40 pb-1">{line.replace(/^#+\s/, "")}</h2>;
        if (/^###\s/.test(line))
          return <h3 key={i} className="text-sm font-semibold text-primary mt-4 mb-1">{line.replace(/^###\s/, "")}</h3>;
        if (/^\*\*(.+)\*\*$/.test(line))
          return <p key={i} className="font-semibold text-foreground">{line.replace(/\*\*/g, "")}</p>;
        if (/^[-•]\s/.test(line))
          return <li key={i} className="mr-4 text-muted-foreground list-disc">{line.replace(/^[-•]\s/, "").replace(/\*\*/g, "")}</li>;
        if (/^\d+\.\s/.test(line))
          return <p key={i} className="font-semibold text-foreground mt-3">{line}</p>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-muted-foreground" dangerouslySetInnerHTML={{
            __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
          }} />
        );
      })}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────── */
interface Props {
  ticker: string;
  stockData: StockData | null;
}

export function StockAnalysis({ ticker, stockData }: Props) {
  const [analysis, setAnalysis]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(true);
  const [showKey, setShowKey]     = useState(!getGeminiKey());
  const [gemKey, setGemKey]       = useState(getGeminiKey);

  const handleSaveKey = () => {
    setGeminiKey(gemKey);
    setShowKey(false);
    toast.success("מפתח Gemini נשמר");
  };

  const handleGenerate = async () => {
    if (!getGeminiKey()) { setShowKey(true); toast.error("הזן מפתח Gemini תחילה"); return; }
    setLoading(true);
    setAnalysis(null);
    try {
      const prompt = ANALYST_PROMPT(ticker, stockData ?? {});
      const result = await callGroq(prompt);
      setAnalysis(result);
      setExpanded(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            סקירת AI להכרת החברה — {ticker}
            <span className="text-xs font-normal text-muted-foreground">מופעל על ידי Groq AI</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl h-7 text-xs"
              onClick={() => setShowKey((v) => !v)}>
              <Key className="h-3 w-3 ml-1" /> API Key
            </Button>
            {analysis && (
              <Button variant="ghost" size="sm" className="rounded-xl h-7"
                onClick={() => setExpanded((v) => !v)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* API Key input */}
        {showKey && (
          <div className="flex gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">מפתח Groq (חינמי — console.groq.com)</Label>
              <Input
                value={gemKey}
                onChange={(e) => setGemKey(e.target.value)}
                placeholder="gsk_..."
                className="text-left font-mono text-sm h-8"
                dir="ltr"
              />
            </div>
            <Button size="sm" className="self-end rounded-xl" onClick={handleSaveKey}>שמור</Button>
          </div>
        )}

        {/* Generate button */}
        {!analysis && (
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-xl text-white btn-primary-glow border-0"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> AI מנתח את {ticker}...</>
            ) : (
              <><Brain className="h-4 w-4 ml-2" /> הפק סקירת AI מלאה</>
            )}
          </Button>
        )}

        {/* Regenerate */}
        {analysis && !loading && (
          <Button variant="outline" size="sm" className="rounded-xl text-xs"
            onClick={handleGenerate}>
            <Brain className="h-3.5 w-3.5 ml-1.5" /> הפק מחדש
          </Button>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[100, 80, 90, 70, 85].map((w, i) => (
              <div key={i} className="h-3 bg-secondary rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {/* Analysis output */}
        {analysis && expanded && (
          <div className="border border-border/40 rounded-xl p-5 bg-card max-h-[70vh] overflow-y-auto">
            <MarkdownView text={analysis} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
