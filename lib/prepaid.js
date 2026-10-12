// Pure, dependency-free parser for Meta `funding_source_details` (shape
// varies by account / permission; Meta does not document a single balance
// sub-field). Imported by lib/metaApiService.js (which re-exports it,
// preserving existing contracts) and directly by tests.
//
// Returns { value: number|null, status: "available"|"unavailable", raw }.
// Monetary convention follows the rest of the Graph API: integer values are
// minor currency units (÷100); decimal strings are major units as-is.

// NOTE on prepaid Funds mapping (Payment & Billing → Funds):
// - Top-level `balance` is documented by Meta as "Bill amount due", NOT the
//   prepaid "Available funds" shown in the Billing UI (community-confirmed
//   mismatch). The Funds value lives in `funding_source_details` (requires
//   MANAGE task permission on the ad account; STORED_BALANCE type = 20).

export function parsePrepaidBalance(fundingSourceDetails) {
  if (fundingSourceDetails == null) return { value: null, status: "unavailable", raw: null };
  const d = fundingSourceDetails;
  const toDollars = (raw) => {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return null;
      return Number.isInteger(raw) ? raw / 100 : raw;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return null;
      // Decimal string ("70.25") = major units; integer string = minor units.
      return /[.,]/.test(trimmed) ? n : n / 100;
    }
    return null;
  };
  // Direct scalar (some API versions return the balance scalar here).
  if (typeof d === "number" || typeof d === "string") {
    const v = toDollars(d);
    return v == null ? { value: null, status: "unavailable", raw: String(d).slice(0, 200) } : { value: v, status: "available", raw: null };
  }
  if (Array.isArray(d)) {
    for (const item of d) {
      const parsed = parsePrepaidBalance(item);
      if (parsed.status === "available") return parsed;
    }
    return { value: null, status: "unavailable", raw: JSON.stringify(d).slice(0, 500) };
  }
  if (typeof d === "object") {
    const candidates = [
      d.balance, d.amount, d.funds, d.available_funds, d.availableFunds,
      d.prepaid_balance, d.prepaidBalance, d.stored_balance, d.storedBalance,
      d.current_balance, d.currentBalance,
    ];
    for (const c of candidates) {
      const v = toDollars(c);
      if (v != null) return { value: v, status: "available", raw: null };
    }
    // Live API shape (v22.0, verified): stored-balance funds arrive as
    // { id, display_string: "Available balance ($1.92 USD)", type: 20 }
    // with no separate numeric field — extract the amount from the string.
    // Display strings are major currency units ("1.92" = $1.92).
    // Guard: ONLY parse funds-type strings (type 20 / STORED_BALANCE or
    // balance|funds|available wording). A card source like
    // { display_string: "VISA *4226", type: 1 } must NEVER parse as $4,226.
    if (typeof d.display_string === "string") {
      const looksLikeFunds =
        d.type === 20 ||
        /balance|funds|available|prepaid|stored/i.test(d.display_string);
      if (looksLikeFunds) {
        const m = d.display_string.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
        if (m) {
          const n = Number(m[1].replace(/,/g, ""));
          if (Number.isFinite(n)) return { value: n, status: "available", raw: null };
        }
      }
    }
    // Nested funding_source object variant.
    if (d.funding_source && typeof d.funding_source === "object") {
      const nested = parsePrepaidBalance(d.funding_source);
      if (nested.status === "available") return nested;
    }
    if (Array.isArray(d.data)) {
      for (const item of d.data) {
        const parsed = parsePrepaidBalance(item);
        if (parsed.status === "available") return parsed;
      }
    }
    return { value: null, status: "unavailable", raw: JSON.stringify(d).slice(0, 500) };
  }
  return { value: null, status: "unavailable", raw: null };
}
