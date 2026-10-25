import { createServerFn } from "@tanstack/react-start";
import { quoteInput, orderInput, shiftSchema, type QuoteSnap, type SwapOrder } from "./sideshift-schema";
import { z } from "zod";
import { transactionHash } from "./swap-extras";
import { QuoteAmountRangeError } from "./quote-safety";
import { exactPayout, recoveredOrderMatches, requestFingerprint } from "./order-safety";

function signingKey(hash: string) {
  const k = process.env["SIDESHIFT_API_KEY"] || process.env["FIXEDFLOAT_API_SECRET"];
  if (!k) throw new Error("Swap service isn't configured.");
  return `${k}:${hash}`;
}
function readRow(value: unknown): { order: SwapOrder; secret: Record<string, string> } {
  const v = value as { order?: unknown; secret?: Record<string, string> };
  return v && typeof v === "object" && "order" in v ? { order: shiftSchema.parse(v.order), secret: v.secret ?? {} } : { order: shiftSchema.parse(value), secret: {} };
}

// Real, signed fixed quotes from every executable provider. Failures are omitted.
export const getSideShiftQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => quoteInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { requestQuote, clientIp, sessionHash } = await import("./sideshift.server");
      const { cnQuote } = await import("./providers.server");
      const { signQuote } = await import("./quote-proof.server");
      const hash = await sessionHash(true);
      if (!hash) throw new Error("Couldn't verify the quote session.");
      const ss = process.env["SIDESHIFT_API_KEY"];
      const tasks: Promise<QuoteSnap>[] = [cnQuote(data)];
      if (ss) tasks.unshift(requestQuote(data, ss, clientIp()));
      const settled = await Promise.allSettled(tasks);
      settled.forEach((r) => { if (r.status === "rejected") console.warn("quote unavailable:", r.reason instanceof Error ? r.reason.message : r.reason); });
      const key = signingKey(hash);
      const quotes = await Promise.all(settled.flatMap((r) => r.status === "fulfilled" ? [r.value] : []).map(async (quote) => ({ outAmount: Number(quote.settleAmount), quote, quoteSignature: await signQuote(quote, key) })));
      if (!quotes.length) {
        const range = settled.flatMap((r) => r.status === "rejected" && r.reason instanceof QuoteAmountRangeError ? [r.reason] : [])[0];
        return { ok: false as const, error: range?.message ?? "No live quote available for this amount and network. Try another amount or retry shortly." };
      }
      return { ok: true as const, quotes };
    } catch (error) {
      console.warn("quote request failed:", error instanceof Error ? error.message : "unknown error");
      return { ok: false as const, error: "Couldn't load a live quote. Please try again shortly." };
    }
  });

export const createSwapOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const { clientIp, sessionHash, sideShiftRequest, parseOrder } = await import("./sideshift.server");
      const provider = data.quote.provider;
      if (provider === "fixedfloat") throw new Error("This route cannot preserve the confirmed price. Refresh for another live route.");
      const fingerprint = requestFingerprint(data);
      const ip = clientIp(provider === "sideshift");
      const hash = await sessionHash(true);
      if (!hash) throw new Error("Couldn't start your swap session.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const existing = await supabaseAdmin.from("swap_orders").select("order_data,state").eq("request_id", data.requestId).eq("session_hash", hash).maybeSingle();
      if (existing.error) throw new Error("Couldn't recover your order. Please try again.");
      if (existing.data?.order_data) {
        const stored = existing.data.order_data as { requestFingerprint?: string; order?: unknown };
        if (stored.requestFingerprint && stored.requestFingerprint !== fingerprint) throw new Error("This request belongs to different swap details. Start a new request.");
        if (stored.order || existing.data.state !== "creating") {
          const recovered = readRow(existing.data.order_data).order;
          if (!recoveredOrderMatches(recovered, data)) throw new Error("This request belongs to different swap details. Start a new request.");
          return { ok: true as const, order: recovered };
        }
      }
      if (existing.data) throw new Error("This request is already being processed. Please wait; don't send funds yet.");
      const { verifyQuote } = await import("./quote-proof.server");
      if (!await verifyQuote(data.quote, data.quoteSignature, data, signingKey(hash))) throw new Error("Price changed or expired. Refresh the quote before confirming.");
      const secret = process.env["SIDESHIFT_API_KEY"];
      if (provider === "sideshift") {
        if (!secret) throw new Error("Swap service isn't configured.");
        const permissions = await sideShiftRequest("/permissions", secret, ip) as { createShift: boolean };
        if (!permissions.createShift) throw new Error("Swaps aren't available in your location.");
      }
      const claim = await supabaseAdmin.from("swap_orders").insert({ session_hash: hash, request_id: data.requestId, state: "creating", order_data: { requestFingerprint: fingerprint } });
      if (claim.error) throw new Error("This request is already being processed. Please wait.");
      let result: { order: SwapOrder; secret: Record<string, string> };
      try {
        if (provider === "sideshift") {
          const { AFFILIATE_ID } = await import("./sideshift-schema");
          if (!secret) throw new Error("Swap service isn't configured.");
          const raw = await sideShiftRequest("/shifts/fixed", secret, ip, { quoteId: data.quote.id, affiliateId: AFFILIATE_ID, settleAddress: data.destination, refundAddress: data.refundAddress, externalId: data.requestId }) as object;
          result = { order: parseOrder({ ...raw, provider: "sideshift" }), secret: {} };
        } else {
          const p = await import("./providers.server");
          result = await p.cnCreate(data.quote, data.destination, data.refundAddress, data.requestId);
        }
      } catch (e) {
        // A timeout may follow successful provider creation; retain the claim to
        // prevent a blind duplicate order on retry.
        throw new Error("Couldn't confirm order creation. Do not send funds or submit another request while this one is unresolved.");
      }
      if (!exactPayout(data.quote, result.order.settleAmount)) throw new Error("The order payout differs from the confirmed quote. Do not send funds.");
      const saved = await supabaseAdmin.from("swap_orders").update({ shift_id: `${provider}:${result.order.id}`, order_data: { ...result, requestFingerprint: fingerprint }, state: result.order.status }).eq("request_id", data.requestId).eq("session_hash", hash);
      if (saved.error) throw new Error("Couldn't save your order. Don't send funds; contact support before retrying.");
      return { ok: true as const, order: result.order };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Couldn't create the swap. No funds were sent." }; }
  });

