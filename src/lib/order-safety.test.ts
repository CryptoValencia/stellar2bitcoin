import { describe, expect, it } from "vitest";
import { exactPayout, requestFingerprint } from "./order-safety";
const quote = { provider: "changenow" as const, from: "XLM" as const, to: "BTC" as const, amount: 1000, lightning: false, id: "provider-quote", settleAmount: "0.00210000", expiresAt: "2026-10-25T13:00:00Z" };
describe("Exact order confirmation", () => {
  it("never accepts even a 0.1% lower payout", () => { expect(exactPayout(quote, "0.0020979")).toBe(false); });
  it("accepts the exact confirmed payout with equivalent decimals", () => { expect(exactPayout(quote, "0.0021")).toBe(true); });
  it("binds retries to the same quote and destination", () => {
    const input = { ...quote, quote, destination: "destination-a", refundAddress: "refund" };
    expect(requestFingerprint(input)).not.toBe(requestFingerprint({ ...input, destination: "destination-b" }));
    expect(requestFingerprint(input)).not.toBe(requestFingerprint({ ...input, quote: { ...quote, id: "different-quote" } }));
  });
});