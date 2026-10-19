import { useEffect, useState } from "react";
import { BTC_USD, USD_PRICE } from "@/services/aggregatorService";

export interface Wallet { name: string; address: string; xlm: number; usdc: number; eurc: number }

const WALLETS = ["Freighter", "Lobstr", "xBull", "Albedo"];

export function Hud({ wallet, onConnect }: { wallet: Wallet | null; onConnect: (w: Wallet | null) => void }) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [rate, setRate] = useState(USD_PRICE.XLM / BTC_USD);
  const [fees, setFees] = useState({ f: 18, m: 11, s: 5 });

  useEffect(() => {
    const t = setInterval(() => {
      setRate((r) => r * (1 + (Math.random() - 0.5) * 0.002));
      setFees((f) => ({ f: Math.max(8, f.f + Math.round(Math.random() * 4 - 2)), m: Math.max(4, f.m + Math.round(Math.random() * 2 - 1)), s: Math.max(1, f.s + Math.round(Math.random() * 2 - 1)) }));
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const connect = (name: string) => {
    setConnecting(name);
    setTimeout(() => {
      onConnect({ name, address: "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB7K9A", xlm: 12480.5521, usdc: 3250.12, eurc: 840.0 });
      setConnecting(null); setOpen(false);
    }, 1400);
  };

  const items = (
    <>
      <span>XLM/BTC <b className="text-xlm">{(rate * 1e8).toFixed(1)} sats</b></span>
      <span>Stellar ledger <b className="text-acid">~5s</b></span>
      <span>BTC fees · fast <b className="text-btc">{fees.f} sat/vB</b></span>
      <span>medium <b className="text-btc">{fees.m} sat/vB</b></span>
      <span>slow <b className="text-btc">{fees.s} sat/vB</b></span>
      <span>BTC/USD <b className="text-foreground">${BTC_USD.toLocaleString()}</b></span>
    </>
  );

  return (
    <header className="relative z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="shrink-0">
          <div className="text-sm font-semibold tracking-tight glitch-hover">
            <span className="text-xlm text-glow-xlm">STELLAR</span><span className="text-foreground">2</span><span className="text-btc text-glow-btc">BITCOIN</span>
            <span className="ml-2 font-mono text-xs text-muted-foreground"></span>
          </div>
        </div>
        
        {wallet ? (
          <button onClick={() => onConnect(null)} className="ml-auto chamfer-sm glow-xlm bg-panel px-4 py-2 font-mono text-xs text-xlm">
            {wallet.name.toUpperCase()} · {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
          </button>
        ) : (
          <button id="connect-wallet" onClick={() => setOpen(true)} className="ml-auto btn-cta px-4 py-2 text-xs font-sans text-sm font-semibold">
            Connect wallet
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={() => setOpen(false)}>
          <div className="panel glow-xlm w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-sm font-semibold tracking-tight text-xlm">Connect a Stellar wallet</div>
            <p className="mb-5 font-mono text-xs text-muted-foreground">Handshake with a Stellar signer to unlock XDR signing.</p>
            <div className="grid gap-2">
              {WALLETS.map((w) => (
                <button key={w} disabled={!!connecting} onClick={() => connect(w)}
                  className="chamfer-sm flex items-center justify-between bg-muted px-4 py-3 font-mono text-sm transition hover:glow-xlm">
                  <span>{w}</span>
                  <span className="text-xs text-muted-foreground">{connecting === w ? <span className="text-acid">Connecting<span className="caret">_</span></span> : "Available"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
