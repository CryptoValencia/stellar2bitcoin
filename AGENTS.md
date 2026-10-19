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
- Execute only live routes with implemented order creation; quote-only providers and simulated estimates must never be actionable swaps.
- SideShift uses its documented private-key header and affiliate ID, validates supported pairs, forwards trusted visitor IP, and creates fixed orders only on explicit confirmation.
- Guest swap orders are stored privately with an HttpOnly session capability hashed in the database; server handlers verify that capability before privileged reads, and provider status—not timers—determines completion.
