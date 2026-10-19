import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getSwapOrder } from "@/lib/sideshift.functions";
import { orderIsFinal, type SwapOrder } from "@/lib/sideshift-schema";

const STATUS: Record<string, string> = {
  waiting: "Awaiting deposit", pending: "Deposit detected", processing: "Processing swap",
  review: "Under review", settling: "Sending Bitcoin", settled: "Swap complete",
  refund: "Refund required", refunding: "Refund in progress", refunded: "Refund complete", expired: "Order expired",
};
export function ExecutionModal({ order: initial, onClose }: { order: SwapOrder; onClose: () => void }) {
  const [order, setOrder] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
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
        const result = await refresh();
        if (cancelled) return;
        if (result.ok && result.order) { setOrder(result.order); setError(""); }
        else if (!result.ok) setError(result.error);
      } catch { if (!cancelled) setError("Couldn't refresh status. Your order remains saved."); }
      if (!cancelled) timer = setTimeout(poll, 10000);
    };
    timer = setTimeout(poll, 10000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh, order.status]);
  const remaining = Math.max(0, Math.floor((Date.parse(order.expiresAt) - now) / 1000));
  const depositAllowed = order.status === "waiting" && remaining > 0;
  const uri = new URL("web+stellar:pay");
  uri.searchParams.set("destination", order.depositAddress);
  uri.searchParams.set("amount", order.depositAmount);
  if (order.depositCoin.toUpperCase() !== "XLM") {
    uri.searchParams.set("asset_code", order.depositCoin.toUpperCase());
    // The provider only currently supports Circle USDC on Stellar.
    uri.searchParams.set("asset_issuer", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
  }
  if (order.depositMemo) { uri.searchParams.set("memo", order.depositMemo); uri.searchParams.set("memo_type", "MEMO_TEXT"); }
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(""), 2000); }
    catch { setError("Couldn't copy. Select and copy the value manually."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-panel">
      <DialogTitle className="text-lg">{STATUS[order.status] ?? "Checking swap status"}</DialogTitle>
      <DialogDescription className="text-xs">Order {order.id}</DialogDescription>
      <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
        <span>{order.depositAmount} {order.depositCoin.toUpperCase()}</span><span>→</span><span>{order.settleAmount} BTC</span>
      </div>
      {depositAllowed ? <>
        <p className="text-xs text-muted-foreground">Send the exact amount and memo before the timer expires.</p>
        <div className="flex justify-center"><div className="bg-qr-surface p-3"><QRCodeSVG value={uri.toString()} size={160} /></div></div>
        <div className="space-y-3">
          {[["Address", order.depositAddress], ["Amount", order.depositAmount], ...(order.depositMemo ? [["Memo", order.depositMemo]] : [])].map(([label, value]) => label && value ? <div key={label} className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><div className="text-[11px] text-muted-foreground">{label}</div><div className="select-all break-all text-xs">{value}</div></div>
            <Button variant="ghost" size="icon" aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`} onClick={() => copy(value, label)}>{copied === label ? <Check /> : <Copy />}</Button>
          </div> : null)}
        </div>
        {order.depositMemo && <p className="text-xs text-destructive">The memo is required. A missing memo can prevent your funds being credited.</p>}
        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Deposit window</span><span>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></div>
        <Button asChild className="btn-cta"><a href={uri.toString()}>Open wallet to send</a></Button>
      </> : <p className="flex items-center gap-2 text-sm">{!orderIsFinal(order.status) && <LoaderCircle className="h-4 w-4 animate-spin" />}{order.status === "waiting" ? "Deposit window expired. Do not send funds." : STATUS[order.status] ?? order.status}</p>}
      <div className="text-xs"><span className="text-muted-foreground">To </span><span className="break-all">{order.settleAddress}</span></div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button variant="secondary" onClick={onClose}>{orderIsFinal(order.status) ? "Done" : "Close"}</Button>
    </DialogContent>
  </Dialog>;
}
