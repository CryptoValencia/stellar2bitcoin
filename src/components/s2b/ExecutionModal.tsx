import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, LoaderCircle, ExternalLink, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getSwapOrder } from "@/lib/sideshift.functions";
import { orderIsFinal, type SwapOrder } from "@/lib/sideshift-schema";
import { explorerUrl } from "@/lib/swap-extras";
import { paySwapWithWallet, savedPaymentHash } from "@/services/walletPayment";
import type { Wallet } from "@/services/walletService";

const STATUS: Record<string, string> = {
  waiting: "Awaiting deposit", pending: "Deposit detected", processing: "Processing swap",
  review: "Under review", settled: "Swap complete",
  refund: "Refund required", refunding: "Refund in progress", refunded: "Refund complete", expired: "Order expired",
};
export function ExecutionModal({ order: initial, wallet, requestId, onClose }: { order: SwapOrder; wallet: Wallet | null; requestId?: string; onClose: () => void }) {
  const [order, setOrder] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  useEffect(() => { try { setPaymentHash(savedPaymentHash(initial)); } catch { /* Keep manual payment available when storage is blocked. */ } }, [initial]);
  const refresh = useServerFn(getSwapOrder);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    if (orderIsFinal(order.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await refresh({ data: { requestId } });
        if (cancelled) return;
        if (result.ok && result.order) { setOrder(result.order); setError(""); }
        else if (!result.ok) setError(result.error);
      } catch { if (!cancelled) setError("Couldn't refresh status. Your order remains saved."); }
      if (!cancelled) timer = setTimeout(poll, 10000);
    };
    timer = setTimeout(poll, 10000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh, order.status, requestId]);
  const remaining = Math.max(0, Math.floor((Date.parse(order.expiresAt) - now) / 1000));
  const depositAllowed = order.status === "waiting" && remaining > 0;
  const isBtcDeposit = order.depositCoin.toUpperCase() === "BTC";
  const settleCoin = order.settleCoin.toUpperCase();
  const statusLabel = order.status === "settling" ? (settleCoin === "BTC" ? "Sending Bitcoin" : "Sending Stellar") : STATUS[order.status] ?? "Checking swap status";
  let uri: URL | null = null;
  if (!isBtcDeposit) {
    uri = new URL("web+stellar:pay");
    uri.searchParams.set("destination", order.depositAddress);
    uri.searchParams.set("amount", order.depositAmount);
    if (order.depositCoin.toUpperCase() !== "XLM") {
      uri.searchParams.set("asset_code", order.depositCoin.toUpperCase());
      // The provider only currently supports Circle USDC on Stellar.
      uri.searchParams.set("asset_issuer", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    }
    if (order.depositMemo) { uri.searchParams.set("memo", order.depositMemo); uri.searchParams.set("memo_type", "MEMO_TEXT"); }
  }
  const qrValue = isBtcDeposit ? `bitcoin:${order.depositAddress}?amount=${order.depositAmount}` : uri?.toString() ?? order.depositAddress;
  const depositLink = explorerUrl(order.depositCoin, order.depositTxHash ?? paymentHash, order.depositNetwork);
  const settleLink = explorerUrl(order.settleCoin, order.settleTxHash, order.settleNetwork);
  const pay = async () => {
    if (!wallet || paying || paymentHash) return;
    setPaying(true); setError("");
    try { await paySwapWithWallet(wallet, order, setPaymentHash); }
    catch (e) { setError(e instanceof Error ? e.message : "Payment was cancelled or couldn't be sent. Check your wallet before retrying."); }
    finally { setPaying(false); }
  };
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(""), 2000); }
    catch { setError("Couldn't copy. Select and copy the value manually."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !paying) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-panel" onEscapeKeyDown={(e) => { if (paying) e.preventDefault(); }} onPointerDownOutside={(e) => { if (paying) e.preventDefault(); }}>
      <DialogTitle className="text-lg">{statusLabel}</DialogTitle>
      <DialogDescription className="text-xs">Order {order.id}</DialogDescription>
      <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
        <span>{order.depositAmount} {order.depositCoin.toUpperCase()}</span><span>→</span><span>{order.settleAmount} {settleCoin}</span>
      </div>
      {depositAllowed ? <>
        {!isBtcDeposit && wallet && <Button className="btn-cta h-auto whitespace-normal py-3" disabled={paying || !!paymentHash} onClick={pay}>{paying ? <LoaderCircle className="animate-spin" /> : paymentHash ? <Check /> : <WalletIcon />}{paying ? "Awaiting wallet approval…" : paymentHash ? "Payment submitted — awaiting deposit" : `Sign and send with ${wallet.name}`}</Button>}
        {paymentHash && <p className="text-xs text-muted-foreground">A payment has been submitted. Do not send a second deposit.</p>}
        <p className="text-xs text-muted-foreground">{isBtcDeposit ? "Send the exact amount before the timer expires." : "Send the exact amount and memo before the timer expires."}</p>
        <div className="flex justify-center"><div className="bg-qr-surface p-3"><QRCodeSVG value={qrValue} size={160} /></div></div>
        <div className="space-y-3">
          {[["Address", order.depositAddress], ["Amount", order.depositAmount], ...(!isBtcDeposit && order.depositMemo ? [["Memo", order.depositMemo]] : [])].map(([label, value]) => label && value ? <div key={label} className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><div className="text-[11px] text-muted-foreground">{label}</div><div className="select-all break-all text-xs">{value}</div></div>
            <Button variant="ghost" size="icon" aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`} onClick={() => copy(value, label)}>{copied === label ? <Check /> : <Copy />}</Button>
          </div> : null)}
        </div>
        {!isBtcDeposit && order.depositMemo && <p className="text-xs text-destructive">The memo is required. A missing memo can prevent your funds being credited.</p>}
        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Deposit window</span><span>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></div>
        {uri && !paymentHash && <Button asChild variant="secondary"><a href={uri.toString()}>Open wallet to send</a></Button>}
      </> : <p className="flex items-center gap-2 text-sm">{!orderIsFinal(order.status) && <LoaderCircle className="h-4 w-4 animate-spin" />}{order.status === "waiting" ? "Deposit window expired. Do not send funds." : statusLabel}</p>}
      <div className="text-xs"><span className="text-muted-foreground">To </span><span className="break-all">{order.settleAddress}</span></div>
      {(depositLink || settleLink) && <div className="flex flex-wrap gap-2">{depositLink && <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs"><a href={depositLink} target="_blank" rel="noopener noreferrer">Deposit transaction<ExternalLink /></a></Button>}{settleLink && <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs"><a href={settleLink} target="_blank" rel="noopener noreferrer">Payout transaction<ExternalLink /></a></Button>}</div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button variant="secondary" disabled={paying} onClick={onClose}>{orderIsFinal(order.status) ? "Done" : "Close"}</Button>
    </DialogContent>
  </Dialog>;
}
