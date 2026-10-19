import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { DevDrawer } from "@/components/s2b/DevDrawer";
import {
  fetchAllQuotes, isLiveMode, validateDestination, USD_PRICE,
  type BtcNet, type Quote, type RouteId, type Token,
} from "@/services/aggregatorService";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stellar2Bitcoin — Bridge XLM, USDC & EURC to Native BTC" },
      { name: "description", content: "Cross-chain aggregator routing Stellar assets to Bitcoin mainnet and Lightning at the best rate." },
      { property: "og:title", content: "Stellar2Bitcoin — S2B Protocol" },
      { property: "og:description", content: "Swap XLM, USDC and EURC to native BTC or Lightning. Compare SideShift, FixedFloat, ChangeNOW and Chainflip routes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ADDR_LABEL: Record<string, [string, string]> = {
  taproot: ["VALID BECH32M / TAPROOT (bc1p)", "text-acid"],
  segwit: ["VALID SEGWIT (bc1q)", "text-acid"],
  legacy: ["VALID LEGACY (P2PKH/P2SH)", "text-acid"],
  lightning: ["VALID BOLT11 INVOICE", "text-acid"],
  invalid: ["INVALID BTC ADDRESS", "text-destructive"],
};

function Index() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [token, setToken] = useState<Token>("XLM");
  const [amount, setAmount] = useState("");
  const [net, setNet] = useState<BtcNet>("mainnet");
  const [dest, setDest] = useState("");
  const [rateMode, setRateMode] = useState<"fixed" | "float">("fixed");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<RouteId | null>(null);
  const [executing, setExecuting] = useState(false);
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => setLive(isLiveMode()), [nonce]);

  const amt = parseFloat(amount) || 0;
  const balance = wallet ? { XLM: wallet.xlm, USDC: wallet.usdc, EURC: wallet.eurc }[token] : 0;

  useEffect(() => {
    if (amt <= 0) { setQuotes([]); return; }
    setScanning(true);
    let cancel = false;
    const t = setTimeout(async () => {
      const q = await fetchAllQuotes(token, amt, net);
      if (cancel) return;
      setQuotes(q); setScanning(false);
      setSelected((s) => (q.find((x) => x.id === s) ? s : q[0]?.id ?? null));
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [amt, token, net, nonce]);

  const quote = quotes.find((q) => q.id === selected) ?? null;
  const addr = validateDestination(dest, net);
  const fastest = useMemo(() => quotes.reduce<Quote | null>((a, b) => (!a || b.etaMin < a.etaMin ? b : a), null), [quotes]);

  const blocker = !wallet ? "CONNECT WALLET FIRST" : amt <= 0 ? "ENTER AMOUNT" : amt > balance ? "INSUFFICIENT BALANCE"
    : addr === "empty" || addr === "invalid" ? "ENTER VALID DESTINATION" : !quote ? "AWAITING ROUTE" : null;

  return (
    <div className="relative flex min-h-screen flex-col">
      <Hud wallet={wallet} onConnect={setWallet} />
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-8 lg:grid-cols-[1.15fr_1fr]">
        <section>
          <div className="mb-4">
            <h1 className="font-display text-3xl font-black tracking-wide md:text-4xl">
              <span className="text-xlm text-glow-xlm">STELLAR</span> <span className="text-muted-foreground">→</span> <span className="text-btc text-glow-btc">NATIVE BTC</span>
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              Mode: <span className={live ? "text-acid" : "text-btc"}>{live ? "LIVE_PRODUCTION" : "SIMULATION"}</span> · 4 liquidity nodes indexed
            </p>
          </div>

          <div className="panel p-5">
            {/* Source */}
            <div className="mb-1 flex justify-between font-mono text-[11px] tracking-widest text-xlm"><span>// SOURCE · STELLAR NETWORK</span>
              <span className="text-muted-foreground">BAL: {wallet ? balance.toLocaleString() : "--"} {token}</span></div>
            <div className="chamfer-sm glow-xlm bg-background/60 p-4">
              <div className="flex items-center gap-3">
                <select value={token} onChange={(e) => setToken(e.target.value as Token)}
                  className="chamfer-sm bg-muted px-3 py-2 font-mono text-sm text-xlm outline-none">
                  <option value="XLM">XLM (Native)</option><option value="USDC">USDC (Circle)</option><option value="EURC">EURC</option>
                </select>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00"
                  className="w-full min-w-0 bg-transparent text-right font-mono text-3xl text-foreground outline-none" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {[25, 50, 75, 100].map((p) => (
                    <button key={p} disabled={!wallet} onClick={() => setAmount(String(+(balance * p / 100).toFixed(token === "XLM" ? 4 : 2)))}
                      className="chamfer-sm bg-muted px-2.5 py-1 font-mono text-[11px] text-xlm hover:glow-xlm disabled:opacity-40">{p === 100 ? "MAX" : `${p}%`}</button>
                  ))}
                </div>
                <span className="font-mono text-xs text-muted-foreground">≈ ${(amt * USD_PRICE[token]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="my-3 text-center font-mono text-xl text-btc">⇣</div>

            {/* Destination */}
            <div className="mb-1 font-mono text-[11px] tracking-widest text-btc">// DESTINATION · BITCOIN NETWORK</div>
            <div className="chamfer-sm glow-btc bg-background/60 p-4">
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {(["mainnet", "lightning"] as const).map((n) => (
                  <button key={n} onClick={() => { setNet(n); setDest(""); }}
                    className={`chamfer-sm py-2 font-mono text-[11px] tracking-wider ${net === n ? "bg-btc text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {n === "mainnet" ? "BTC MAINNET (On-Chain)" : "LIGHTNING (BOLT11)"}
                  </button>
                ))}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted-foreground">{quote ? `via ${quote.provider}` : "no route"}</span>
                <span className="font-mono text-3xl text-btc text-glow-btc">{scanning ? "…" : (quote?.btcOut ?? 0).toFixed(8)} <span className="text-base">BTC</span></span>
              </div>
            </div>

            {/* Address */}
            <div className="mt-5">
              <div className="mb-1 flex justify-between font-mono text-[11px] tracking-widest">
                <span className="text-muted-foreground">{net === "lightning" ? "LIGHTNING INVOICE" : "BTC RECEIVING ADDRESS"}</span>
                {addr !== "empty" && <span className={ADDR_LABEL[addr][1]}>[{ADDR_LABEL[addr][0]}]</span>}
              </div>
              <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={net === "lightning" ? "lnbc…" : "bc1p… / bc1q…"}
                className={`chamfer-sm w-full bg-background px-4 py-3 font-mono text-sm outline-none ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:glow-btc"}`} />
            </div>

            {/* Rate mode */}
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              {(["fixed", "float"] as const).map((m) => (
                <button key={m} onClick={() => setRateMode(m)}
                  className={`chamfer-sm py-2 font-mono text-[11px] ${rateMode === m ? "glow-acid bg-acid/10 text-acid" : "bg-muted text-muted-foreground"}`}>
                  {m === "fixed" ? "FIXED RATE (15m Lock)" : "FLOATING RATE (Best Market)"}
                </button>
              ))}
            </div>

            <button disabled={!!blocker} onClick={() => setExecuting(true)}
              className="btn-cta mt-6 w-full py-5 font-display text-sm font-black tracking-[0.2em]">
              {blocker ?? "INITIALIZE CROSS-CHAIN SWAP // SIGN XDR"}
            </button>
          </div>
        </section>

        {/* Route matrix */}
        <aside>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-sm tracking-widest text-xlm">ROUTE_AGGREGATOR_MATRIX</h2>
            <button onClick={() => setNonce((n) => n + 1)} className="font-mono text-[11px] text-muted-foreground hover:text-xlm">[↻ REFRESH]</button>
          </div>
          {scanning && (
            <div className="panel mb-3 p-4 font-mono text-xs text-xlm">
              SCANNING LIQUIDITY NODES<span className="caret">...</span>
              <div className="relative mt-2 h-0.5 overflow-hidden bg-muted"><div className="absolute h-full w-1/3 bg-xlm scan-bar" /></div>
            </div>
          )}
          {!scanning && quotes.length === 0 && (
            <div className="panel p-8 text-center font-mono text-xs text-muted-foreground">&gt; Enter an amount to query SideShift, FixedFloat, ChangeNOW & CCTP+Chainflip<span className="caret">_</span></div>
          )}
          <div className={`space-y-3 transition ${scanning ? "opacity-40" : ""}`}>
            {quotes.map((q, i) => {
              const badge = i === 0 ? "BEST RETURN" : q.id === fastest?.id ? "FASTEST" : q.badge;
              const active = q.id === selected;
              return (
                <button key={q.id} onClick={() => setSelected(q.id)}
                  className={`panel block w-full p-4 text-left transition glitch-hover ${active ? "glow-btc" : "hover:glow-xlm"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-sm font-bold">{q.provider}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{q.tagline}</div>
                    </div>
                    <span className={`chamfer-sm px-2 py-1 font-mono text-[10px] ${badge === "BEST RETURN" ? "bg-acid/20 text-acid" : "bg-xlm/15 text-xlm"}`}>{badge}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div><div className="text-muted-foreground">ETA</div>~{q.etaMin} min{q.etaMin > 1 ? "s" : ""}</div>
                    <div><div className="text-muted-foreground">FEE</div>${q.feeUsd.toFixed(2)} <span className="text-muted-foreground">/ {(q.feeBtc * 1e8).toFixed(0)} sats</span></div>
                    <div className="text-right"><div className="text-muted-foreground">NET RECEIVED</div><span className="text-btc">{q.btcOut.toFixed(8)}</span></div>
                  </div>
                  {!q.live && <div className="mt-2 font-mono text-[9px] text-muted-foreground">SIM_QUOTE</div>}
                </button>
              );
            })}
          </div>
          {token !== "USDC" && quotes.length > 0 && <p className="mt-3 font-mono text-[10px] text-muted-foreground">* CCTP + Chainflip 2-hop route unlocks for USDC.</p>}
          {net === "lightning" && quotes.length > 0 && <p className="mt-1 font-mono text-[10px] text-muted-foreground">* Showing Lightning-capable nodes only.</p>}
        </aside>
      </main>
      <DevDrawer onChange={() => setNonce((n) => n + 1)} />

      {executing && quote && wallet && (
        <ExecutionModal quote={quote} token={token} amount={amt} dest={dest} walletName={wallet.name} onClose={() => setExecuting(false)} />
      )}
    </div>
  );
}
