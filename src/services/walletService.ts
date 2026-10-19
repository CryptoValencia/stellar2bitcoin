export const WALLET_NAMES = ["Freighter", "Lobstr", "xBull", "Albedo"] as const;
export type WalletName = (typeof WALLET_NAMES)[number];
export interface Wallet { name: WalletName; address: string; xlm: number; usdc: number; eurc: number }
export const ASSET_ISSUERS = {
  USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  EURC: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
};
interface Balance { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string; selling_liabilities?: string; is_authorized?: boolean }
export function parseBalances(balances: Balance[]) {
  const available = (b: Balance | undefined) => b && b.is_authorized !== false ? Math.max(0, Number(b.balance) - Number(b.selling_liabilities ?? 0)) : 0;
  return {
    xlm: available(balances.find((b) => b.asset_type === "native")),
    usdc: available(balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === ASSET_ISSUERS.USDC)),
    eurc: available(balances.find((b) => b.asset_code === "EURC" && b.asset_issuer === ASSET_ISSUERS.EURC)),
  };
}
export async function loadBalances(address: string) {
  const response = await fetch(`https://horizon.stellar.org/accounts/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return { xlm: 0, usdc: 0, eurc: 0 };
  if (!response.ok) throw new Error("Couldn't load your balance. Please try again.");
  const account = await response.json() as { balances: Balance[] };
  return parseBalances(account.balances);
}
export async function authorizeWallet(name: WalletName): Promise<string> {
  let address: string;
  if (name === "Freighter") {
    const api = await import("@stellar/freighter-api");
    const installed = await api.isConnected();
    if (!installed.isConnected) throw new Error("Freighter wasn't detected. Install or enable its extension, then open this site in your browser.");
    const access = await api.requestAccess();
    if (access.error) throw new Error(access.error.message || "Connection declined. Please try again.");
    const network = await api.getNetwork();
    if (network.error) throw new Error("Couldn't read your wallet network. Please try again.");
    if (network.networkPassphrase !== "Public Global Stellar Network ; September 2015") throw new Error("Switch Freighter to Mainnet, then connect again.");
    address = access.address;
  } else if (name === "Lobstr") {
    const api = await import("@lobstrco/signer-extension-api");
    if (!(await api.isConnected())) throw new Error("LOBSTR Signer wasn't detected. Install its extension and pair it with your LOBSTR app.");
    address = await api.getPublicKey();
  } else if (name === "Albedo") {
    const { default: api } = await import("@albedo-link/intent");
    address = (await api.publicKey({})).pubkey;
  } else {
    const { xBullWalletConnect } = await import("@creit.tech/xbull-wallet-connect");
    const api = new xBullWalletConnect();
    try { address = await api.connect({ canRequestPublicKey: true, canRequestSign: true }); }
    finally { api.closeConnections(); }
  }
  if (!/^G[A-Z2-7]{55}$/.test(address)) throw new Error("No Stellar account was authorized. Please try again.");
  return address;
}
export async function connectWallet(name: WalletName): Promise<Wallet> {
  const address = await authorizeWallet(name);
  return { name, address, ...await loadBalances(address) };
}