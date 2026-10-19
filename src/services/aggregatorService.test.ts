import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/sideshift.functions", () => ({ getSideShiftQuote: vi.fn() }));
import { fetchAllQuotes } from "./aggregatorService";
import { getSideShiftQuote } from "@/lib/sideshift.functions";
const snap = (provider: "sideshift" | "changenow", settleAmount: string) => ({ from: "XLM" as const, amount: 1000, lightning: false, id: "q", settleAmount, expiresAt: new Date(Date.now() + 60000).toISOString(), provider });
describe("live quote aggregation", () => {
  it("preserves provider BTC amounts and picks the highest first, without simulated costs", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: true, quotes: [
      { btcOut: 0.0021, quote: snap("sideshift", "0.0021"), quoteSignature: "a".repeat(64) },
      { btcOut: 0.00215, quote: snap("changenow", "0.00215"), quoteSignature: "b".repeat(64) },
    ] });
    const q = await fetchAllQuotes("XLM", 1000, "mainnet");
    expect(q.map((x) => x.id)).toEqual(["changenow", "sideshift"]);
    expect(q[0].btcOut).toBe(0.00215);
    expect(q[0].feeUsd).toBeNull();
    expect(q[0].etaMin).toBeNull();
  });
  it("does not substitute a simulated price when providers fail", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: false, error: "unavailable" });
    expect(await fetchAllQuotes("USDC", 100, "mainnet")).toEqual([]);
  });
});