export const getRecentSwapOrders = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { sessionHash } = await import("./sideshift.server");
    const hash = await sessionHash();
    if (!hash) return { ok: true as const, orders: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("swap_orders").select("request_id,created_at,order_data").eq("session_hash", hash).not("shift_id", "is", null).order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return { ok: true as const, orders: (data ?? []).flatMap((row) => row.order_data ? [{ requestId: row.request_id, createdAt: row.created_at, order: readRow(row.order_data).order }] : []) };
  } catch { return { ok: false as const, error: "Couldn't load recent swaps. Please retry." }; }
});

export const getSwapOrder = createServerFn({ method: "GET" }).inputValidator((input: unknown) => z.object({ requestId: z.string().uuid().optional() }).parse(input)).handler(async ({ data: input }) => {
  try {
    const { sessionHash, sideShiftRequest, parseOrder } = await import("./sideshift.server");
    const hash = await sessionHash();
    if (!hash) return { ok: true as const, order: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("swap_orders").select("id,shift_id,order_data").eq("session_hash", hash).not("shift_id", "is", null);
    if (input.requestId) query = query.eq("request_id", input.requestId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Couldn't recover your swap. Please try again.");
    if (!data?.shift_id || !data.order_data) return { ok: true as const, order: null };
    const row = readRow(data.order_data);
    const fingerprint = (data.order_data as { requestFingerprint?: string }).requestFingerprint;
    let order: SwapOrder;
    if (row.order.provider === "fixedfloat") {
      const { ffStatus } = await import("./providers.server");
      order = { ...await ffStatus(row.order.id, row.secret["token"] ?? "", row.order), expiresAt: row.order.expiresAt };
    } else if (row.order.provider === "changenow") {
      const { cnStatus } = await import("./providers.server");
      order = await cnStatus(row.order);
    } else {
      const secret = process.env["SIDESHIFT_API_KEY"];
      if (!secret) throw new Error("Swap status unavailable.");
      const fresh = await sideShiftRequest(`/shifts/${encodeURIComponent(row.order.id)}`, secret) as { status?: string; depositHash?: string; settleHash?: string; depositNetwork?: string; settleNetwork?: string };
      order = parseOrder({ ...row.order, status: fresh.status ?? row.order.status, depositNetwork: fresh.depositNetwork ?? row.order.depositNetwork, settleNetwork: fresh.settleNetwork ?? row.order.settleNetwork, depositTxHash: transactionHash(fresh.depositHash) ?? row.order.depositTxHash, settleTxHash: transactionHash(fresh.settleHash) ?? row.order.settleTxHash });
    }
    await supabaseAdmin.from("swap_orders").update({ order_data: { order, secret: row.secret, ...(fingerprint ? { requestFingerprint: fingerprint } : {}) }, state: order.status }).eq("id", data.id).eq("session_hash", hash);
    return { ok: true as const, order };
  } catch { return { ok: false as const, error: "Couldn't refresh your swap status. Your order remains saved." }; }
});
