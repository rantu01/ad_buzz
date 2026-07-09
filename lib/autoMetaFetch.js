import { fetchAdAccountsFromBM } from "./metaApiService";
import { saveMetaAdAccounts, createSyncLog, getMetaSettings } from "./metaSettingsModel";

let initialized = false;

function getRandomDelay() {
  return 30000 + Math.random() * 20000;
}

async function runFetch() {
  try {
    const settings = await getMetaSettings();
    if (settings?.accessToken && settings?.businessManagerId) {
      const accounts = await fetchAdAccountsFromBM();
      await saveMetaAdAccounts(accounts);
      await createSyncLog({
        type: "info",
        message: `[Auto-fetch] Fetched ${accounts.length} ad accounts from Meta BM`,
      });
    }
  } catch (err) {
    console.error("[Auto-fetch] Error:", err.message);
  }
}

export function startAutoMetaFetch() {
  if (initialized) return;
  initialized = true;

  const schedule = () => {
    setTimeout(async () => {
      await runFetch();
      schedule();
    }, getRandomDelay());
  };

  runFetch();
  schedule();
}
