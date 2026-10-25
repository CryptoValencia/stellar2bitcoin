import { describe, expect, it } from "vitest";
import { lockCountdown, positiveFinite, quoteMatches } from "./quote-safety";
import { signQuote, verifyQuote } from "./quote-proof.server";
const input = { from: "USDC", to: "BTC", amount: 100, lightning: false };
const quote = { ...input, id: "verified-quote", settleAmount: "0.00118169", expiresAt: "2026-10-19T18:00:00Z" };
const now = Date.parse("2026-10-19T17:50:00Z");
const reverseInput = { from: "BTC", to: "XLM", amount: 0.001, lightning: false };
const reverseQuote = { ...reverseInput, id: "reverse-quote", settleAmount: "10.5", expiresAt: "2026-10-19T18:00:00Z" };
describe("quote integrity", () => {
  it("rejects zero, negative and non-finite outputs", () => {
    for (const value of [0, -1, "Infinity", "NaN"]) expect(positiveFinite(value)).toBe(false);
    expect(positiveFinite("0.00118169")).toBe(true);
  });
  it("invalidates quotes when amount, asset or network changes", () => {
    expect(quoteMatches(quote, input, now)).toBe(true);
    expect(quoteMatches(quote, { ...input, amount: 1000 }, now)).toBe(false);
    expect(quoteMatches(quote, { ...input, from: "XLM" }, now)).toBe(false);
    expect(quoteMatches(quote, { ...input, lightning: true }, now)).toBe(false);
  });
  it("validates the reverse direction (BTC to Stellar) independently", () => {
    expect(quoteMatches(reverseQuote, reverseInput, now)).toBe(true);
    expect(quoteMatches(reverseQuote, { ...reverseInput, to: "USDC" }, now)).toBe(false);
    expect(quoteMatches(reverseQuote, { ...reverseInput, lightning: true }, now)).toBe(false);
    expect(quoteMatches(reverseQuote, { ...reverseInput, amount: 0.002 }, now)).toBe(false);
  });
  it("rejects quotes at their exact expiry", () => {
    expect(quoteMatches(quote, input, Date.parse(quote.expiresAt))).toBe(false);
  });
  it("accepts the signed price but rejects altered price or quote ID", async () => {
    const signature = await signQuote(quote, "test-only-signing-secret");
    expect(await verifyQuote(quote, signature, input, "test-only-signing-secret", now)).toBe(true);
    expect(await verifyQuote({ ...quote, settleAmount: "1" }, signature, input, "test-only-signing-secret", now)).toBe(false);
    expect(await verifyQuote({ ...quote, id: "different" }, signature, input, "test-only-signing-secret", now)).toBe(false);
  });
  it("counts down the locked price and reports expiry", () => {
    const at = Date.parse("2026-10-19T17:50:00Z");
    expect(lockCountdown(quote.expiresAt, at)).toBe("10:00 left");
    expect(lockCountdown(quote.expiresAt, at + 90_000)).toBe("8:30 left");
    expect(lockCountdown(quote.expiresAt, Date.parse(quote.expiresAt))).toBe("Expired");
    expect(lockCountdown(undefined, at)).toBe("—");
  });
});
