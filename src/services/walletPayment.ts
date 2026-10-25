import type { SwapOrder } from "@/lib/sideshift-schema";
import { orderKey } from "@/lib/swap-extras";
import { ASSET_ISSUERS, type Wallet } from "./walletService";

const MAINNET = "Public Global Stellar Network ; September 2015";
const attemptKey = (order: SwapOrder) => `s2b_payment:${orderKey(order)}`;
const inFlight = new Set<string>();
export function savedPaymentHash(order: SwapOrder) { return localStorage.getItem(attemptKey(order)); }

export async function paySwapWithWallet(wallet: Wallet, order: SwapOrder, onSubmitted: (hash: string) => void) {
  const key = attemptKey(order);
  if (inFlight.has(key)) throw new Error("Payment approval is already open. Check your wallet.");
  if (!navigator.locks) throw new Error("Direct payment isn't supported in this browser. Use the QR or open your wallet instead.");
  inFlight.add(key);
  try {
    return await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error("Payment approval is already open in another tab.");
      return sendPayment(wallet, order, onSubmitted);
    });
  } finally { inFlight.delete(key); }
}

async function sendPayment(wallet: Wallet, order: SwapOrder, onSubmitted: (hash: string) => void) {
  if (order.status !== "waiting" || Date.parse(order.expiresAt) <= Date.now()) throw new Error("The deposit window is closed. Do not send funds.");
  if (savedPaymentHash(order)) throw new Error("A payment was already submitted. Wait for the swap status before sending again.");
  const sdk = await import("@stellar/stellar-sdk");
  const coin = order.depositCoin.toUpperCase();
  if (!["XLM", "USDC"].includes(coin) || (order.depositNetwork && order.depositNetwork !== "stellar") || !sdk.StrKey.isValidEd25519PublicKey(order.depositAddress)) throw new Error("This deposit cannot be sent with a Stellar wallet.");
  const server = new sdk.Horizon.Server("https://horizon.stellar.org");
  const [account, fee] = await Promise.all([server.loadAccount(wallet.address), server.fetchBaseFee()]);
  const asset = coin === "XLM" ? sdk.Asset.native() : new sdk.Asset("USDC", ASSET_ISSUERS.USDC);
  const seconds = Math.min(120, Math.floor((Date.parse(order.expiresAt) - Date.now()) / 1000));
  if (seconds <= 0) throw new Error("The deposit window is closed. Do not send funds.");
  let builder = new sdk.TransactionBuilder(account, { fee: String(fee), networkPassphrase: MAINNET })
    .addOperation(sdk.Operation.payment({ destination: order.depositAddress, asset, amount: order.depositAmount }));
  if (order.depositMemo) builder = builder.addMemo(sdk.Memo.text(order.depositMemo));
  const prepared = builder.setTimeout(seconds).build();
  const xdr = prepared.toXDR();
  let signedXdr: string;
  if (wallet.name === "Freighter") {
    const api = await import("@stellar/freighter-api");
    const network = await api.getNetwork();
    if (network.error || network.networkPassphrase !== MAINNET) throw new Error("Switch Freighter to Mainnet before sending.");
    const result = await api.signTransaction(xdr, { networkPassphrase: MAINNET, address: wallet.address });
    if (result.error || !result.signedTxXdr || result.signerAddress !== wallet.address) throw new Error("Payment was not signed by your connected wallet.");
    signedXdr = result.signedTxXdr;
  } else if (wallet.name === "Lobstr") {
    const api = await import("@lobstrco/signer-extension-api");
    if (await api.getPublicKey() !== wallet.address) throw new Error("Reconnect the wallet before sending.");
    signedXdr = await api.signTransaction(xdr);
  } else if (wallet.name === "Albedo") {
    const { default: api } = await import("@albedo-link/intent");
    const result = await api.tx({ xdr, pubkey: wallet.address, network: "public", submit: false });
    signedXdr = result.signed_envelope_xdr;
  } else {
    const { xBullWalletConnect } = await import("@creit.tech/xbull-wallet-connect");
    const api = new xBullWalletConnect();
    try {
      const address = await api.connect({ canRequestPublicKey: true, canRequestSign: true });
      if (address !== wallet.address) throw new Error("Select the connected wallet account before signing.");
      signedXdr = await api.sign({ xdr, publicKey: wallet.address, network: MAINNET });
    } finally { api.closeConnections(); }
  }
  const signed = sdk.TransactionBuilder.fromXDR(signedXdr, MAINNET);
  const preparedHash = prepared.hash();
  const signedHash = signed.hash();
  if (signedHash.length !== preparedHash.length || !signedHash.every((byte, i) => byte === preparedHash[i]) || !signed.signatures.length) throw new Error("The signed payment does not match this order. Nothing was sent.");
  const signer = sdk.Keypair.fromPublicKey(wallet.address);
  if (!signed.signatures.some((sig) => signer.verify(signedHash, sig.signature))) throw new Error("The connected wallet's signature is missing. Nothing was sent.");
  if (Date.parse(order.expiresAt) <= Date.now()) throw new Error("The deposit window expired while signing. Nothing was sent.");
  const hash = Array.from(signedHash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(attemptKey(order), hash);
  onSubmitted(hash);
  try { await server.submitTransaction(signed); }
  catch {
    throw new Error("Payment confirmation is unavailable. Check the transaction below; do not send again while its status is unknown.");
  }
  return hash;
}