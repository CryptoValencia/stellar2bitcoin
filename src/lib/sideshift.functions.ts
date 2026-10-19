import { createServerFn } from "@tanstack/react-start";

const COIN: Record<string, string> = { XLM: "xlm", USDC: "usdc", EURC: "eurc" };

export const getSideShiftQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { from: string; amount: number; lightning: boolean }) => {
    if (!COIN[d.from] || !(d.amount > 0) || d.amount > 1e9) throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["SIDESHIFT_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "not_configured" };
    try {
      const r = await fetch("https://sideshift.ai/api/v2/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SS-Api-Key": apiKey },
        body: JSON.stringify({
          depositCoin: COIN[data.from],
          depositNetwork: "stellar",
          settleCoin: "btc",
          settleNetwork: data.lightning ? "lightning" : "bitcoin",
          depositAmount: String(data.amount),
        }),
      });
      if (!r.ok) return { ok: false as const, error: `http_${r.status}` };
      const j = (await r.json()) as { settleAmount?: string };
      const out = Number(j.settleAmount);
      if (!out || out <= 0) return { ok: false as const, error: "no_quote" };
      return { ok: true as const, btcOut: out };
    } catch {
      return { ok: false as const, error: "network" };
    }
  });
