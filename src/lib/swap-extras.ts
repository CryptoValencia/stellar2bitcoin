import type { SwapOrder } from "./sideshift-schema";

export function shortcutAmount(balance: number, percent: 25 | 50 | 100, coin: "XLM" | "USDC") {
  if (!Number.isFinite(balance) || balance <= 0) return "0";
  const precision = coin === "XLM" ? 7 : 2;
  const scale = 10 ** precision;
  return String(Math.floor(balance * percent / 100 * scale) / scale);
}

export function transactionHash(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

export function explorerUrl(coin: string, hash: unknown, network?: string | null) {
  const valid = transactionHash(hash);
  if (!valid || network === "lightning") return null;
  if (coin.toUpperCase() === "BTC") return `https://mempool.space/tx/${valid}`;
  if (["XLM", "USDC"].includes(coin.toUpperCase())) return `https://stellar.expert/explorer/public/tx/${valid}`;
  return null;
}

export function orderKey(order: SwapOrder) { return `${order.provider}:${order.id}`; }