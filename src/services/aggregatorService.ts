// Only real provider outputs are returned. Failures never fabricate a quote.
import { getSideShiftQuote } from "@/lib/sideshift.functions";
import { positiveFinite, quoteMatches, type QuoteSnapshot } from "@/lib/quote-safety";
export type Token = "XLM" | "USDC";
export type BtcNet = "mainnet" | "lightning";
export type RouteId = "sideshift" | "fixedfloat" | "changenow" | "cctp";
export type SwapCoin = Token | "BTC";

export interface Quote {
  id: RouteId;
  provider: string;
  tagline: string;
  badge: "BEST RETURN" | "FASTEST" | "ZERO KYC" | "100% DEFI";
  etaMin: number | null;
  feeUsd: number | null;
  feeBtc: number | null;
  outAmount: number;
  outCoin: SwapCoin;
  live: boolean;
  lightning: boolean;
  snapshot?: QuoteSnapshot;
  quoteSignature?: string;
}



const KEY_STORE = "s2b_api_keys";
export interface ApiKeys { sideshift?: string; changenow?: string; fixedfloat?: string }

export function getApiKeys(): ApiKeys {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY_STORE) || "{}"); } catch { return {}; }
}
export function setApiKeys(k: ApiKeys) { localStorage.setItem(KEY_STORE, JSON.stringify(k)); }
export function isLiveMode() { const k = getApiKeys(); return !!(k.sideshift || k.changenow || k.fixedfloat); }

function realQuote(id: RouteId, outAmount: number, outCoin: SwapCoin, lightning: boolean): Quote {
  return { id, provider: id, tagline: "", badge: "BEST RETURN", outAmount, outCoin, lightning, live: true, feeUsd: null, feeBtc: null, etaMin: null };
}

export async function fetchAllQuotes(from: SwapCoin, to: SwapCoin, amount: number, net: BtcNet): Promise<Quote[]> {
  if (!positiveFinite(amount)) return [];
  const lightning = net === "lightning";
  try {
    const r = await getSideShiftQuote({ data: { from, to, amount, lightning } });
    if (!r.ok) return [];
    return r.quotes
      .filter((q) => positiveFinite(q.outAmount) && q.quoteSignature && quoteMatches(q.quote, { from, to, amount, lightning }))
      .map((q) => ({ ...realQuote(q.quote.provider, q.outAmount, q.quote.to, lightning), snapshot: q.quote, quoteSignature: q.quoteSignature }))
      .sort((a, b) => b.outAmount - a.outAmount);
  } catch { return []; }
}

export type AddrType = "taproot" | "segwit" | "legacy" | "lightning" | "stellar" | "invalid" | "empty";
export function validateDestination(v: string, net: BtcNet): AddrType {
  const s = v.trim();
  if (!s) return "empty";
  if (net === "lightning") return /^ln(bc|tb)[0-9a-z]{20,}$/i.test(s) ? "lightning" : "invalid";
  if (/^bc1p[02-9ac-hj-np-z]{58}$/.test(s)) return "taproot";
  if (/^bc1q[02-9ac-hj-np-z]{38}([02-9ac-hj-np-z]{20})?$/.test(s)) return "segwit";
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return "legacy";
  return "invalid";
}
export function validateStellar(v: string): AddrType {
  const s = v.trim();
  if (!s) return "empty";
  return /^G[A-Z2-7]{55}$/.test(s) ? "stellar" : "invalid";
}
