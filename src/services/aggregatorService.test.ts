import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sideshift.functions", () => ({
  getSideShiftQuote: vi.fn(),
}));
vi.mock("@/lib/fixedfloat.functions", () => ({ getFixedFloatQuote: vi.fn() }));

import { fetchSideShiftQuote } from "./aggregatorService";
import { getSideShiftQuote } from "@/lib/sideshift.functions";

describe("live XLM to BTC quote integrity", () => {
  it("preserves the provider's BTC amount for 1000 XLM without simulated costs or timing", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: true, btcOut: 0.00210024, quote: { from: "XLM", amount: 1000, lightning: false, id: "quote-id", settleAmount: "0.00210024", expiresAt: new Date(Date.now() + 60000).toISOString() }, quoteSignature: "a".repeat(64) });
    const quote = await fetchSideShiftQuote("XLM", 1000);
    expect(quote?.btcOut).toBe(0.00210024);
    expect(quote?.live).toBe(true);
    expect(quote?.feeUsd).toBeNull();
    expect(quote?.feeBtc).toBeNull();
    expect(quote?.etaMin).toBeNull();
  });
  it("does not substitute a simulated price when the provider fails", async () => {
    vi.mocked(getSideShiftQuote).mockResolvedValue({ ok: false, error: "unavailable" });
    expect(await fetchSideShiftQuote("USDC", 100)).toBeNull();
  });
});