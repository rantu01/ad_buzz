"use client";

import useSSE from "./useSSE";

// Applies granular ad_account.* SSE events directly into a React Query list
// cache (row-level update — no full list refetch, pagination/search/filter
// state preserved). Falls back to invalidate on generic sync/meta events.
export default function useAdAccountRealtime({ uid, queryClient, queryKey, channels = [] }) {
  useSSE({
    uid,
    channels,
    onEvent: (type, data) => {
      if (!queryClient || !queryKey) return;

      if (type === "ad_account.updated") {
        const id = data?.adAccountId;
        const changes = data?.changes || {};
        const account = data?.account || null;
        if (!id) return;
        queryClient.setQueryData(queryKey, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((row) => {
            const rowId = row?.metaAccountId || row?.accountId;
            if (rowId !== id && rowId !== String(id).replace(/^act_/, "") && `act_${String(rowId).replace(/^act_/, "")}` !== id) return row;
            const patched = { ...row, lastSyncedAt: data?.syncedAt || new Date().toISOString() };
            if (account) {
              if (changes.name !== undefined || account.name) {
                patched.name = account.name ?? row.name;
                patched.metaAccountName = account.name ?? row.metaAccountName;
              }
              if (account.currency !== undefined) patched.currency = account.currency;
              if (account.spendCap !== undefined) {
                patched.metaSpendCap = account.spendCap;
                if (patched.spendCap !== undefined && row.metaSpendCap !== undefined) patched.spendCap = account.spendCap;
              }
              if (account.amountSpent !== undefined) {
                patched.metaAmountSpent = account.amountSpent;
                patched.spent = account.amountSpent;
              }
              if (account.balance !== undefined) patched.metaBalance = account.balance;
              if (account.prepaidBalance !== undefined) {
                patched.prepaidBalance = account.prepaidBalance;
                patched.prepaidBalanceStatus = account.prepaidBalanceStatus || "available";
              }
              if (account.isPrepayAccount !== undefined) patched.isPrepayAccount = account.isPrepayAccount;
              if (account.spendCap !== undefined || account.amountSpent !== undefined) {
                const cap = account.spendCap !== undefined ? account.spendCap : patched.metaSpendCap;
                const spent = account.amountSpent !== undefined ? account.amountSpent : patched.metaAmountSpent;
                patched.remainingBalance = typeof cap === "number" && typeof spent === "number" ? cap - spent : patched.remainingBalance ?? null;
                patched.remainingBalanceSource = patched.remainingBalance == null ? "unavailable" : "meta";
              }
              if (account.accountStatus !== undefined) {
                patched.metaStatus = account.accountStatus;
                patched.metaStatusLabel =
                  account.accountStatus === 1 ? "Active"
                  : account.accountStatus === 2 ? "Disabled"
                  : account.accountStatus === 3 ? "Inactive"
                  : account.accountStatus === 7 ? "Pending Risk Review"
                  : account.accountStatus === 8 ? "Pending Settlement"
                  : account.accountStatus === 9 ? "In Grace Period"
                  : account.accountStatus === 100 ? "Pending Closure"
                  : account.accountStatus === 101 ? "Closed"
                  : row.metaStatusLabel || null;
              }
            } else {
              // Fallback: apply raw changed fields when full account missing.
              if (changes.name !== undefined) {
                patched.name = changes.name;
                patched.metaAccountName = changes.name;
              }
              if (changes.spendCap !== undefined) patched.metaSpendCap = changes.spendCap;
              if (changes.amountSpent !== undefined) {
                patched.metaAmountSpent = changes.amountSpent;
                patched.spent = changes.amountSpent;
              }
              if (changes.balance !== undefined) patched.metaBalance = changes.balance;
              if (changes.prepaidBalance !== undefined) {
                patched.prepaidBalance = changes.prepaidBalance;
                patched.prepaidBalanceStatus = "available";
              }
            }
            return patched;
          });
        });
        return;
      }

      if (type === "ad_account.created") {
        const account = data?.account;
        if (!account) {
          queryClient.invalidateQueries({ queryKey });
          return;
        }
        queryClient.setQueryData(queryKey, (old) => {
          if (!Array.isArray(old)) return old;
          const id = account.metaAccountId || data?.adAccountId;
          if (old.some((r) => (r?.metaAccountId || r?.accountId) === id)) return old;
          // Prepend; existing sort/pagination slices re-derive automatically.
          return [{ ...account, _id: account.metaAccountId || `meta-${Date.now()}`, lastSyncedAt: data?.syncedAt || new Date().toISOString() }, ...old];
        });
        return;
      }

      if (type === "ad_account.deleted") {
        const id = data?.adAccountId;
        if (!id) return;
        queryClient.setQueryData(queryKey, (old) => {
          if (!Array.isArray(old)) return old;
          return old.filter((row) => {
            const rowId = row?.metaAccountId || row?.accountId;
            return rowId !== id && `act_${String(rowId).replace(/^act_/, "")}` !== id;
          });
        });
        return;
      }

      if (type === "sync" || type === "meta" || type === "ad-account" || type === "message") {
        // Generic/legacy events: only refetch when the payload is not one of
        // the granular events handled above (prevents full refetch storms).
        if (data?.event && String(data.event).startsWith("ad_account.")) return;
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  return null;
}
