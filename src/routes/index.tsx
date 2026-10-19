import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { TokenSelect, TokenLogo } from "@/components/s2b/TokenSelect";
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

  const [showRoutes, setShowRoutes] = useState(false);
  const pill = (on: boolean) => `flex-1 rounded-[7px] py-1.5 text-xs transition ${on ? "bg-panel font-medium shadow-sm" : "text-muted-foreground"}`;

  return (
    <div className="relative flex min-h-screen flex-col">
      <Hud wallet={wallet} onConnect={setWallet} />
      <main className="relative z-10 mx-auto w-full max-w-md flex-1 px-4 py-10">
        <h1 className="mb-4 text-sm font-medium text-muted-foreground">Swap {token} → BTC</h1>

        <div className="space-y-2">
          {/* Send */}
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">You send</span>
              <TokenSelect value={token} onChange={setToken} />
            </div>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0"
              className="mt-3 w-full bg-transparent font-display text-4xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40" />
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span>≈ ${(amt * USD_PRICE[token]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              {wallet && <button onClick={() => setAmount(String(+balance.toFixed(token === "XLM" ? 4 : 2)))} className="hover:text-foreground">Balance {balance.toLocaleString()} · <b>MAX</b></button>}
            </div>
          </div>

          {/* Receive */}
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">You receive</span>
              <span className="flex items-center gap-2 rounded-[8px] bg-muted py-1 pl-1 pr-2.5 text-xs font-medium"><TokenLogo symbol="BTC" /> BTC</span>
            </div>
            <div className={`mt-3 font-display text-4xl font-medium tracking-tight ${!quote || scanning ? "text-muted-foreground/40" : ""}`}>
              {quote && !scanning ? quote.btcOut.toFixed(8) : "0"}
            </div>
            <div className="mt-4 flex rounded-[10px] bg-muted p-1">
              <button onClick={() => { setNet("mainnet"); setDest(""); }} className={pill(net === "mainnet")}>On-chain</button>
              <button onClick={() => { setNet("lightning"); setDest(""); }} className={pill(net === "lightning")}>Lightning</button>
            </div>
            <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={net === "lightning" ? "Paste Lightning invoice" : "Paste your BTC address"}
              className={`mt-3 w-full rounded-[10px] bg-muted px-3 py-2.5 text-xs outline-none ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground"}`} />
            {addr !== "empty" && <div className={`mt-2 font-mono text-[11px] ${ADDR_LABEL[addr]?.[1]}`}>{ADDR_LABEL[addr]?.[0]}</div>}
          </div>

          {/* Route summary */}
          {quote && !scanning && (
            <div className="panel px-5 py-3">
              <button onClick={() => setShowRoutes(!showRoutes)} className="flex w-full items-center justify-between text-sm">
                <span className="text-muted-foreground">Route</span>
                <span className="font-mono">{quote.provider} · ~{quote.etaMin} min · ${quote.feeUsd.toFixed(2)} fee <span className="text-muted-foreground">{showRoutes ? "▴" : "▾"}</span></span>
              </button>
              {showRoutes && (
                <div className="mt-3 space-y-1">
                  {quotes.map((q, i) => (
                    <button key={q.id} onClick={() => { setSelected(q.id); setShowRoutes(false); }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-mono text-xs ${q.id === selected ? "bg-ink text-ink-foreground" : "hover:bg-muted"}`}>
                      <span>{q.provider}{i === 0 && <span className="ml-2 text-acid">best</span>}{q.id === fastest?.id && i !== 0 && <span className="ml-2 text-amber">fastest</span>}</span>
                      <span>{q.btcOut.toFixed(8)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {scanning && <div className="text-center font-mono text-xs text-muted-foreground">Finding best rate…</div>}

          <button disabled={!!blocker && !!wallet} onClick={() => (wallet ? setExecuting(true) : document.getElementById("connect-wallet")?.click())}
            className="btn-cta !mt-3 w-full py-3.5 text-sm font-medium">
            {!wallet ? "Connect wallet" : blocker ? blocker.charAt(0) + blocker.slice(1).toLowerCase() : "Swap"}
          </button>
          <p className="text-center font-mono text-[10px] text-muted-foreground">{live ? "Live" : "Simulation mode"} · non-custodial</p>
        </div>
      </main>
      <DevDrawer onChange={() => setNonce((n) => n + 1)} />

      {executing && quote && wallet && (
        <ExecutionModal quote={quote} token={token} amount={amt} dest={dest} walletName={wallet.name} onClose={() => setExecuting(false)} />
      )}
    </div>
  );
}
