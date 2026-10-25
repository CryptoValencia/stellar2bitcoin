import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { History, Wallet as WalletIcon } from "lucide-react";
import { RecentSwaps } from "@/components/s2b/RecentSwaps";
import { shortcutAmount } from "@/lib/swap-extras";
import { createSwapOrder, getSwapOrder } from "@/lib/sideshift.functions";
import { getMarketPrices, type MarketPrices } from "@/lib/market.functions";
import { chooseExecutableQuotes, orderIsFinal, type SwapOrder } from "@/lib/sideshift-schema";
import { lockCountdown, quoteMatches } from "@/lib/quote-safety";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { TokenSelect, TokenLogo } from "@/components/s2b/TokenSelect";
import {
  fetchQuoteResult, validateDestination, validateStellar,
  type BtcNet, type Quote, type RouteId, type SwapCoin, type Token,
} from "@/services/aggregatorService";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stellar2Bitcoin — Swap XLM & USDC ⇄ BTC" },
      { name: "description", content: "Swap Stellar assets to Bitcoin and Bitcoin back to Stellar at the best live rate, on-chain or Lightning." },
      { property: "og:title", content: "Stellar2Bitcoin — S2B Protocol" },
      { property: "og:description", content: "Swap Stellar assets and Bitcoin in both directions with a simple wallet connection, clear rates and deposit tracking." },
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
  stellar: ["VALID STELLAR ADDRESS (G…)", "text-acid"],
  invalid: ["INVALID ADDRESS", "text-destructive"],
};

