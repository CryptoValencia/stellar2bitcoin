# Stellar2Bitcoin

**Non-custodial, bidirectional swap router between the Stellar network (XLM, USDC) and Bitcoin (on-chain and Lightning).**

Live: https://stellar2bitcoin.lovable.app

Stellar2Bitcoin aggregates multiple liquidity providers behind one swap screen. It fetches executable quotes server-side, cryptographically binds the chosen quote to the user's session, and executes the order at exactly that price, or refuses. Users sign deposits with their own Stellar wallet. Funds never touch our servers.

---

## Why it's hard

A swap UI looks simple. Doing it safely across independent third-party providers is not:

| Problem | How we solve it |
|---|---|
| Providers reprice between quote and order | Quotes are **HMAC-signed snapshots** bound to the session, the pair, the amount and the expiry. Order creation reuses the *exact* provider quote ID. If anything changed, the order is rejected, never silently repriced. |
| Network timeouts create duplicate orders | Each order is claimed using an **immutable request fingerprint**. A retry with the same fingerprint gets the existing order back. A different payload is rejected. An uncertain creation keeps its claim. |
| Wallet signs something different from what was shown | The signed XDR is **decoded and verified** against the prepared Mainnet payment (destination, amount, asset, memo, network passphrase, signer signature) before submission. |
| Double-submission after a crash or refresh | The attempted transaction hash is saved and locked with `navigator.locks`. An unknown outcome blocks blind resubmission. |
| "MAX" leaves the account below the reserve | Spendable XLM is calculated in **integer stroops** from the live ledger's `base_reserve`, subentries and sponsorships, plus a fee buffer. It is checked again right before signing. |
| Anonymous users still need private order history | Guest sessions use an **HttpOnly capability token**, and only its hash is stored in the database. Every privileged read checks it on the server. Provider secrets are never returned. |
| Fake numbers look like gains | No simulated prices, fees or times. If market data is missing, the value is left out instead of guessed. The BTC amount shown is the provider's real payout. |

---

## Architecture

```text
 Browser (React 19 + TanStack Router)
 ├─ Swap UI ───────────── typed quote results, route limits, retry
 ├─ Wallet layer ──────── Freighter · Lobstr · xBull · Albedo (dynamic SDK imports)
 └─ Payment signer ────── @stellar/stellar-sdk, build → sign → verify → submit
            │
            ▼  server functions (edge runtime)
 ┌───────────────────────────────────────────────────────────┐
 │ Quote aggregator    parallel fetch → validate → rank      │
 │ Quote proof         HMAC snapshot (session + pair + exp)  │
 │ Order engine        fingerprint claim → exact-quote create│
 │ Status tracker      provider-driven state, tx-hash mapping│
 │ Session guard       HttpOnly capability, hashed at rest   │
 └───────────────────────────────────────────────────────────┘
        │                    │                     │
   SideShift            ChangeNOW             FixedFloat
   (fixed orders)       (rate-id orders)      (quote + tracking)
        │
        ▼
 Postgres with row-level security (private swap_orders)
 Stellar Horizon Mainnet · mempool.space · StellarExpert
```

### Provider routing
- Every eligible provider is queried **server-side in one call**. The quotes are normalized, checked for pair and amount sanity, and ranked by output. The best one is preselected.
- Only providers whose order creation can **keep the confirmed price** can be executed. Providers that only give quotes help price discovery but can never be executed.
- Provider names are abstracted away. Users see only the rate, the fees and the arrival time.

### Order lifecycle
`quote → signed snapshot → confirm → fingerprinted claim → provider create → deposit → provider status → settle`

Completion is decided by **provider status, never by a timer**. Deposit and payout transaction hashes are validated before we link to them in an explorer. Lightning payment hashes are never presented as Bitcoin transactions.

---

## Features
- XLM / USDC (Stellar) ⇄ BTC (on-chain or Lightning)
- Live quotes without connecting a wallet, with real provider minimums and maximums
- One-click deposit signing with the connected wallet
- Price-lock countdown taken from the provider's expiry time
- 25% / 50% / MAX shortcuts that respect the reserve
- Private recent-swap history per session
- Block explorer links for real on-chain transactions
- Dark and light themes

---

## Tech stack
- **Frontend:** React 19, TanStack Start / Router, Tailwind CSS v4, shadcn/ui
- **Server:** TanStack server functions on an edge (Workers) runtime
- **Data:** Postgres with row-level security
- **Chain:** `@stellar/stellar-sdk`, Horizon Mainnet, official wallet SDKs
- **Testing:** Vitest, 50+ tests covering quote proofs, order idempotency, payment verification, reserve math, session isolation and provider adapters

## Project layout
```text
src/lib/quote-proof.server.ts   HMAC quote snapshots
src/lib/quote-safety.ts         quote validation and typed errors
src/lib/order-safety.ts         exact-payout and fingerprint checks
src/lib/providers.server.ts     ChangeNOW / FixedFloat adapters
src/lib/sideshift.server.ts     SideShift adapter
src/lib/sideshift.functions.ts  quote, order, status and history server functions
src/services/aggregatorService  client quote orchestration
src/services/walletService      wallet connection and Horizon balances
src/services/walletPayment      build / sign / verify / submit pipeline
src/services/stellarBalance     reserve-aware spendable balance
```

## Run locally
```sh
bun install
bun run dev
bunx vitest run
```
Provider API keys and the quote-signing secret are read on the server from environment variables. They are never stored in the repository.

## Security notes
- Non-custodial: deposits go straight from the user's wallet to the provider's deposit address.
- No provider credentials or tokens ever reach the browser.
- Mainnet only. Every signed transaction is checked against the Mainnet network passphrase.
