import { getCookie, getRequestHeader, getRequestUrl, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { isIP } from "node:net";
import { AFFILIATE_ID, quoteInput, quoteSnapshotSchema, shiftSchema, type SwapOrder } from "./sideshift-schema";
import type { z } from "zod";
const BASE = "https://sideshift.ai/api/v2";
export async function sideShiftRequest(path: string, secret: string, ip?: string, body?: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-sideshift-secret": secret };
  if (ip) headers["x-user-ip"] = ip;
  const response = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 429 ? "Too many requests. Wait a minute and try again." : "Swap service unavailable for this amount or destination. Please try again.");
  return await response.json();
}
export function clientIp(required = false) {
  const ip = getRequestHeader("cf-connecting-ip");
  if (ip && isIP(ip)) return ip;
  if (required) throw new Error("Couldn't verify your location. Open the published site directly in your browser to create a swap.");
  return undefined;
}
export async function sessionHash(create = false) {
  setResponseHeader("Cache-Control", "no-store");
  let token = getCookie("s2b_swap_session");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) return null;
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("");
    setCookie("s2b_swap_session", token, { httpOnly: true, secure: getRequestUrl().protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function requestQuote(data: z.infer<typeof quoteInput>, secret: string, ip?: string) {
  const coins = await sideShiftRequest("/coins", secret, ip) as Array<{ coin: string; networks: string[]; depositOffline: boolean | string[]; settleOffline: boolean | string[] }>;
  const source = coins.find((coin) => coin.coin.toUpperCase() === data.from);
  const target = coins.find((coin) => coin.coin.toUpperCase() === "BTC");
  const settleNetwork = data.lightning ? "lightning" : "bitcoin";
  if (!source?.networks.includes("stellar") || !target?.networks.includes(settleNetwork)) throw new Error("This asset or payout network isn't available right now.");
  if (source.depositOffline === true || (Array.isArray(source.depositOffline) && source.depositOffline.includes("stellar")) || target.settleOffline === true || (Array.isArray(target.settleOffline) && target.settleOffline.includes(settleNetwork))) throw new Error("This swap is temporarily unavailable.");
  const pairs = await sideShiftRequest(`/pairs?pairs=${data.from.toLowerCase()}-stellar,btc-${settleNetwork}&affiliateId=${AFFILIATE_ID}`, secret, ip) as Array<{ depositCoin: string; min: string; max: string }>;
  const pair = pairs.find((p) => p.depositCoin.toUpperCase() === data.from);
  if (!pair || data.amount < Number(pair.min) || data.amount > Number(pair.max)) throw new Error(pair ? `Amount must be between ${pair.min} and ${pair.max} ${data.from}.` : "No price available for this swap.");
  const quote = await sideShiftRequest("/quotes", secret, ip, { affiliateId: AFFILIATE_ID, depositCoin: data.from.toLowerCase(), depositNetwork: "stellar", settleCoin: "btc", settleNetwork, depositAmount: String(data.amount) }) as { id: string; settleAmount: string; expiresAt: string };
  const snapshot = quoteSnapshotSchema.parse({ ...data, id: quote.id, settleAmount: quote.settleAmount, expiresAt: quote.expiresAt });
  if (!(Date.parse(snapshot.expiresAt) > Date.now())) throw new Error("Price expired. Please try again.");
  return snapshot;
}
export function parseOrder(value: unknown): SwapOrder { return shiftSchema.parse(value); }