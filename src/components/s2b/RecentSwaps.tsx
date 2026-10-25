import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RotateCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getRecentSwapOrders, getSwapOrder } from "@/lib/sideshift.functions";
import type { SwapOrder } from "@/lib/sideshift-schema";

export function RecentSwaps({ onClose, onSelect }: { onClose: () => void; onSelect: (order: SwapOrder, requestId: string) => void }) {
  const list = useServerFn(getRecentSwapOrders);
  const refresh = useServerFn(getSwapOrder);
  const [rows, setRows] = useState<{ requestId: string; createdAt: string; order: SwapOrder }[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const load = async () => {
    setBusy(true); setError("");
    try { const result = await list(); if (result.ok) setRows(result.orders); else setError(result.error); }
    catch { setError("Couldn't load your recent swaps. Please retry."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [list]);
  const open = async (row: typeof rows[number]) => {
    setOpening(row.requestId); setError("");
    try {
      const result = await refresh({ data: { requestId: row.requestId } });
      if (result.ok && result.order) onSelect(result.order, row.requestId);
      else setError(result.ok ? "This swap is no longer available in this browser." : result.error);
    } catch { setError("Couldn't refresh this swap. Please retry."); }
    finally { setOpening(null); }
  };
  return <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-panel">
      <div className="flex items-center justify-between"><DialogTitle>Recent swaps</DialogTitle><Button variant="ghost" size="icon" aria-label="Refresh recent swaps" title="Refresh recent swaps" disabled={busy} onClick={load}><RotateCw className={busy ? "animate-spin" : ""} /></Button></div>
      <DialogDescription className="text-xs">Swaps saved for this browser</DialogDescription>
      {busy ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 && !error ? <p className="text-sm text-muted-foreground">No swaps yet</p> : <div className="divide-y divide-border">{rows.map((row) => <Button key={row.requestId} variant="ghost" disabled={!!opening} onClick={() => open(row)} className="h-auto w-full justify-between rounded-none px-0 py-4 text-left whitespace-normal">
        <span className="min-w-0 space-y-1"><span className="block text-xs">{row.order.depositAmount} {row.order.depositCoin.toUpperCase()} → {row.order.settleAmount} {row.order.settleCoin.toUpperCase()}</span><span className="block text-[11px] text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · {row.order.status}</span><span className="block break-all text-[10px] text-muted-foreground">{row.order.id}</span></span><ArrowRight className="shrink-0" />
      </Button>)}</div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}