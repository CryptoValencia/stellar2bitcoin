import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sideshift.functions", () => ({
  getSideShiftQuote: vi.fn().mockResolvedValue({ ok: true, btcOut: 0.00210024 }),
}));
vi.mock("@/lib/fixedfloat.functions", () => ({ getFixedFloatQuote: vi.fn() }));

import { fetchSideShiftQuote } from "./aggregatorService";

describe("live XLM to BTC quote integrity", () => {
  it("preserves the provider's BTC amount for 1000 XLM without simulated costs or timing", async () => {
    const quote = await fetchSideShiftQuote("XLM", 1000);
    expect(quote.btcOut).toBe(0.00210024);
    expect(quote.live).toBe(true);
    expect(quote.feeUsd).toBeNull();
    expect(quote.feeBtc).toBeNull();
    expect(quote.etaMin).toBeNull();
  });
});