// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import * as freighter from "@stellar/freighter-api";
import { paySwapWithWallet } from "./walletPayment";
import type { SwapOrder } from "@/lib/sideshift-schema";

const source = Keypair.random();
const destination = Keypair.random();
const submit = vi.fn();
vi.mock("@stellar/freighter-api", () => ({ getNetwork: vi.fn(), signTransaction: vi.fn() }));
vi.mock("@lobstrco/signer-extension-api", () => ({ getPublicKey: vi.fn(), signTransaction: vi.fn() }));
vi.mock("@albedo-link/intent", () => ({ default: { tx: vi.fn() } }));
vi.mock("@creit.tech/xbull-wallet-connect", () => ({ xBullWalletConnect: class {
  connect() { return Promise.resolve(source.publicKey()); }
  sign({ xdr }: { xdr: string }) { const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC); tx.sign(source); return Promise.resolve(tx.toXDR()); }
  closeConnections() {}
} }));
vi.mock("./walletService", async (original) => ({ ...await original<typeof import("./walletService")>(), loadBalances: vi.fn().mockResolvedValue({ xlm: 100, usdc: 100, eurc: 0, xlmSpendable: 98.99 }) }));
vi.mock("@stellar/stellar-sdk", async (original) => {
  const sdk = await original<typeof import("@stellar/stellar-sdk")>();
  return { ...sdk, Horizon: { ...sdk.Horizon, Server: class {
    loadAccount() { return Promise.resolve(new sdk.Account(source.publicKey(), "10")); }
    fetchBaseFee() { return Promise.resolve(100); }
    submitTransaction(tx: unknown) { return submit(tx); }
  } } };
});
const wallet = { name: "Freighter" as const, address: source.publicKey(), xlm: 100, usdc: 100, eurc: 0 };
const makeOrder = (): SwapOrder => ({ provider: "sideshift", id: crypto.randomUUID(), status: "waiting", depositAddress: destination.publicKey(), depositMemo: "required-memo", depositAmount: "25", settleAmount: "0.0001", expiresAt: new Date(Date.now() + 600000).toISOString(), settleAddress: "bc1qexample", depositCoin: "xlm", settleCoin: "btc" });
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("navigator", { locks: { request: (_key: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) } });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
function allowSigning() {
  vi.mocked(freighter.getNetwork).mockResolvedValue({ network: "PUBLIC", networkPassphrase: Networks.PUBLIC });
  vi.mocked(freighter.signTransaction).mockImplementation(async (xdr) => {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC);
    tx.sign(source);
    return { signedTxXdr: tx.toXDR(), signerAddress: source.publicKey() };
  });
}
describe("Wallet deposit safety", () => {
  it("signs the exact Mainnet amount and required memo, then submits once", async () => {
    allowSigning(); submit.mockResolvedValue({});
    const order = makeOrder();
    const hash = await paySwapWithWallet(wallet, order, vi.fn());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const tx = submit.mock.calls[0]?.[0];
    expect(tx.source).toBe(wallet.address);
    expect(tx.operations[0]).toMatchObject({ type: "payment", destination: destination.publicKey(), amount: "25.0000000" });
    expect(new TextDecoder().decode(tx.memo.value)).toBe("required-memo");
    await expect(paySwapWithWallet(wallet, order, vi.fn())).rejects.toThrow("already submitted");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("never submits when signing is declined", async () => {
    allowSigning(); vi.mocked(freighter.signTransaction).mockRejectedValue(new Error("Declined"));
    await expect(paySwapWithWallet(wallet, makeOrder(), vi.fn())).rejects.toThrow("Declined");
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not sign an expired deposit", async () => {
    await expect(paySwapWithWallet(wallet, { ...makeOrder(), expiresAt: "2020-01-01T00:00:00Z" }, vi.fn())).rejects.toThrow("window is closed");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
  it("blocks another payment if submission outcome is unknown", async () => {
    allowSigning(); submit.mockRejectedValue(new Error("Timeout"));
    const order = makeOrder();
    await expect(paySwapWithWallet(wallet, order, vi.fn())).rejects.toThrow("do not send again");
    await expect(paySwapWithWallet(wallet, order, vi.fn())).rejects.toThrow("already submitted");
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("rejects simultaneous approval for the same order", async () => {
    allowSigning(); submit.mockResolvedValue({});
    const order = makeOrder();
    const first = paySwapWithWallet(wallet, order, vi.fn());
    await expect(paySwapWithWallet(wallet, order, vi.fn())).rejects.toThrow("already open");
    await first;
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it.each(["Lobstr", "Albedo", "xBull"] as const)("uses the official %s signer response", async (name) => {
    submit.mockResolvedValue({});
    const sign = async (xdr: string) => { const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC); tx.sign(source); return tx.toXDR(); };
    const lobstr = await import("@lobstrco/signer-extension-api");
    vi.mocked(lobstr.getPublicKey).mockResolvedValue(source.publicKey());
    vi.mocked(lobstr.signTransaction).mockImplementation(sign);
    const { default: albedo } = await import("@albedo-link/intent");
    vi.mocked(albedo.tx).mockImplementation(async ({ xdr }: { xdr: string }) => ({ xdr, signed_envelope_xdr: await sign(xdr), tx_hash: Array.from(TransactionBuilder.fromXDR(xdr, Networks.PUBLIC).hash(), (byte) => byte.toString(16).padStart(2, "0")).join(""), network: "public", result: {} }));
    await paySwapWithWallet({ ...wallet, name }, makeOrder(), vi.fn());
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("stops before signing if payment status cannot be saved", async () => {
    allowSigning();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("Blocked"); } });
    await expect(paySwapWithWallet(wallet, makeOrder(), vi.fn())).rejects.toThrow("Nothing was signed or sent");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
});