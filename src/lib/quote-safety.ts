export interface QuoteContext { from: string; amount: number; lightning: boolean }
export interface QuoteSnapshot extends QuoteContext { id: string; settleAmount: string; expiresAt: string }
export function positiveFinite(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}
export function quoteMatches(quote: QuoteSnapshot, input: QuoteContext, now = Date.now()): boolean {
  return quote.from === input.from && quote.amount === input.amount && quote.lightning === input.lightning
    && positiveFinite(quote.settleAmount) && Date.parse(quote.expiresAt) > now;
}
export function lockCountdown(expiresAt: string | undefined, now: number): string {
  if (!expiresAt) return "—";
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`;
}