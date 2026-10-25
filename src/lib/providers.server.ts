// Server-only adapters for FixedFloat and ChangeNOW. All outputs are real provider data.
import { quoteSnapshotSchema, shiftSchema, type QuoteSnap, type SwapOrder } from "./sideshift-schema";
import type { z } from "zod";
import type { quoteInput } from "./sideshift-schema";
import { transactionHash } from "./swap-extras";
type QuoteIn = z.infer<typeof quoteInput>;

const PRICE_TOLERANCE = 0.999;
function priceHeld(snapshot: QuoteSnap, settle: unknown) {
  return Number(settle) >= Number(snapshot.settleAmount) * PRICE_TOLERANCE;
}

// ---------- FixedFloat ----------
async function ffSign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function ff(path: string, payload: object) {
  const apiKey = process.env["FIXEDFLOAT_API_KEY"], secret = process.env["FIXEDFLOAT_API_SECRET"];
  if (!apiKey || !secret) throw new Error("not_configured");
  const body = JSON.stringify(payload);
  const r = await fetch(`https://ff.io/api/v2/${path}`, {
    method: "POST", body, signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-API-KEY": apiKey, "X-API-SIGN": await ffSign(secret, body) },
  });
  const j = await r.json().catch(() => null) as { code?: number; msg?: string; data?: any } | null;
  if (!r.ok || !j || j.code !== 0) { console.error(`FixedFloat ${path} failed [${r.status}]: ${j?.msg ?? ""}`); throw new Error("Swap service unavailable for this amount or destination."); }
  return j.data;
}
const FF_STATUS: Record<string, string> = { NEW: "waiting", PENDING: "pending", EXCHANGE: "processing", WITHDRAW: "settling", DONE: "settled", EXPIRED: "expired", EMERGENCY: "review" };
function ffOrder(d: any, fallback: { depositCoin: string; settleCoin: string }): SwapOrder {
  const exp = Number(d?.time?.expiration);
  return shiftSchema.parse({
    provider: "fixedfloat", id: String(d.id), status: FF_STATUS[d.status] ?? "processing",
    depositAddress: d.from?.address, depositMemo: d.from?.tag ?? null, depositAmount: String(d.from?.amount),
    settleAmount: String(d.to?.amount), expiresAt: new Date((exp || Date.now() / 1000 + 1800) * 1000).toISOString(),
    settleAddress: String(d.to?.address ?? ""),
    depositCoin: String(d.from?.currency ?? fallback.depositCoin).toLowerCase(),
    settleCoin: String(d.to?.currency ?? fallback.settleCoin).toLowerCase(),
    depositNetwork: String(d.from?.currency ?? fallback.depositCoin).toUpperCase() === "BTC" ? "bitcoin" : "stellar",
    settleNetwork: String(d.to?.currency ?? fallback.settleCoin).toUpperCase() === "BTC" ? "bitcoin" : "stellar",
    depositTxHash: transactionHash(d.from?.tx?.id), settleTxHash: transactionHash(d.to?.tx?.id),
  });
}
export async function ffQuote(data: QuoteIn): Promise<QuoteSnap> {
  const supported = data.from === "BTC" ? data.to === "XLM" : data.from === "XLM" && data.to === "BTC";
  if (data.lightning || !supported) throw new Error("unsupported");
  const fromCcy = data.from === "BTC" ? "BTC" : "XLM";
  const toCcy = data.from === "BTC" ? "XLM" : "BTC";
  const d = await ff("price", { type: "fixed", fromCcy, toCcy, direction: "from", amount: data.amount });
  if (d?.errors?.length) throw new Error("Amount out of range");
  return quoteSnapshotSchema.parse({ ...data, id: `ff-${crypto.randomUUID()}`, settleAmount: String(d?.to?.amount), expiresAt: new Date(Date.now() + 90_000).toISOString(), provider: "fixedfloat" });
}
export async function ffCreate(snap: QuoteSnap, destination: string, refundAddress: string) {
  const fromCcy = snap.from === "BTC" ? "BTC" : "XLM";
  const toCcy = snap.from === "BTC" ? "XLM" : "BTC";
  const d = await ff("create", { type: "fixed", fromCcy, toCcy, direction: "from", amount: snap.amount, toAddress: destination, refundAddress });
  const order = ffOrder(d, { depositCoin: fromCcy, settleCoin: toCcy });
  if (!priceHeld(snap, order.settleAmount)) throw new Error("Price changed. Refresh the quote before confirming. Don't send funds.");
  return { order, secret: { token: String(d.token) } };
}
export async function ffStatus(id: string, token: string, prev?: SwapOrder) {
  return ffOrder(await ff("order", { id, token }), { depositCoin: prev?.depositCoin ?? "xlm", settleCoin: prev?.settleCoin ?? "btc" });
}

