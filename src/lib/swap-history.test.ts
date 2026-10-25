import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ hash: null as string | null, filters: [] as [string, unknown][], queried: false }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ handler: (handler: unknown) => handler, inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
vi.mock("./sideshift.server", () => ({ sessionHash: async () => state.hash }));
const order = { provider: "fixedfloat", id: "saved-order", status: "settled", depositAddress: "G" + "A".repeat(55), depositMemo: null, depositAmount: "25", settleAmount: "0.0001", expiresAt: "2026-10-25T12:00:00Z", settleAddress: "bc1qexample", depositCoin: "xlm", settleCoin: "btc" };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  state.queried = true;
  const query = { select: () => query, eq: (name: string, value: unknown) => { state.filters.push([name, value]); return query; }, not: () => query, order: () => query, limit: async () => ({ data: state.hash === "own-session" ? [{ request_id: "request", created_at: "2026-10-25T12:00:00Z", order_data: { order, secret: { token: "private-provider-token" } } }] : [], error: null }) };
  return query;
} } }));
import { getRecentSwapOrders } from "./sideshift.functions";
const list = getRecentSwapOrders as unknown as () => Promise<{ ok: boolean; orders: unknown[] }>;
beforeEach(() => { state.hash = null; state.filters = []; state.queried = false; });
describe("Private recent swaps", () => {
  it("does not read private rows without a session capability", async () => {
    expect((await list()).orders).toEqual([]);
    expect(state.queried).toBe(false);
  });
  it("filters history by the current session and never returns provider tokens", async () => {
    state.hash = "own-session";
    const result = await list();
    expect(state.filters).toContainEqual(["session_hash", "own-session"]);
    expect(result.orders).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private-provider-token");
  });
  it("cannot recover another browser's orders", async () => {
    state.hash = "other-session";
    expect((await list()).orders).toEqual([]);
    expect(state.filters).toContainEqual(["session_hash", "other-session"]);
  });
});