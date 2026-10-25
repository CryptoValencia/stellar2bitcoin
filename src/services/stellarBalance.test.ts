import { describe, expect, it } from "vitest";
import { spendableXlm } from "./stellarBalance";
describe("Stellar spendable balance", () => {
  it("retains the account reserve and fee", () => expect(spendableXlm(100, { subentry_count: 1 }, 0.5, 0.01)).toBe(98.49));
  it("accounts for sponsored entries", () => expect(spendableXlm(100, { subentry_count: 2, num_sponsored: 1, num_sponsoring: 1 }, 0.5, 0.01)).toBe(97.99));
  it("never offers reserve-only funds", () => expect(spendableXlm(1, {}, 0.5, 0.01)).toBe(0));
  it("does not invent spendable funds without reserve data", () => expect(spendableXlm(100, {}, NaN, 0.01)).toBe(0));
});