// Aggregator service: live provider quotes with simulation fallback.
export type Token = "XLM" | "USDC" | "EURC";
export type BtcNet = "mainnet" | "lightning";
export type RouteId = "sideshift" | "fixedfloat" | "changenow" | "cctp";

export interface Quote {
  id: RouteId;
  provider: string;
  tagline: string;
  badge: "BEST RETURN" | "FASTEST" | "ZERO KYC" | "100% DEFI";
  etaMin: number;
  feeUsd: number;
  feeBtc: number;
  btcOut: number;
  live: boolean;
  lightning: boolean;
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 1 + (Math.random() - 0.5) * 0.004;

function simulate(id: RouteId, from: Token, amount: number): Quote {
  const usd = amount * USD_PRICE[from];
  const cfg = {
    sideshift: { provider: "SideShift.ai", tagline: "Direct instant bridge · no KYC", badge: "ZERO KYC", eta: 4, pct: 0.009, flat: 1.2, ln: true },
    fixedfloat: { provider: "FixedFloat", tagline: "Lightning & mainnet node · 0.5% fee", badge: "FASTEST", eta: 2, pct: 0.005, flat: 0.9, ln: true },
    changenow: { provider: "ChangeNOW", tagline: "Deep liquidity aggregator", badge: "BEST RETURN", eta: 7, pct: usd > 5000 ? 0.004 : 0.0075, flat: 1.5, ln: false },
    cctp: { provider: "CCTP + Chainflip", tagline: "Circle CCTP burn → Chainflip native BTC", badge: "100% DEFI", eta: 12, pct: 0.0035, flat: 2.4, ln: false },
  }[id];
  const feeUsd = usd * cfg.pct + cfg.flat;
  const btcOut = Math.max(0, ((usd - feeUsd) / BTC_USD) * jitter());
  return {
    id, provider: cfg.provider, tagline: cfg.tagline, badge: cfg.badge as Quote["badge"],
    etaMin: cfg.eta, feeUsd, feeBtc: feeUsd / BTC_USD, btcOut, live: false, lightning: cfg.ln,
  };
}

export async function fetchSideShiftQuote(fromToken: Token, amount: number, net: BtcNet = "mainnet"): Promise<Quote> {
  const sim = simulate("sideshift", fromToken, amount);
  try {
    const { getSideShiftQuote } = await import("@/lib/sideshift.functions");
    const r = await getSideShiftQuote({ data: { from: fromToken, amount, lightning: net === "lightning" } });
    if (r.ok) return { ...sim, btcOut: r.btcOut, live: true };
  } catch { /* fall back */ }
  return sim;
}

export async function fetchChangeNowQuote(fromToken: Token, amount: number): Promise<Quote> {
  const key = getApiKeys().changenow;
  if (key) {
    try {
      const r = await fetch(`https://api.changenow.io/v2/exchange/estimated-amount?fromCurrency=${fromToken.toLowerCase()}&toCurrency=btc&fromAmount=${amount}&fromNetwork=xlm&toNetwork=btc&flow=standard`, { headers: { "x-changenow-api-key": key } });
      if (r.ok) {
        const j = await r.json();
        return { ...simulate("changenow", fromToken, amount), btcOut: Number(j.toAmount), live: true };
      }
    } catch { /* fall back */ }
  }
  await delay(700 + Math.random() * 600);
  return simulate("changenow", fromToken, amount);
}

export async function fetchFixedFloatQuote(fromToken: Token, amount: number, net: BtcNet = "mainnet"): Promise<Quote> {
  const sim = simulate("fixedfloat", fromToken, amount);
  try {
    const { getFixedFloatQuote } = await import("@/lib/fixedfloat.functions");
    const r = await getFixedFloatQuote({ data: { from: fromToken, amount, lightning: net === "lightning", fixed: true } });
    if (r.ok) return { ...sim, btcOut: r.btcOut, live: true };
  } catch { /* fall back */ }
  return sim;
}

export async function fetchCctpChainflipQuote(fromToken: Token, amount: number): Promise<Quote | null> {
  if (fromToken !== "USDC") return null;
  await delay(900 + Math.random() * 500);
  return simulate("cctp", fromToken, amount);
}

export async function fetchAllQuotes(from: Token, amount: number, net: BtcNet): Promise<Quote[]> {
  const res = await Promise.all([
    fetchSideShiftQuote(from, amount, net), fetchFixedFloatQuote(from, amount, net),
    fetchChangeNowQuote(from, amount), fetchCctpChainflipQuote(from, amount),
  ]);
  return res.filter((q): q is Quote => !!q && (net === "mainnet" || q.lightning)).sort((a, b) => b.btcOut - a.btcOut);
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
