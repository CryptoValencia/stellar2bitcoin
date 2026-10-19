// Only real provider outputs are returned. Failures never fabricate a quote.
import { getSideShiftQuote } from "@/lib/sideshift.functions";
import { positiveFinite, quoteMatches, type QuoteSnapshot } from "@/lib/quote-safety";
export type Token = "XLM" | "USDC" | "EURC";
export type BtcNet = "mainnet" | "lightning";
export type RouteId = "sideshift" | "fixedfloat" | "changenow" | "cctp";

export interface Quote {
  id: RouteId;
  provider: string;
  tagline: string;
  badge: "BEST RETURN" | "FASTEST" | "ZERO KYC" | "100% DEFI";
  etaMin: number | null;
  feeUsd: number | null;
  feeBtc: number | null;
  btcOut: number;
  live: boolean;
  lightning: boolean;
  snapshot?: QuoteSnapshot;
  quoteSignature?: string;
}

export const USD_PRICE: Record<Token, number> = { XLM: 0.1124, USDC: 1, EURC: 1.083 };
export const BTC_USD = 67842.5;

const KEY_STORE = "s2b_api_keys";
export interface ApiKeys { sideshift?: string; changenow?: string; fixedfloat?: string }

export function getApiKeys(): ApiKeys {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY_STORE) || "{}"); } catch { return {}; }
}
export function setApiKeys(k: ApiKeys) { localStorage.setItem(KEY_STORE, JSON.stringify(k)); }
export function isLiveMode() { const k = getApiKeys(); return !!(k.sideshift || k.changenow || k.fixedfloat); }

function realQuote(id: RouteId, btcOut: number, lightning: boolean): Quote {
  return { id, provider: id, tagline: "", badge: "BEST RETURN", btcOut, lightning, live: true, feeUsd: null, feeBtc: null, etaMin: null };
}

export async function fetchAllQuotes(from: Token, amount: number, net: BtcNet): Promise<Quote[]> {
  if (!positiveFinite(amount)) return [];
  const lightning = net === "lightning";
  try {
    const r = await getSideShiftQuote({ data: { from: from as "XLM" | "USDC", amount, lightning } });
    if (!r.ok) return [];
    return r.quotes
      .filter((q) => positiveFinite(q.btcOut) && q.quoteSignature && quoteMatches(q.quote, { from, amount, lightning }))
      .map((q) => ({ ...realQuote(q.quote.provider, q.btcOut, lightning), snapshot: q.quote, quoteSignature: q.quoteSignature }))
      .sort((a, b) => b.btcOut - a.btcOut);
  } catch { return []; }
}

export type AddrType = "taproot" | "segwit" | "legacy" | "lightning" | "invalid" | "empty";
export function validateDestination(v: string, net: BtcNet): AddrType {
  const s = v.trim();
  if (!s) return "empty";
  if (net === "lightning") return /^ln(bc|tb)[0-9a-z]{20,}$/i.test(s) ? "lightning" : "invalid";
  if (/^bc1p[02-9ac-hj-np-z]{58}$/.test(s)) return "taproot";
  if (/^bc1q[02-9ac-hj-np-z]{38}([02-9ac-hj-np-z]{20})?$/.test(s)) return "segwit";
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return "legacy";
  return "invalid";
}