function Index() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [token, setToken] = useState<Token>("XLM");
  const [amount, setAmount] = useState("");
  const [net, setNet] = useState<BtcNet>("mainnet");
  const [dest, setDest] = useState("");
  const [refund, setRefund] = useState("");
  const [reverse, setReverse] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [scanning, setScanning] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<RouteId | null>(null);
  const [executing, setExecuting] = useState(false);
  const [order, setOrder] = useState<SwapOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const [more, setMore] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [orderRequestId, setOrderRequestId] = useState<string | undefined>();
  const [historyOrder, setHistoryOrder] = useState<{ order: SwapOrder; requestId: string } | null>(null);
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
    recoverOrder({ data: {} }).then((result) => {
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
  const fromCoin: SwapCoin = reverse ? "BTC" : token;
  const toCoin: SwapCoin = reverse ? token : "BTC";
  const balance = wallet && !reverse ? { XLM: wallet.xlmSpendable ?? 0, USDC: wallet.usdc }[token] : 0;

  // The Stellar wallet doubles as the payout address when receiving XLM/USDC.
  useEffect(() => {
    if (reverse && wallet) setDest((d) => d || wallet.address);
  }, [reverse, wallet]);

  useEffect(() => {
    setQuotes([]); setSelected(null); setOrderError(""); setQuoteError("");
    if (amt <= 0 || !Number.isFinite(amt)) { setScanning(false); return; }
    setScanning(true);
    let cancel = false;
    const t = setTimeout(async () => {
      const result = await fetchQuoteResult(fromCoin, toCoin, amt, net);
      if (cancel) return;
      const executable = chooseExecutableQuotes(result.quotes);
      setQuoteError(result.error);
      setQuotes(executable); setScanning(false);
      setSelected((s) => (executable.find((x) => x.id === s) ? s : executable[0]?.id ?? null));
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [amt, fromCoin, toCoin, net, nonce]);

  const candidate = quotes.find((q) => q.id === selected);
  const quote = candidate?.snapshot && quoteMatches(candidate.snapshot, { from: fromCoin, to: toCoin, amount: amt, lightning: net === "lightning" }, now || Date.now()) ? candidate : null;
  const addr = reverse ? validateStellar(dest) : validateDestination(dest, net);
  const refundAddr = reverse ? validateDestination(refund, "mainnet") : "empty";
  const destOk = reverse ? addr === "stellar" : addr !== "empty" && addr !== "invalid";
  const refundOk = !reverse || (refundAddr === "taproot" || refundAddr === "segwit" || refundAddr === "legacy");
  const fastest = useMemo(() => quotes.reduce<Quote | null>((a, b) => (b.etaMin !== null && (!a || a.etaMin === null || b.etaMin < a.etaMin) ? b : a), null), [quotes]);
  const outDecimals = reverse ? (token === "USDC" ? 2 : 4) : 8;

  const blocker = !wallet ? "CONNECT WALLET FIRST" : amt <= 0 ? "ENTER AMOUNT" : !reverse && amt > balance ? "INSUFFICIENT BALANCE"
    : !refundOk ? "ENTER VALID REFUND ADDRESS" : !destOk ? "ENTER VALID DESTINATION" : scanning ? "FINDING PRICE" : !quote ? "SWAP UNAVAILABLE" : null;

  const flip = () => { setReverse((r) => !r); setDest(""); setRefund(""); };

  const startSwap = async () => {
    if (order && !orderIsFinal(order.status)) { setExecuting(true); return; }
    if (!wallet) { document.getElementById("connect-wallet")?.click(); return; }
    if (blocker || creating || !quote?.snapshot || !quote.quoteSignature) return;
    setCreating(true); setOrderError("");
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    try {
      const result = await createOrder({ data: {
        from: fromCoin, to: toCoin, amount: amt, lightning: net === "lightning",
        destination: dest, refundAddress: reverse ? refund : wallet.address,
        requestId: id, quote: quote.snapshot, quoteSignature: quote.quoteSignature,
      } });
      if (result.ok) { setOrder(result.order); setOrderRequestId(id); setExecuting(true); setRequestId(null); }
      else setOrderError(result.error);
    } catch { setOrderError("Couldn't confirm your order. No payment was sent; please retry this request."); }
    finally { setCreating(false); }
  };

  const netToggle = (
    <div className="flex rounded-full bg-muted p-0.5 text-[11px]">
      {(["mainnet", "lightning"] as const).map((n) => (
        <button key={n} onClick={() => { setNet(n); setDest(""); }}
          className={`rounded-full px-2.5 py-1 transition ${net === n ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"}`}>
          {n === "mainnet" ? "On-chain" : "Lightning"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <Hud wallet={wallet} onConnect={setWallet} />
      <main className="relative z-10 mx-auto w-full max-w-[460px] flex-1 px-4 py-12">
        <div className="relative">
          {/* Sell */}
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">From</div>
              {reverse && netToggle}
            </div>
            <div className="mt-3 flex items-start justify-between gap-4">
              {reverse ? (
                <span className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-muted py-1.5 pl-1.5 pr-4 text-xl font-bold"><TokenLogo symbol="BTC" size={32} /> BTC</span>
              ) : (
                <div className="shrink-0">
                  <TokenSelect value={token} onChange={setToken} />
                  <div className="mt-2 text-xs text-muted-foreground">{wallet ? `${balance.toLocaleString()} ${token}` : "—"}</div>
                </div>
              )}
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0"
                className="w-full min-w-0 bg-transparent text-right text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40" />
            </div>
            {reverse ? (
              <div>
                <div className="mt-4 text-right text-xs text-muted-foreground">{amt > 0 && prices ? `≈ $${(amt * prices.btcUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u00a0"}</div>
                <input value={refund} onChange={(e) => setRefund(e.target.value.trim())} placeholder="Your BTC address (refund if the swap fails)"
                  className={`mt-3 w-full rounded-[10px] bg-muted px-3 py-3 text-xs outline-none transition ${refundAddr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground/40"}`} />
                {refundAddr !== "empty" && <div className={`mt-2 text-[11px] ${ADDR_LABEL[refundAddr]?.[1]}`}>{ADDR_LABEL[refundAddr]?.[0]}</div>}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex gap-1">{([25, 50, 100] as const).map((percent) => <Button key={percent} variant="outline" size="sm" disabled={!wallet} onClick={() => setAmount(shortcutAmount(balance, percent, token))}
                  className="h-7 rounded-full px-2 text-[10px]">{percent === 100 ? "MAX" : `${percent}%`}</Button>)}</div>
                <span>{amt > 0 && prices ? `≈ $${(amt * (token === "XLM" ? prices.xlmUsd : 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u00a0"}</span>
              </div>
            )}
          </div>

          <div className="relative z-10 -my-3 flex justify-center">
            <button onClick={flip} aria-label="Swap direction" title="Swap direction"
              className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-background bg-panel text-lg transition hover:text-acid">
              {reverse ? "↑" : "↓"}
            </button>
          </div>

          {/* Buy */}
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">To</span>
              {!reverse && netToggle}
            </div>
            <div className="mt-3 flex items-start justify-between gap-4">
              {reverse ? (
                <div className="shrink-0"><TokenSelect value={token} onChange={setToken} /></div>
              ) : (
                <span className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-muted py-1.5 pl-1.5 pr-4 text-xl font-bold"><TokenLogo symbol="BTC" size={32} /> BTC</span>
              )}
              <div className={`min-w-0 truncate text-right text-4xl font-bold tracking-tight ${!quote || scanning ? "text-muted-foreground/40" : ""}`}>
                {quote && !scanning ? quote.outAmount.toFixed(outDecimals) : scanning ? "…" : "—"}
              </div>
            </div>
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {quote && !scanning && prices ? `≈ $${(quote.outAmount * (reverse ? (token === "XLM" ? prices.xlmUsd : 1) : prices.btcUsd)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u00a0"}
            </div>
            <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={reverse ? "Your Stellar address (G…)" : net === "lightning" ? "Lightning invoice (lnbc…)" : "Your BTC address (bc1…)"}
              className={`mt-4 w-full rounded-[10px] bg-muted px-3 py-3 text-xs outline-none transition ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground/40"}`} />
            {addr !== "empty" && <div className={`mt-2 text-[11px] ${ADDR_LABEL[addr]?.[1]}`}>{ADDR_LABEL[addr]?.[0]}</div>}
            {reverse && wallet && <Button variant="link" size="sm" className="mt-2 h-auto max-w-full whitespace-normal p-0 text-[11px]" onClick={() => setDest(wallet.address)}><WalletIcon />Use my connected wallet</Button>}
          </div>
        </div>

        {/* Details */}
        <div className="mt-5 space-y-3 px-1 text-sm">
          {quoteError && !scanning && <div role="alert" className="space-y-2 text-xs text-muted-foreground">
            <p>{quoteError}</p>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setNonce((n) => n + 1)}>Retry quote</Button>
          </div>}
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
          <Detail k="Rate" v={quote && !scanning && amt ? (reverse
            ? `1 BTC = ${(quote.outAmount / amt).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toCoin}${prices ? ` · ≈ $${((quote.outAmount / amt) * (toCoin === "XLM" ? prices.xlmUsd : 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ""}`
            : `1 ${token} = ${((quote.outAmount / amt) * 1e8).toFixed(2)} sats${prices ? ` · ≈ $${((quote.outAmount / amt) * prices.btcUsd).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ""}`)
            : scanning ? "Updating…" : "—"} />
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
            className="flex w-full items-center justify-between text-sm">
            <span className="text-muted-foreground">Fees included in price</span>
            <span className={`text-muted-foreground transition-transform ${more ? "rotate-180" : ""}`}>▾</span>
          </button>
          {more && (
            <div className="space-y-2 text-sm">
              <Detail k="Price locked" v={quote?.snapshot ? lockCountdown(quote.snapshot.expiresAt, now) : "—"} />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The amount above is fixed for that time. It does not move with the market, and nothing is deducted when you pay.
              </p>
            </div>
          )}
          <Detail k="Arrives" v={reverse
            ? (net === "lightning" ? "≈ 1–3 min to your wallet" : "≈ 10–30 min to your wallet")
            : net === "lightning" ? "≈ 1–3 min to your wallet" : "≈ 5–10 min to your wallet"} />
        </div>

        <Button disabled={creating || (!!blocker && !!wallet && !order)} onClick={startSwap}
          className="btn-cta mt-6 h-auto w-full py-4 text-base font-bold">
          {creating ? "Creating swap…" : order && !orderIsFinal(order.status) ? "View current swap" : !wallet ? "Connect wallet" : blocker ? blocker.charAt(0) + blocker.slice(1).toLowerCase() : "Swap"}
        </Button>
        {orderError && <p role="alert" className="mt-3 text-xs text-destructive">{orderError}</p>}
        {order && !orderIsFinal(order.status) && <Button variant="link" className="mt-2 w-full text-xs" onClick={() => setExecuting(true)}>View current swap</Button>}
        <div className="mt-4 flex justify-center"><Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:bg-muted! hover:text-foreground!" onClick={() => setHistoryOpen(true)}><History />Recent swaps</Button></div>
      </main>
      {executing && order && (
        <ExecutionModal key={`${order.provider}:${order.id}`} order={order} wallet={wallet} requestId={orderRequestId} onClose={() => setExecuting(false)} />
      )}
      {historyOpen && <RecentSwaps onClose={() => setHistoryOpen(false)} onSelect={(recent, id) => { setHistoryOrder({ order: recent, requestId: id }); setHistoryOpen(false); }} />}
      {historyOrder && <ExecutionModal key={`${historyOrder.order.provider}:${historyOrder.order.id}`} order={historyOrder.order} wallet={wallet} requestId={historyOrder.requestId} onClose={() => setHistoryOrder(null)} />}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
