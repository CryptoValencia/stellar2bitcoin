import { describe, expect, it } from "vitest";
import { explorerUrl, shortcutAmount } from "./swap-extras";

describe("Swap shortcuts and explorers", () => {
  it("uses 25% of the balance", () => expect(shortcutAmount(100, 25, "XLM")).toBe("25"));
  it("uses 50% of the balance", () => expect(shortcutAmount(100, 50, "USDC")).toBe("50"));
  it("MAX never rounds above the balance", () => expect(Number(shortcutAmount(12.999, 100, "USDC"))).toBe(12.99));
  it("links a real BTC hash to mempool", () => expect(explorerUrl("BTC", "a".repeat(64), "bitcoin")).toBe(`https://mempool.space/tx/${"a".repeat(64)}`));
  it("links Stellar hashes to Mainnet StellarExpert", () => expect(explorerUrl("USDC", "b".repeat(64), "stellar")).toBe(`https://stellar.expert/explorer/public/tx/${"b".repeat(64)}`));
  it("does not invent links for missing hashes or Lightning", () => {
    expect(explorerUrl("BTC", null)).toBeNull();
    expect(explorerUrl("BTC", "a".repeat(64), "lightning")).toBeNull();
    expect(explorerUrl("BTC", "deposit-address")).toBeNull();
  });
});