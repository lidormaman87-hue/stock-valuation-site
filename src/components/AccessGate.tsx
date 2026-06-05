import { useState } from "react";
import { Calculator, Lock, Eye, EyeOff } from "lucide-react";

const ACCESS_KEY = "site_access_granted";
const CORRECT_CODE = "159357";

export function useAccess() {
  return sessionStorage.getItem(ACCESS_KEY) === "true";
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(() => sessionStorage.getItem(ACCESS_KEY) === "true");
  const [code, setCode]       = useState("");
  const [error, setError]     = useState(false);
  const [show, setShow]       = useState(false);
  const [shake, setShake]     = useState(false);

  const handleSubmit = () => {
    if (code === CORRECT_CODE) {
      sessionStorage.setItem(ACCESS_KEY, "true");
      setGranted(true);
    } else {
      setError(true);
      setShake(true);
      setCode("");
      setTimeout(() => setShake(false), 500);
    }
  };

  if (granted) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--gradient-subtle)" }}>
      <div className={`card-elegant p-8 w-full max-w-sm mx-4 text-center ${shake ? "animate-shake" : ""}`}
        style={{ boxShadow: "var(--shadow-elevated)" }}>

        {/* Icon */}
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center text-white btn-primary-glow">
          <Calculator className="h-7 w-7" />
        </div>

        <h1 className="text-xl font-bold gradient-text mb-1">מחשבון הערכת שווי</h1>
        <p className="text-sm text-muted-foreground mb-6">הזן קוד גישה להמשך</p>

        {/* Code input */}
        <div className="relative mb-3">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type={show ? "text" : "password"}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="הזן קוד"
            className={`w-full text-center tracking-[0.4em] text-lg font-bold rounded-xl border px-10 py-3 outline-none transition-all ${
              error
                ? "border-destructive/60 bg-destructive/5 text-destructive"
                : "border-border/70 bg-white focus:border-primary/50"
            }`}
            style={{ direction: "ltr" }}
            autoFocus
          />
          <button
            onClick={() => setShow((v) => !v)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="text-xs text-destructive mb-3">קוד שגוי. נסה שנית.</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={code.length < 4}
          className="w-full py-2.5 rounded-xl text-white font-semibold text-sm btn-primary-glow border-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          כניסה
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
