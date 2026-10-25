import { describe, expect, it } from "vitest";
import { AFFILIATE_ID, chooseExecutableQuotes, orderInput, orderIsFinal, shiftSchema } from "./sideshift-schema";
const quote = { from: "XLM", to: "BTC", amount: 100, lightning: false, id: "q", settleAmount: "0.0021", expiresAt: "2026-10-19T18:00:00Z", provider: "sideshift" };
describe("SideShift order safety", () => {
  it("uses the user's affiliate link account", () => { expect(AFFILIATE_ID).toBe("Pw4WPjlQu"); });
  it("never executes simulated or quote-only routes", () => {
    expect(chooseExecutableQuotes([{ id: "sideshift", live: true }, { id: "sideshift", live: false }, { id: "cctp", live: true }, { id: "fixedfloat", live: true }])).toEqual([{ id: "sideshift", live: true }, { id: "fixedfloat", live: true }]);
  });
  it("requires positive amounts and a real Stellar refund account", () => {
    expect(orderInput.safeParse({ from: "XLM", amount: -1, lightning: false, destination: "bc1" + "a".repeat(38), refundAddress: "fake", requestId: crypto.randomUUID() }).success).toBe(false);
  });
  it("routes each address to the correct side in both directions", () => {
    const btcAddress = "bc1q" + "a".repeat(38);
    const stellar = "G" + "A".repeat(55);
    const forward = { from: "XLM", to: "BTC", amount: 100, lightning: false, destination: btcAddress, refundAddress: stellar, requestId: crypto.randomUUID(), quote, quoteSignature: "a".repeat(64) };
    expect(orderInput.safeParse(forward).success).toBe(true);
    expect(orderInput.safeParse({ ...forward, destination: stellar }).success).toBe(false);
    const reverse = { from: "BTC", to: "XLM", amount: 0.001, lightning: false, destination: stellar, refundAddress: btcAddress, requestId: crypto.randomUUID(), quote: { ...quote, from: "BTC", to: "XLM", amount: 0.001 }, quoteSignature: "a".repeat(64) };
    expect(orderInput.safeParse(reverse).success).toBe(true);
    expect(orderInput.safeParse({ ...reverse, refundAddress: stellar }).success).toBe(false);
  });
  it("does not invent completion from pending or unknown states", () => {
    expect(orderIsFinal("waiting")).toBe(false); expect(orderIsFinal("pending")).toBe(false); expect(orderIsFinal("unknown")).toBe(false); expect(orderIsFinal("settled")).toBe(true);
  });
  it("rejects fabricated deposit instructions", () => {
    expect(shiftSchema.safeParse({ id: "fake", depositAddress: "no", status: "waiting" }).success).toBe(false);
    expect(shiftSchema.safeParse({ id: "fake", depositAddress: "G" + "A".repeat(55), status: "waiting" }).success).toBe(false);
  });
});
