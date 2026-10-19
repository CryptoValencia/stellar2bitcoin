import { z } from "zod";
import { positiveFinite } from "./quote-safety";
export const AFFILIATE_ID = "Pw4WPjlQu";
export const quoteInput = z.object({ from: z.enum(["XLM", "USDC", "EURC"]), amount: z.number().finite().positive().max(1e9), lightning: z.boolean() });
export const quoteSnapshotSchema = quoteInput.extend({ id: z.string().min(1), settleAmount: z.string().refine(positiveFinite), expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))) });
export const orderInput = quoteInput.extend({ destination: z.string().min(20).max(2000), refundAddress: z.string().regex(/^G[A-Z2-7]{55}$/), requestId: z.string().uuid(), quote: quoteSnapshotSchema, quoteSignature: z.string().regex(/^[a-f0-9]{64}$/) });
export const shiftSchema = z.object({
  id: z.string().min(1), status: z.string(), depositAddress: z.string().regex(/^G[A-Z2-7]{55}$/),
  depositMemo: z.union([z.string(), z.number()]).nullish().transform((v) => v == null ? null : String(v)),
  depositAmount: z.string().refine(positiveFinite), settleAmount: z.string().refine(positiveFinite),
  expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  settleAddress: z.string(), depositCoin: z.string(), settleCoin: z.string(),
});
export type SwapOrder = z.infer<typeof shiftSchema>;
export const TERMINAL_STATUSES = ["settled", "refunded", "expired"];
export function orderIsFinal(status: string) { return TERMINAL_STATUSES.includes(status); }
export function chooseExecutableQuotes<T extends { id: string; live: boolean }>(quotes: T[]) {
  return quotes.filter((q) => q.id === "sideshift" && q.live);
}