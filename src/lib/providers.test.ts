// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { cnCreate, cnQuote, ffCreate } from "./providers.server";
const quote = { provider: "changenow" as const, from: "XLM" as const, to: "BTC" as const, amount: 1000, lightning: false, id: "provider-rate-id", settleAmount: "0.0021", expiresAt: new Date(Date.now() + 60000).toISOString() };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Executable provider guarantees", () => {
  it("never creates a FixedFloat order from an unlocked quote", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(ffCreate({ ...quote, provider: "fixedfloat" }, "destination", "refund")).rejects.toThrow("cannot preserve");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an expired provider rate", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only"); vi.stubEnv("UDC_CHANGENOW_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rateId: "rate", toAmount: "0.0021", validUntil: "2020-01-01T00:00:00Z" }) }));
    await expect(cnQuote(quote)).rejects.toThrow("expired");
  });
  it("creates with the exact provider rate ID and payout", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only"); vi.stubEnv("UDC_CHANGENOW_API_KEY", "test-only");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "created", payinAddress: "G" + "A".repeat(55), fromAmount: 1000, toAmount: "0.0021", payoutAddress: "destination" }) });
    vi.stubGlobal("fetch", fetch);
    const result = await cnCreate(quote, "destination", "refund", "request");
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body).rateId).toBe("provider-rate-id");
    expect(result.order.settleAmount).toBe("0.0021");
  });
});