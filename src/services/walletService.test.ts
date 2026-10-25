import { describe, expect, it, vi, afterEach } from "vitest";
import { ASSET_ISSUERS, connectWallet, loadBalances, parseBalances } from "./walletService";
vi.mock("@stellar/freighter-api", () => ({ isConnected: vi.fn(), requestAccess: vi.fn(), getNetwork: vi.fn() }));
import * as freighter from "@stellar/freighter-api";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Real wallet connections", () => {
  it("does not connect a missing extension or invent an account", async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });
    await expect(connectWallet("Freighter")).rejects.toThrow("wasn't detected");
  });
  it("keeps rejected access disconnected", async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: "", error: { code: -1, message: "User declined" } });
    await expect(connectWallet("Freighter")).rejects.toThrow("User declined");
  });
  it("returns the authorized address and actual Mainnet balances", async () => {
    const address = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address });
    vi.mocked(freighter.getNetwork).mockResolvedValue({ network: "PUBLIC", networkPassphrase: "Public Global Stellar Network ; September 2015" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ balances: [{ asset_type: "native", balance: "25.5" }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ _embedded: { records: [{ base_reserve_in_stroops: 5000000 }] } }) }));
    expect(await connectWallet("Freighter")).toEqual({ name: "Freighter", address, xlm: 25.5, usdc: 0, eurc: 0, xlmSpendable: 24.49 });
  });
  it("rejects Testnet connections", async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: "G" + "A".repeat(55) });
    vi.mocked(freighter.getNetwork).mockResolvedValue({ network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" });
    await expect(connectWallet("Freighter")).rejects.toThrow("Mainnet");
  });
  it("only counts authorized Circle assets and subtracts selling liabilities", () => {
    expect(parseBalances([
      { asset_type: "native", balance: "30", selling_liabilities: "2" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: ASSET_ISSUERS.USDC, balance: "12.5" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "fake", balance: "999999" },
      { asset_type: "credit_alphanum4", asset_code: "EURC", asset_issuer: ASSET_ISSUERS.EURC, balance: "5", is_authorized: false },
    ])).toEqual({ xlm: 28, usdc: 12.5, eurc: 0 });
  });
  it("shows zero for an unfunded account but fails visibly on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ status: 503, ok: false }));
    expect(await loadBalances("G" + "A".repeat(55))).toEqual({ xlm: 0, usdc: 0, eurc: 0, xlmSpendable: 0 });
    await expect(loadBalances("G" + "A".repeat(55))).rejects.toThrow("load your balance");
  });
});