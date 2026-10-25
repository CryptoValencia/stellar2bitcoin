export interface ReserveAccount { subentry_count?: number; num_sponsoring?: number; num_sponsored?: number }
export function spendableXlm(available: number, account: ReserveAccount, baseReserve: number, fee: number) {
  if (![available, baseReserve, fee].every(Number.isFinite) || baseReserve <= 0 || fee < 0) return 0;
  const units = Math.max(0, 2 + (account.subentry_count ?? 0) + (account.num_sponsoring ?? 0) - (account.num_sponsored ?? 0));
  return Math.max(0, Math.floor((available - units * baseReserve - fee) * 1e7) / 1e7);
}