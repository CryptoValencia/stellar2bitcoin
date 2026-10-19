import { createServerFn } from "@tanstack/react-start";
import { quoteInput, orderInput, shiftSchema } from "./sideshift-schema";

export const getSideShiftQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => quoteInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["SIDESHIFT_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "not_configured" };
    try {
      const { requestQuote, clientIp, sessionHash } = await import("./sideshift.server");
      const hash = await sessionHash(true);
      if (!hash) throw new Error("Couldn't verify the quote session.");
      const quote = await requestQuote(data, apiKey, clientIp());
      const { signQuote } = await import("./quote-proof.server");
      const quoteSignature = await signQuote(quote, `${apiKey}:${hash}`);
      return { ok: true as const, btcOut: Number(quote.settleAmount), quote, quoteSignature };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Price unavailable" };
    }
  });

export const createSwapOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const secret = process.env["SIDESHIFT_API_KEY"];
      if (!secret) throw new Error("Swap service isn't configured.");
      const { clientIp, sessionHash, sideShiftRequest, parseOrder } = await import("./sideshift.server");
      const ip = clientIp(true);
      const hash = await sessionHash(true);
      if (!hash) throw new Error("Couldn't start your swap session.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const existing = await supabaseAdmin.from("swap_orders").select("order_data,state").eq("request_id", data.requestId).eq("session_hash", hash).maybeSingle();
      if (existing.error) throw new Error("Couldn't recover your order. Please try again.");
      if (existing.data?.order_data) return { ok: true as const, order: parseOrder(existing.data.order_data) };
      if (existing.data) throw new Error("This request is already being processed. Please wait; don't send funds yet.");
      const permissions = await sideShiftRequest("/permissions", secret, ip) as { createShift: boolean };
      if (!permissions.createShift) throw new Error("Swaps aren't available in your location.");
      const { verifyQuote } = await import("./quote-proof.server");
      if (!await verifyQuote(data.quote, data.quoteSignature, data, `${secret}:${hash}`)) throw new Error("Price changed or expired. Refresh the quote before confirming.");
      const quote = data.quote;
      const claim = await supabaseAdmin.from("swap_orders").insert({ session_hash: hash, request_id: data.requestId });
      if (claim.error) throw new Error("This request is already being processed. Please wait.");
      const { AFFILIATE_ID } = await import("./sideshift-schema");
      const order = parseOrder(await sideShiftRequest("/shifts/fixed", secret, ip, { quoteId: quote.id, affiliateId: AFFILIATE_ID, settleAddress: data.destination, refundAddress: data.refundAddress, externalId: data.requestId }));
      const saved = await supabaseAdmin.from("swap_orders").update({ shift_id: order.id, order_data: order, state: order.status }).eq("request_id", data.requestId).eq("session_hash", hash);
      if (saved.error) throw new Error("Couldn't save your order. Don't send funds; contact support before retrying.");
      return { ok: true as const, order };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Couldn't create the swap. No funds were sent." }; }
  });

export const getSwapOrder = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { sessionHash, sideShiftRequest, parseOrder } = await import("./sideshift.server");
    const hash = await sessionHash();
    if (!hash) return { ok: true as const, order: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("swap_orders").select("id,shift_id,order_data").eq("session_hash", hash).not("shift_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Couldn't recover your swap. Please try again.");
    if (!data?.shift_id || !data.order_data) return { ok: true as const, order: null };
    const secret = process.env["SIDESHIFT_API_KEY"];
    if (!secret) throw new Error("Swap status unavailable.");
    const fresh = await sideShiftRequest(`/shifts/${encodeURIComponent(data.shift_id)}`, secret) as { status?: string };
    const order = parseOrder({ ...shiftSchema.parse(data.order_data), status: fresh.status ?? shiftSchema.parse(data.order_data).status });
    await supabaseAdmin.from("swap_orders").update({ order_data: order, state: order.status }).eq("id", data.id).eq("session_hash", hash);
    return { ok: true as const, order };
  } catch { return { ok: false as const, error: "Couldn't refresh your swap status. Your order remains saved." }; }
});
