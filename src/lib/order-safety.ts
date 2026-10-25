import type { QuoteSnap, SwapOrder } from "./sideshift-schema";

export function exactPayout(snapshot: QuoteSnap, amount: string) {
  return Number.isFinite(Number(amount)) && Number(amount) === Number(snapshot.settleAmount);
}

export function requestFingerprint(input: { from: string; to: string; amount: number; lightning: boolean; destination: string; refundAddress: string; quote: QuoteSnap }) {
  return JSON.stringify([input.from, input.to, input.amount, input.lightning, input.destination, input.refundAddress, input.quote.provider, input.quote.id, input.quote.settleAmount]);
}

export function recoveredOrderMatches(order: SwapOrder, input: { from: string; to: string; amount: number; destination: string; quote: QuoteSnap }) {
  return order.provider === input.quote.provider && order.depositCoin.toUpperCase() === input.from && order.settleCoin.toUpperCase() === input.to && Number(order.depositAmount) === input.amount && order.settleAddress === input.destination && exactPayout(input.quote, order.settleAmount);
}