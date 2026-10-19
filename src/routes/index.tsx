import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Hud, type Wallet } from "@/components/s2b/Hud";
import { ExecutionModal } from "@/components/s2b/ExecutionModal";
import { TokenSelect, TokenLogo } from "@/components/s2b/TokenSelect";
import {
  fetchAllQuotes, isLiveMode, BTC_USD, validateDestination, USD_PRICE,
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

  const pill = (on: boolean) => `flex-1 rounded-[7px] py-1.5 text-xs transition ${on ? "bg-panel font-medium shadow-sm" : "text-muted-foreground"}`;

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
              <span>~ ${(amt * USD_PRICE[token]).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="relative z-10 -my-3 flex justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-background bg-panel text-lg">↓</div>
          </div>

          {/* Buy */}
          <div className="panel panel-receive p-5">
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
                {quote && !scanning ? quote.btcOut.toFixed(8) : "0"}
              </div>
            </div>
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {quote && !scanning ? `~ $${(quote.btcOut * BTC_USD).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "\u00a0"}
            </div>
            <input value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder={net === "lightning" ? "Lightning invoice (lnbc…)" : "Your BTC address (bc1…)"}
              className={`mt-4 w-full rounded-[10px] bg-muted px-3 py-3 text-xs outline-none transition ${addr === "invalid" ? "ring-1 ring-destructive" : "focus:ring-1 focus:ring-foreground/40"}`} />
            {addr !== "empty" && <div className={`mt-2 text-[11px] ${ADDR_LABEL[addr]?.[1]}`}>{ADDR_LABEL[addr]?.[0]}</div>}
          </div>
        </div>

        {/* Details */}
        <div className="mt-5 space-y-3 px-1 text-sm">
          {quotes.length > 1 && (
            <div className="flex rounded-full bg-muted p-0.5 text-[11px]">
              {([["cheap", "Best rate", quotes[0]], ["fast", "Fastest", fastest]] as const).map(([k, label, q]) => (
                <button key={k} onClick={() => q && setSelected(q.id)}
                  className={`flex-1 rounded-full px-2.5 py-1.5 transition ${q && selected === q.id ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <Detail k="Rate" v={quote && amt ? `1 ${token} = ${Math.round((quote.btcOut / amt) * 1e8)} sats` : scanning ? "Finding best rate…" : "—"} />
          <Detail k="Fee" v={quote ? `$${quote.feeUsd.toFixed(2)}` : "—"} />
          <Detail k="Time" v={quote ? `~${quote.etaMin} min` : "—"} />
          <Detail k="Price" v={quote ? (quote.live ? "Live" : "Estimated") : "—"} />
        </div>

        <button disabled={!!blocker && !!wallet} onClick={() => (wallet ? setExecuting(true) : document.getElementById("connect-wallet")?.click())}
          className="btn-cta mt-6 w-full py-4 text-base font-bold">
          {!wallet ? "Connect wallet" : blocker ? blocker.charAt(0) + blocker.slice(1).toLowerCase() : "Swap"}
        </button>
      </main>
      {executing && quote && wallet && (
        <ExecutionModal quote={quote} token={token} amount={amt} dest={dest} walletName={wallet.name} onClose={() => setExecuting(false)} />
      )}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
