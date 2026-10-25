export interface ReserveAccount { subentry_count?: number; num_sponsoring?: number; num_sponsored?: number }
export function spendableXlm(available: number, account: ReserveAccount, baseReserve: number, fee: number) {
  if (![available, baseReserve, fee].every(Number.isFinite) || baseReserve <= 0 || fee < 0) return 0;
  const units = Math.max(0, 2 + (account.subentry_count ?? 0) + (account.num_sponsoring ?? 0) - (account.num_sponsored ?? 0));
  const availableStroops = Math.floor(available * 1e7);
  const reserveStroops = Math.round(baseReserve * 1e7) * units;
  const feeStroops = Math.ceil(fee * 1e7);
  return Math.max(0, availableStroops - reserveStroops - feeStroops) / 1e7;
}