// ---------- ChangeNOW (via connector gateway) ----------
async function cn(path: string, init?: { method?: string; body?: object }) {
  const lk = process.env["LOVABLE_API_KEY"], ck = process.env["UDC_CHANGENOW_API_KEY"];
  if (!lk || !ck) throw new Error("not_configured");
  const r = await fetch(`https://connector-gateway.lovable.dev/udc_changenow/${path}`, {
    method: init?.method ?? "GET", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, "Content-Type": "application/json" },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!r.ok) { console.error(`ChangeNOW ${path} failed [${r.status}]: ${await r.text()}`); throw new Error("Swap service unavailable for this amount or destination."); }
  return await r.json() as any;
}
const CN_STATUS: Record<string, string> = { new: "waiting", waiting: "waiting", confirming: "pending", exchanging: "processing", sending: "settling", finished: "settled", failed: "review", refunded: "refunded", verifying: "review", expired: "expired" };
export async function cnQuote(data: QuoteIn): Promise<QuoteSnap> {
  if (data.lightning) throw new Error("unsupported");
  const reverse = data.from === "BTC";
  if (reverse && data.to !== "XLM") throw new Error("unsupported");
  const from = reverse ? { currency: "btc", network: "btc" } : { currency: data.from.toLowerCase(), network: "xlm" };
  const to = reverse ? { currency: "xlm", network: "xlm" } : { currency: "btc", network: "btc" };
  const q = new URLSearchParams({ fromCurrency: from.currency, toCurrency: to.currency, fromAmount: String(data.amount), fromNetwork: from.network, toNetwork: to.network, flow: "fixed-rate", type: "direct", useRateId: "true" });
  const j = await cn(`exchange/estimated-amount?${q}`);
  return quoteSnapshotSchema.parse({ ...data, id: String(j.rateId), settleAmount: String(j.toAmount), expiresAt: String(j.validUntil), provider: "changenow" });
}
export async function cnCreate(snap: QuoteSnap, destination: string, refundAddress: string, externalId: string) {
  const reverse = snap.from === "BTC";
  const from = reverse ? { currency: "btc", network: "btc" } : { currency: snap.from.toLowerCase(), network: "xlm" };
  const to = reverse ? { currency: "xlm", network: "xlm" } : { currency: "btc", network: "btc" };
  const j = await cn("exchange", { method: "POST", body: { fromCurrency: from.currency, toCurrency: to.currency, fromNetwork: from.network, toNetwork: to.network, fromAmount: String(snap.amount), address: destination, refundAddress, flow: "fixed-rate", type: "direct", rateId: snap.id, userId: externalId } });
  const order = shiftSchema.parse({
    provider: "changenow", id: String(j.id), status: "waiting", depositAddress: j.payinAddress, depositMemo: j.payinExtraId || null,
    depositAmount: String(j.fromAmount ?? snap.amount), settleAmount: String(j.toAmount), expiresAt: snap.expiresAt,
    settleAddress: String(j.payoutAddress ?? destination), depositCoin: from.currency, settleCoin: to.currency,
  });
  if (!priceHeld(snap, order.settleAmount)) throw new Error("Price changed. Refresh the quote before confirming. Don't send funds.");
  return { order, secret: {} };
}
export async function cnStatus(prev: SwapOrder) {
  const j = await cn(`exchange/by-id?id=${encodeURIComponent(prev.id)}`);
  return shiftSchema.parse({ ...prev, status: CN_STATUS[j.status] ?? prev.status, settleAmount: j.amountTo ? String(j.amountTo) : prev.settleAmount, depositTxHash: transactionHash(j.payinHash) ?? prev.depositTxHash, settleTxHash: transactionHash(j.payoutHash) ?? prev.settleTxHash });
}
