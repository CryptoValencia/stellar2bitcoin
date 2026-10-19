import { useEffect, useMemo, useState } from "react";
import { BTC_USD, USD_PRICE } from "@/services/aggregatorService";

function series(n: number, base: number) {
  let v = base; return Array.from({ length: n }, () => (v = v * (1 + (Math.random() - 0.48) * 0.02)));
}

export function MarketStrip() {
  const [pts, setPts] = useState<number[]>(() => Array(40).fill(165));
  useEffect(() => { setPts(series(40, (USD_PRICE.XLM / BTC_USD) * 1e8)); }, []);
  useEffect(() => {
    const t = setInterval(() => setPts((p) => [...p.slice(1), (p[p.length - 1] ?? 165) * (1 + (Math.random() - 0.5) * 0.01)]), 2500);
    return () => clearInterval(t);
  }, []);

  const { line, area, last, change } = useMemo(() => {
    const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 400, 110 - ((v - min) / r) * 90] as const);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1] ?? 0, first = pts[0] ?? 1;
    return { line, area: `${line} L400,130 L0,130 Z`, last, change: ((last - first) / first) * 100 };
  }, [pts]);

  const fees = [18, 11, 5, 14, 9, 21, 12];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="panel-aurora relative overflow-hidden p-6 md:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-xs opacity-70">XLM / BTC · 24h</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-4xl font-bold">{last.toFixed(1)}</span>
              <span className="font-mono text-sm opacity-70">sats</span>
              <span className={`pill ${change >= 0 ? "bg-acid/20 text-acid" : "bg-destructive/20 text-destructive"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
            </div>
          </div>
          <span className="pill bg-ink-foreground/10">● live</span>
        </div>
        <svg viewBox="0 0 400 130" className="mt-4 h-28 w-full" preserveAspectRatio="none">
          <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          <path d={area} fill="url(#fill)" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="panel p-6">
        <div className="font-mono text-xs text-muted-foreground">Avg. settlement</div>
        <div className="mt-2 font-display text-4xl font-bold">4m 12s</div>
        <div className="mt-6 space-y-1.5 font-mono text-[11px]">
          <Row k="Swaps today" v="1,284" />
          <Row k="Volume 24h" v="$2.41M" />
          <Row k="Success rate" v="99.6%" accent />
        </div>
      </div>

      <div className="panel-ink p-6">
        <div className="font-mono text-xs opacity-60">Mempool · sat/vB</div>
        <div className="mt-2 font-display text-4xl font-bold">{fees[0]}</div>
        <div className="mt-4 flex h-16 items-end gap-1.5">
          {fees.map((f, i) => (
            <div key={i} className={`flex-1 rounded-t-md ${i === 0 ? "bg-acid" : "bg-ink-2"}`} style={{ height: `${(f / 21) * 100}%` }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] opacity-50"><span>now</span><span>-6 blocks</span></div>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className={accent ? "text-acid" : ""}>{v}</span></div>;
}
