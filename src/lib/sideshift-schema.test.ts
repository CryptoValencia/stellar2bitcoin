import { describe, expect, it } from "vitest";
import { AFFILIATE_ID, chooseExecutableQuotes, orderInput, orderIsFinal, shiftSchema } from "./sideshift-schema";
describe("SideShift order safety", () => {
  it("uses the user's affiliate link account", () => { expect(AFFILIATE_ID).toBe("Pw4WPjlQu"); });
  it("never executes simulated or quote-only routes", () => {
    expect(chooseExecutableQuotes([{ id: "sideshift", live: true }, { id: "sideshift", live: false }, { id: "cctp", live: true }, { id: "fixedfloat", live: true }])).toEqual([{ id: "sideshift", live: true }, { id: "fixedfloat", live: true }]);
  });
  it("requires positive amounts and a real Stellar refund account", () => {
    expect(orderInput.safeParse({ from: "XLM", amount: -1, lightning: false, destination: "bc1" + "a".repeat(38), refundAddress: "fake", requestId: crypto.randomUUID() }).success).toBe(false);
  });
  it("does not invent completion from pending or unknown states", () => {
    expect(orderIsFinal("waiting")).toBe(false); expect(orderIsFinal("pending")).toBe(false); expect(orderIsFinal("unknown")).toBe(false); expect(orderIsFinal("settled")).toBe(true);
  });
  it("rejects fabricated deposit instructions", () => { expect(shiftSchema.safeParse({ id: "fake", depositAddress: "GDEPfake", status: "waiting" }).success).toBe(false); });
});