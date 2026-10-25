import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/sideshift.functions", () => ({ getSideShiftQuote: vi.fn() }));
import { fetchAllQuotes } from "./aggregatorService";
import { getSideShiftQuote } from "@/lib/sideshift.functions";
const snap = (provider: "sideshift" | "changenow", settleAmount: string, from: "XLM" | "USDC" | "BTC" = "XLM", to: "XLM" | "USDC" | "BTC" = "BTC", amount = 1000) => ({ from, to, amount, lightning: false, id: "q", settleAmount, expiresAt: new Date(Date.now() + 60000).toISOString(), provider });
describe("live quote aggregation", () => {
  it("preserves provider output amounts and picks the highest first, without simulated costs", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: true, quotes: [
      { outAmount: 0.0021, quote: snap("sideshift", "0.0021"), quoteSignature: "a".repeat(64) },
      { outAmount: 0.00215, quote: snap("changenow", "0.00215"), quoteSignature: "b".repeat(64) },
    ] });
    const q = await fetchAllQuotes("XLM", "BTC", 1000, "mainnet");
    expect(q.map((x) => x.id)).toEqual(["changenow", "sideshift"]);
    expect(q[0]?.outAmount).toBe(0.00215);
    expect(q[0]?.outCoin).toBe("BTC");
    expect(q[0]?.feeUsd).toBeNull();
    expect(q[0]?.etaMin).toBeNull();
  });
  it("keeps the real Stellar output for the reverse direction", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: true, quotes: [
      { outAmount: 9800, quote: snap("sideshift", "9800", "BTC", "XLM", 0.001), quoteSignature: "a".repeat(64) },
    ] });
    const q = await fetchAllQuotes("BTC", "XLM", 0.001, "mainnet");
    expect(q[0]?.outAmount).toBe(9800);
    expect(q[0]?.outCoin).toBe("XLM");
  });
  it("does not substitute a simulated price when providers fail", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: false, error: "unavailable" });
    expect(await fetchAllQuotes("USDC", "BTC", 100, "mainnet")).toEqual([]);
  });
});
