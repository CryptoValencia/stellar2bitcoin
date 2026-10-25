import { createServerFn } from "@tanstack/react-start";

export interface MarketPrices {
  btcUsd: number;
  xlmUsd: number;
}


export const getMarketPrices = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; prices?: MarketPrices }> => {
    const readCoinGecko = async (): Promise<MarketPrices | null> => {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,stellar&vs_currencies=usd", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`price feed ${res.status}`);
      const j = (await res.json()) as { bitcoin?: { usd?: number }; stellar?: { usd?: number } };
      const btc = j.bitcoin?.usd;
      const xlm = j.stellar?.usd;
      if (!btc || !xlm || btc <= 0 || xlm <= 0) throw new Error("price feed incomplete");
      return { btcUsd: btc, xlmUsd: xlm };
    };
    const readBinance = async (): Promise<MarketPrices | null> => {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","XLMUSDT"]', {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`price feed ${res.status}`);
      const j = (await res.json()) as { symbol: string; price: string }[];
      const btc = Number(j.find((x) => x.symbol === "BTCUSDT")?.price);
      const xlm = Number(j.find((x) => x.symbol === "XLMUSDT")?.price);
      if (!btc || !xlm || btc <= 0 || xlm <= 0) throw new Error("price feed incomplete");
      return { btcUsd: btc, xlmUsd: xlm };
    };
    for (const read of [readCoinGecko, readBinance]) {
      try {
        const prices = await read();
        if (prices) return { ok: true as const, prices };
      } catch (error) {
        console.warn("market prices unavailable:", error instanceof Error ? error.message : error);
      }
    }
    return { ok: false as const };
  });
