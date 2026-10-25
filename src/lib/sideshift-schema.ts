import { z } from "zod";
import { positiveFinite } from "./quote-safety";
export const AFFILIATE_ID = "Pw4WPjlQu";
export const PROVIDERS = ["sideshift", "fixedfloat", "changenow"] as const;
export const SWAP_COINS = ["XLM", "USDC", "BTC"] as const;
export const quoteInput = z.object({
  from: z.enum(SWAP_COINS),
  to: z.enum(SWAP_COINS).default("BTC"),
  amount: z.number().finite().positive().max(1e9),
  lightning: z.boolean(),
});
export const quoteSnapshotSchema = quoteInput.extend({ id: z.string().min(1).max(2000), settleAmount: z.string().refine(positiveFinite), expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))), provider: z.enum(PROVIDERS).default("sideshift") });
export type QuoteSnap = z.infer<typeof quoteSnapshotSchema>;
// The deposit side is refunded on the chain it was sent from; the settlement side carries the payout address.
const BTC_DEST = /^(bc1[a-z0-9]{20,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|ln(bc|tb)[0-9a-z]{20,})$/i;
const STELLAR_DEST = /^G[A-Z2-7]{55}$/;
export const orderInput = quoteInput.extend({
  destination: z.string().min(14).max(2000),
  refundAddress: z.string().min(14).max(2000),
  requestId: z.string().uuid(),
  quote: quoteSnapshotSchema,
  quoteSignature: z.string().regex(/^[a-f0-9]{64}$/),
})
  .refine((v) => (v.to === "BTC" ? BTC_DEST : STELLAR_DEST).test(v.destination), { message: "destination doesn't match the swap direction", path: ["destination"] })
  .refine((v) => (v.to === "BTC" ? STELLAR_DEST : BTC_DEST).test(v.refundAddress), { message: "refund address doesn't match the swap direction", path: ["refundAddress"] });
export const shiftSchema = z.object({
  provider: z.enum(PROVIDERS).default("sideshift"),
  id: z.string().min(1), status: z.string(),
  depositAddress: z.string().min(6).max(2000),
  depositMemo: z.union([z.string(), z.number()]).nullish().transform((v) => v == null ? null : String(v)),
  depositAmount: z.string().refine(positiveFinite), settleAmount: z.string().refine(positiveFinite),
  expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  settleAddress: z.string(), depositCoin: z.string(), settleCoin: z.string(),
});
export type SwapOrder = z.infer<typeof shiftSchema>;
export const TERMINAL_STATUSES = ["settled", "refunded", "expired"];
export function orderIsFinal(status: string) { return TERMINAL_STATUSES.includes(status); }
export function chooseExecutableQuotes<T extends { id: string; live: boolean }>(quotes: T[]) {
  return quotes.filter((q) => (PROVIDERS as readonly string[]).includes(q.id) && q.live);
}
