import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { DevDrawer } from "@/components/s2b/DevDrawer";
import { MarketStrip } from "@/components/s2b/MarketStrip";
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
        <div className="lg:col-span-2"><MarketStrip /></div>
        <section>
          <div className="mb-4">
            <h1 className="font-display text-4xl font-bold md:text-5xl">
              <span className="text-foreground">Stellar</span> <span className="text-muted-foreground">→</span> <span className="text-foreground">native Bitcoin</span><span className="caret text-acid">_</span>
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              Mode: <span className={live ? "text-acid" : "text-btc"}>{live ? "Live" : "Simulation"}</span> · 4 liquidity nodes indexed
            </p>
          </div>

          <div className="space-y-2">
            {/* Source */}
            <div className="panel p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">You send <span className="font-mono text-[11px]">· stellar</span></span>
                <select value={token} onChange={(e) => setToken(e.target.value as Token)}
                  className="rounded-full bg-muted px-3 py-1.5 font-mono text-xs font-medium outline-none">
                  <option value="XLM">XLM</option><option value="USDC">USDC</option><option value="EURC">EURC</option>
                </select>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00"
                  className="w-full min-w-0 bg-transparent font-display text-5xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40" />
                <span className="shrink-0 pb-2 font-mono text-[11px] text-muted-foreground">Available: {wallet ? balance.toLocaleString() : "--"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1">
                  {[25, 50, 75, 100].map((p) => (
                    <button key={p} disabled={!wallet} onClick={() => setAmount(String(+(balance * p / 100).toFixed(token === "XLM" ? 4 : 2)))}
                      className="rounded-full bg-muted px-3 py-1 font-mono text-[11px] hover:bg-primary hover:text-primary-foreground disabled:opacity-40">{p === 100 ? "MAX" : `${p}%`}</button>
                  ))}
                </div>
                <span className="font-mono text-xs text-muted-foreground">≈ ${(amt * USD_PRICE[token]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Destination */}
            <div className="panel p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">You receive <span className="font-mono text-[11px]">· {quote ? quote.provider.toLowerCase() : "bitcoin"}</span></span>
                <span className="rounded-full bg-muted px-3 py-1.5 font-mono text-xs font-medium">₿ BTC</span>
              </div>
              <div className="mt-3 font-display text-5xl font-bold tracking-tight">
                {scanning ? <span className="text-muted-foreground/40">0.00000000</span> : (quote?.btcOut ?? 0).toFixed(8)}
              </div>
              <div className="mt-4 flex rounded-full bg-muted p-1">
                {(["mainnet", "lightning"] as const).map((n) => (
                  <button key={n} onClick={() => { setNet(n); setDest(""); }}
                    className={`flex-1 rounded-full py-2 text-sm transition ${net === n ? "bg-panel font-semibold shadow-sm" : "text-muted-foreground"}`}>
                    {n === "mainnet" ? "On-chain" : "⚡ Lightning"}
                  </button>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="panel p-6">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{net === "lightning" ? "Lightning invoice" : "Bitcoin address"}</span>
                {addr !== "empty" && <span className={`font-mono text-[11px] ${ADDR_LABEL[addr]?.[1]}`}>{addr === "invalid" ? "✕" : "✓"} {ADDR_LABEL[addr]?.[0]}</span>}
              </div>
              <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={net === "lightning" ? "lnbc…" : "bc1p… / bc1q…"}
                className={`w-full rounded-2xl bg-muted px-4 py-3 font-mono text-sm outline-none ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground"}`} />

              <div className="mt-4 flex rounded-full bg-muted p-1">
                {(["fixed", "float"] as const).map((m) => (
                  <button key={m} onClick={() => setRateMode(m)}
                    className={`flex-1 rounded-full py-2 text-sm transition ${rateMode === m ? "bg-panel font-semibold shadow-sm" : "text-muted-foreground"}`}>
                    {m === "fixed" ? "Fixed · 15m" : "Floating"}
                  </button>
                ))}
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                {[
                  ["Rate", quote && amt ? `1 ${token} = ${Math.round((quote.btcOut / amt) * 1e8)} sats` : "—"],
                  ["Network fee", quote ? `$${quote.feeUsd.toFixed(2)}` : "—"],
                  ["Est. arrival", quote ? `~${quote.etaMin} min` : "—"],
                  ["Mode", live ? "Live" : "Simulation"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>
                ))}
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Route score</dt>
                  <dd className="flex items-center gap-2 font-mono">
                    <span className="flex gap-px">{Array.from({ length: 20 }, (_, i) => <span key={i} className={`h-3 w-0.5 ${quote && i < 16 ? "bg-acid" : "bg-border"}`} />)}</span>
                    {quote ? "81%" : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="pt-2 text-center text-xs text-muted-foreground">Non-custodial · Memo is embedded automatically</p>
            <button disabled={!!blocker} onClick={() => setExecuting(true)}
              className="btn-cta w-full py-5 text-base font-semibold">
              {blocker ? blocker.charAt(0) + blocker.slice(1).toLowerCase() : "Swap to Bitcoin"}
            </button>
          </div>
        </section>

        {/* Route matrix */}
        <aside>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold">Best routes</h2>
            <button onClick={() => setNonce((n) => n + 1)} className="font-mono text-[11px] text-muted-foreground hover:text-xlm">Refresh</button>
          </div>
          {scanning && (
            <div className="panel mb-3 p-4 font-mono text-xs text-xlm">
              Comparing providers<span className="caret">...</span>
              <div className="relative mt-2 h-0.5 overflow-hidden bg-muted"><div className="absolute h-full w-1/3 bg-xlm scan-bar" /></div>
            </div>
          )}
          {!scanning && quotes.length === 0 && (
            <div className="panel p-8 text-center font-mono text-xs text-muted-foreground">Enter an amount to compare SideShift, FixedFloat, ChangeNOW & CCTP+Chainflip<span className="caret">_</span></div>
          )}
          <div className={`space-y-3 transition ${scanning ? "opacity-40" : ""}`}>
            {quotes.map((q, i) => {
              const badge = i === 0 ? "BEST RETURN" : q.id === fastest?.id ? "FASTEST" : q.badge;
              const active = q.id === selected;
              return (
                <button key={q.id} onClick={() => setSelected(q.id)}
                  className={`${active ? "" : "panel"} block w-full p-5 text-left transition glitch-hover ${active ? "panel-ink" : "hover:glow-btc"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-lg font-bold">{q.provider}</div>
                      <div className="font-mono text-[11px] opacity-60">{q.tagline}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${badge === "BEST RETURN" ? "bg-acid/15 text-acid" : badge === "FASTEST" ? "bg-amber/20 text-amber" : badge === "100% DEFI" ? "bg-sky/20 text-sky" : "bg-muted text-muted-foreground"}`}>{badge}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div><div className="opacity-60">ETA</div>~{q.etaMin} min{q.etaMin > 1 ? "s" : ""}</div>
                    <div><div className="opacity-60">FEE</div>${q.feeUsd.toFixed(2)} <span className="opacity-60">/ {(q.feeBtc * 1e8).toFixed(0)} sats</span></div>
                    <div className="text-right"><div className="opacity-60">NET RECEIVED</div><span className="font-semibold">{q.btcOut.toFixed(8)}</span></div>
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
