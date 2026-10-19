<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Wallet authorization uses browser-only dynamic imports of official wallet SDKs, and balances come from Stellar Mainnet Horizon with issuer matching; never substitute demo accounts or balances.
- Wallet dialogs use the shared portaled Dialog component to avoid header stacking contexts blocking interactions.
- Title typography is isolated in the header wordmark styles; changing the brand must not change the swap's font.
- Execute only live routes with implemented order creation; quote-only providers and simulated estimates must never be actionable swaps.
- Live swap displays must preserve the provider's BTC amount and never attach static USD valuations or simulated fees/times; unavailable market data stays omitted to avoid implying a gain.
- Fixed quotes carry a session-bound HMAC snapshot; creation reuses that exact provider quote, and changed inputs or expiry invalidate it instead of silently repricing.
- SideShift uses its documented private-key header and affiliate ID, validates supported pairs, forwards trusted visitor IP, and creates fixed orders only on explicit confirmation.
- Guest swap orders are stored privately with an HttpOnly session capability hashed in the database; server handlers verify that capability before privileged reads, and provider status—not timers—determines completion.
- SideShift, FixedFloat and ChangeNOW quotes are fetched server-side in one call, signed, and the highest BTC output is preselected; provider secrets (e.g. FixedFloat order token) are stored only in the database, never returned to the browser.
