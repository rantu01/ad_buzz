// Shared account-math helpers (single source of truth for dashboard figures).
//
// Remaining Balance keeps its existing business meaning everywhere:
//   Remaining Balance = Meta spend_cap − Meta amount_spent
// in major currency units (dollars). Meta's top-level `balance` is a
// different billing concept (amount due) and must NOT be used here.

export function computeRemainingBalance(spendCap, amountSpent) {
  if (typeof spendCap !== "number" || typeof amountSpent !== "number") return null;
  if (!Number.isFinite(spendCap) || !Number.isFinite(amountSpent)) return null;
  return spendCap - amountSpent;
}

export function remainingBalanceSource(remainingBalance) {
  return remainingBalance == null ? "unavailable" : "meta";
}
