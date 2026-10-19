import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { createSwapOrder, getSwapOrder } from "@/lib/sideshift.functions";
import { getMarketPrices, type MarketPrices } from "@/lib/market.functions";
import { chooseExecutableQuotes, orderIsFinal, type SwapOrder } from "@/lib/sideshift-schema";
import { quoteMatches } from "@/lib/quote-safety";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { TokenSelect, TokenLogo } from "@/components/s2b/TokenSelect";
import {
  fetchAllQuotes, validateDestination,
  type BtcNet, type Quote, type RouteId, type Token,
} from "@/services/aggregatorService";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stellar2Bitcoin — Swap XLM & USDC to BTC" },
      { name: "description", content: "Cross-chain aggregator routing Stellar assets to Bitcoin mainnet and Lightning at the best rate." },
      { property: "og:title", content: "Stellar2Bitcoin — S2B Protocol" },
      { property: "og:description", content: "Swap Stellar assets to Bitcoin with a simple wallet connection, clear rates and deposit tracking." },
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
  const [order, setOrder] = useState<SwapOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const createOrder = useServerFn(createSwapOrder);
  const recoverOrder = useServerFn(getSwapOrder);
  const loadPrices = useServerFn(getMarketPrices);
  useEffect(() => {
    let active = true;
    const load = () => loadPrices().then((r) => { if (active && r.ok && r.prices) setPrices(r.prices); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { active = false; clearInterval(t); };
  }, [loadPrices]);
  useEffect(() => {
    let active = true;
    recoverOrder().then((result) => {
      if (active && result.ok && result.order && !orderIsFinal(result.order.status)) setOrder(result.order);
    }).catch(() => {});
    return () => { active = false; };
  }, [recoverOrder]);
  const [nonce, setNonce] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => setNonce((n) => n + 1), 60000);
    return () => { clearInterval(clock); clearInterval(refresh); };
  }, []);

  const amt = parseFloat(amount) || 0;
  const balance = wallet ? { XLM: wallet.xlm, USDC: wallet.usdc }[token] : 0;

  useEffect(() => {
    setQuotes([]); setSelected(null); setOrderError("");
    if (amt <= 0 || !Number.isFinite(amt)) { setScanning(false); return; }
    setScanning(true);
    let cancel = false;
    const t = setTimeout(async () => {
      let q: Quote[] = [];
      try { q = await fetchAllQuotes(token, amt, net); } catch { /* unavailable */ }
      if (cancel) return;
      const executable = chooseExecutableQuotes(q);
      setQuotes(executable); setScanning(false);
      setSelected((s) => (executable.find((x) => x.id === s) ? s : executable[0]?.id ?? null));
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [amt, token, net, nonce]);

  const candidate = quotes.find((q) => q.id === selected);
  const quote = candidate?.snapshot && quoteMatches(candidate.snapshot, { from: token, amount: amt, lightning: net === "lightning" }, now || Date.now()) ? candidate : null;
  const addr = validateDestination(dest, net);
  const fastest = useMemo(() => quotes.reduce<Quote | null>((a, b) => (b.etaMin !== null && (!a || a.etaMin === null || b.etaMin < a.etaMin) ? b : a), null), [quotes]);

  const blocker = !wallet ? "CONNECT WALLET FIRST" : amt <= 0 ? "ENTER AMOUNT" : amt > balance ? "INSUFFICIENT BALANCE"
    : addr === "empty" || addr === "invalid" ? "ENTER VALID DESTINATION" : scanning ? "FINDING PRICE" : !quote ? "SWAP UNAVAILABLE" : null;

  const startSwap = async () => {
    if (!wallet) { document.getElementById("connect-wallet")?.click(); return; }
    if (order && !orderIsFinal(order.status)) { setExecuting(true); return; }
    if (blocker || creating || !quote?.snapshot || !quote.quoteSignature) return;
    setCreating(true); setOrderError("");
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    try {
      const result = await createOrder({ data: { from: token, amount: amt, lightning: net === "lightning", destination: dest, refundAddress: wallet.address, requestId: id, quote: quote.snapshot, quoteSignature: quote.quoteSignature } });
      if (result.ok) { setOrder(result.order); setExecuting(true); setRequestId(null); }
      else setOrderError(result.error);
    } catch { setOrderError("Couldn't confirm your order. No payment was sent; please retry this request."); }
    finally { setCreating(false); }
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <Hud wallet={wallet} onConnect={setWallet} />
      <main className="relative z-10 mx-auto w-full max-w-[460px] flex-1 px-4 py-12">
        <div className="relative">
          {/* Sell */}
          <div className="panel p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">From</div>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="shrink-0">
                <TokenSelect value={token} onChange={setToken} />
                <div className="mt-2 text-xs text-muted-foreground">{wallet ? `${balance.toLocaleString()} ${token}` : "—"}</div>
              </div>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0"
                className="w-full min-w-0 bg-transparent text-right text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <button disabled={!wallet} onClick={() => setAmount(String(+balance.toFixed(token === "XLM" ? 4 : 2)))}
                className="rounded-full border border-border px-3 py-1 font-bold text-foreground transition hover:bg-muted disabled:opacity-40">MAX</button>
              <span>{amt > 0 && prices ? `≈ $${(amt * (token === "XLM" ? prices.xlmUsd : 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u00a0"}</span>
            </div>
          </div>

          <div className="relative z-10 -my-3 flex justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-background bg-panel text-lg">↓</div>
          </div>

          {/* Buy */}
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">To</span>
              <div className="flex rounded-full bg-muted p-0.5 text-[11px]">
                {(["mainnet", "lightning"] as const).map((n) => (
                  <button key={n} onClick={() => { setNet(n); setDest(""); }}
                    className={`rounded-full px-2.5 py-1 transition ${net === n ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {n === "mainnet" ? "On-chain" : "Lightning"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-start justify-between gap-4">
              <span className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-muted py-1.5 pl-1.5 pr-4 text-xl font-bold"><TokenLogo symbol="BTC" size={32} /> BTC</span>
              <div className={`min-w-0 truncate text-right text-4xl font-bold tracking-tight ${!quote || scanning ? "text-muted-foreground/40" : ""}`}>
                {quote && !scanning ? quote.btcOut.toFixed(8) : scanning ? "…" : "—"}
              </div>
            </div>
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {quote && !scanning && prices ? `≈ $${(quote.btcOut * prices.btcUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u00a0"}
            </div>
            <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={net === "lightning" ? "Lightning invoice (lnbc…)" : "Your BTC address (bc1…)"}
              className={`mt-4 w-full rounded-[10px] bg-muted px-3 py-3 text-xs outline-none transition ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground/40"}`} />
            {addr !== "empty" && <div className={`mt-2 text-[11px] ${ADDR_LABEL[addr]?.[1]}`}>{ADDR_LABEL[addr]?.[0]}</div>}
          </div>
        </div>

        {/* Details */}
        <div className="mt-5 space-y-3 px-1 text-sm">
          {quotes.length > 1 && fastest && (
            <div className="flex rounded-full bg-muted p-0.5 text-[11px]">
              {([["cheap", "Best rate", quotes[0]], ["fast", "Fastest", fastest]] as const).map(([k, label, q]) => (
                <button key={k} onClick={() => q && setSelected(q.id)}
                  className={`flex-1 rounded-full px-2.5 py-1.5 transition ${q && selected === q.id ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <Detail k="Rate" v={quote && !scanning && amt && prices
            ? `1 ${token} = ${((quote.btcOut / amt) * 1e8).toFixed(2)} sats · ≈ $${((quote.btcOut / amt) * prices.btcUsd).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
            : scanning ? "Updating…" : "—"} />
          <Detail k="Fee" v={quote && !scanning ? "Included in rate" : "—"} />
          <Detail k="Time" v={quote && !scanning && quote.etaMin !== null ? `~${quote.etaMin} min` : "—"} />
          <Detail k="Price" v={quote && !scanning ? "Live · fixed" : "—"} />
        </div>

        <Button disabled={creating || (!!blocker && !!wallet && !order)} onClick={startSwap}
          className="btn-cta mt-6 h-auto w-full py-4 text-base font-bold">
          {creating ? "Creating swap…" : !wallet ? "Connect wallet" : order && !orderIsFinal(order.status) ? "View current swap" : blocker ? blocker.charAt(0) + blocker.slice(1).toLowerCase() : "Swap"}
        </Button>
        {orderError && <p role="alert" className="mt-3 text-xs text-destructive">{orderError}</p>}
        {order && !orderIsFinal(order.status) && <Button variant="link" className="mt-2 w-full text-xs" onClick={() => setExecuting(true)}>View current swap</Button>}
      </main>
      {executing && order && (
        <ExecutionModal order={order} onClose={() => setExecuting(false)} />
      )}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
