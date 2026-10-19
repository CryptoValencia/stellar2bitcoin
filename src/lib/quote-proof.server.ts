import { quoteMatches, type QuoteContext, type QuoteSnapshot } from "./quote-safety";
async function key(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signQuote(quote: QuoteSnapshot, secret: string) {
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(JSON.stringify(quote)));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyQuote(quote: QuoteSnapshot, signature: string, input: QuoteContext, secret: string, now = Date.now()) {
  if (!quoteMatches(quote, input, now) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
  return crypto.subtle.verify("HMAC", await key(secret), bytes, new TextEncoder().encode(JSON.stringify(quote)));
}