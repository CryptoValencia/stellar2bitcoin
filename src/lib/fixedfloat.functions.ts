import { createServerFn } from "@tanstack/react-start";

const CCY: Record<string, string> = { XLM: "XLM" };

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const getFixedFloatQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { from: string; amount: number; lightning: boolean; fixed: boolean }) => {
    if (!CCY[d.from] || !Number.isFinite(d.amount) || !(d.amount > 0) || d.amount > 1e9 || typeof d.lightning !== "boolean" || typeof d.fixed !== "boolean") throw new Error("Invalid input");
    return d;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env['FIXEDFLOAT_API_KEY'];
    const secret = process.env['FIXEDFLOAT_API_SECRET'];
    if (!apiKey || !secret) return { ok: false as const, error: "not_configured" };
    const body = JSON.stringify({
      type: data.fixed ? "fixed" : "float",
      fromCcy: CCY[data.from], toCcy: data.lightning ? "BTCLN" : "BTC",
      direction: "from", amount: data.amount,
    });
    try {
      const r = await fetch("https://ff.io/api/v2/price", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-API-KEY": apiKey, "X-API-SIGN": await sign(secret, body) },
        body, signal: AbortSignal.timeout(20000),
      });
      const j = (await r.json()) as { code: number; msg?: string; data?: { to?: { amount?: string }; errors?: string[] } };
      const out = Number(j.data?.to?.amount);
      if (!r.ok || j.code !== 0 || !Number.isFinite(out) || out <= 0) return { ok: false as const, error: "Price unavailable for this amount or network." };
      return { ok: true as const, btcOut: out };
    } catch {
      return { ok: false as const, error: "network" };
    }
  });
