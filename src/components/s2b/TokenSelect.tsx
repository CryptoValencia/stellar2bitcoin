import { useEffect, useRef, useState } from "react";
import type { Token } from "@/services/aggregatorService";

const ICON = (s: string) => `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${s}.svg`;

export function TokenLogo({ symbol, size = 20 }: { symbol: Token | "BTC"; size?: number }) {
  if (symbol === "EURC")
    return <span className="inline-flex items-center justify-center rounded-full bg-sky font-bold text-ink-foreground" style={{ width: size, height: size, fontSize: size * 0.55 }}>€</span>;
  return <img src={ICON(symbol.toLowerCase())} alt={symbol} width={size} height={size} className="rounded-full" />;
}

const OPTIONS: { v: Token; label: string }[] = [
  { v: "XLM", label: "Stellar Lumens" },
  { v: "USDC", label: "USD Coin" },
  { v: "EURC", label: "Euro Coin" },
];

export function TokenSelect({ value, onChange }: { value: Token; onChange: (t: Token) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-[8px] bg-muted py-1 pl-1 pr-2.5 text-xs font-medium">
        <TokenLogo symbol={value} /> {value} <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="panel absolute right-0 z-20 mt-2 w-52 p-1.5">
          {OPTIONS.map((o) => (
            <button key={o.v} onClick={() => { onChange(o.v); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left ${o.v === value ? "bg-muted" : "hover:bg-muted"}`}>
              <TokenLogo symbol={o.v} size={24} />
              <span className="flex flex-col"><span className="font-mono text-xs font-semibold">{o.v}</span><span className="text-[11px] text-muted-foreground">{o.label}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
