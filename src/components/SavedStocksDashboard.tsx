import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Trash2, Upload, TrendingUp, TrendingDown } from "lucide-react";
import { ValuationInputs, fmtMoney } from "@/lib/valuation";

export interface SavedStock {
  ticker: string;
  companyName: string;
  savedAt: number;
  inputs: ValuationInputs;
  fairPriceToday?: number;
  marketSharePrice?: number;
}

interface Props {
  items: SavedStock[];
  onLoad: (s: SavedStock) => void;
  onDelete: (ticker: string) => void;
}

export const SavedStocksDashboard = ({ items, onLoad, onDelete }: Props) => {
  return (
    <Card className="card-elegant">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-primary" />
          המניות שלי
          <Badge variant="secondary" className="ms-1">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            עדיין לא שמרת מניות. לחץ על "שמור מניה" אחרי טעינת נתונים כדי להוסיף לכאן.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items
              .slice()
              .sort((a, b) => b.savedAt - a.savedAt)
              .map((s) => {
                const fair = s.fairPriceToday;
                const market = s.marketSharePrice;
                const undervalued = fair && market ? market < fair : null;
                return (
                  <div
                    key={s.ticker}
                    className="rounded-lg border border-border bg-card/50 p-3 space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{s.ticker}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.companyName}
                        </div>
                      </div>
                      {undervalued !== null && (
                        <Badge
                          variant="outline"
                          className={
                            undervalued
                              ? "border-success/50 text-success"
                              : "border-warning/50 text-warning"
                          }
                        >
                          {undervalued ? (
                            <TrendingUp className="h-3 w-3 ms-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 ms-1" />
                          )}
                          {undervalued ? "תת-מוערך" : "יקר"}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <div className="text-muted-foreground">מחיר שוק</div>
                        <div className="font-medium">${fmtMoney(market ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">מחיר הוגן</div>
                        <div className="font-medium">${fmtMoney(fair ?? 0)}</div>
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      נשמר: {new Date(s.savedAt).toLocaleString("he-IL")}
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 h-7 text-xs"
                        onClick={() => onLoad(s)}
                      >
                        <Upload className="h-3 w-3 ms-1" />
                        טען
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(s.ticker)}
                        aria-label="מחק"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
