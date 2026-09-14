// Seeds the shared `roles` collection (MongoDB `ad_buzz`) with the canonical
// system roles. Safe to re-run: existing roles are NEVER overwritten — only
// missing keys are inserted ($setOnInsert). Both Level 1 (ad-buzz) and
// Level 2 (adsbuzz-ui-next) read this same collection.
//
// Usage: node scripts/seed-roles.js
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// Inline .env parsing (same pattern as scripts/resetCounter.js)
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const PERMISSIONS = {
  VIEW_AD_ACCOUNTS: "view_ad_accounts",
  MANAGE_AD_ACCOUNTS: "manage_ad_accounts",
  ASSIGN_AD_ACCOUNTS: "assign_ad_accounts",
  VIEW_AD_INSIGHTS: "view_ad_insights",
  VIEW_TOPUP_INSIGHTS: "view_topup_insights",
  VIEW_TOPUP_RECORDS: "view_topup_records",
  VIEW_USERS: "view_users",
  CREATE_USERS: "create_users",
  MANAGE_USER_ROLES: "manage_user_roles",
  MANAGE_USER_BALANCE: "manage_user_balance",
  VIEW_ROLES: "view_roles",
  MANAGE_ROLES: "manage_roles",
  VIEW_DEPOSITS: "view_deposits",
  APPROVE_DEPOSITS: "approve_deposits",
  REJECT_DEPOSITS: "reject_deposits",
  VIEW_WITHDRAWALS: "view_withdrawals",
  APPROVE_WITHDRAWALS: "approve_withdrawals",
  REJECT_WITHDRAWALS: "reject_withdrawals",
  VIEW_TICKETS: "view_tickets",
  MANAGE_TICKETS: "manage_tickets",
  VIEW_BALANCE_LOGS: "view_balance_logs",
  VIEW_REPORTS: "view_reports",
  VIEW_PAYMENT_METHODS: "view_payment_methods",
  MANAGE_PAYMENT_METHODS: "manage_payment_methods",
  VIEW_SETTINGS: "view_settings",
  MANAGE_SETTINGS: "manage_settings",
  VIEW_META_API: "view_meta_api",
  MANAGE_META_API: "manage_meta_api",
  VIEW_WHATSAPP: "view_whatsapp",
  MANAGE_WHATSAPP: "manage_whatsapp",
  UNLIMITED_BALANCE: "unlimited_balance",
  VIEW_AD_ACCOUNTS_TOPUP: "view_ad_accounts_topup",
};

const ALL_PERMS = Object.values(PERMISSIONS);
const ALL_L2 = [
  "/", "/customers", "/invoices", "/sales", "/sale-setup", "/topups", "/refund",
  "/ad-accounts", "/series", "/cards", "/platforms", "/wallets", "/vendors",
  "/reports", "/insights", "/office-expense", "/office-expense/entry",
  "/office-expense/wallet", "/office-expense/settings", "/settings",
];
const OPS_PERMS = [
  PERMISSIONS.VIEW_AD_ACCOUNTS, PERMISSIONS.MANAGE_AD_ACCOUNTS, PERMISSIONS.ASSIGN_AD_ACCOUNTS,
  PERMISSIONS.VIEW_AD_INSIGHTS, PERMISSIONS.VIEW_TOPUP_INSIGHTS, PERMISSIONS.VIEW_TOPUP_RECORDS,
  PERMISSIONS.VIEW_USERS, PERMISSIONS.CREATE_USERS, PERMISSIONS.MANAGE_USER_BALANCE,
  PERMISSIONS.VIEW_DEPOSITS, PERMISSIONS.APPROVE_DEPOSITS, PERMISSIONS.REJECT_DEPOSITS,
  PERMISSIONS.VIEW_WITHDRAWALS, PERMISSIONS.APPROVE_WITHDRAWALS, PERMISSIONS.REJECT_WITHDRAWALS,
  PERMISSIONS.VIEW_PAYMENT_METHODS, PERMISSIONS.MANAGE_PAYMENT_METHODS, PERMISSIONS.VIEW_BALANCE_LOGS,
  PERMISSIONS.VIEW_TICKETS, PERMISSIONS.MANAGE_TICKETS, PERMISSIONS.UNLIMITED_BALANCE,
  PERMISSIONS.VIEW_AD_ACCOUNTS_TOPUP,
];
const OPS_L2 = [
  "/", "/customers", "/sales", "/sale-setup", "/topups", "/refund", "/ad-accounts",
  "/series", "/cards", "/platforms", "/wallets", "/vendors", "/invoices",
  "/reports", "/insights", "/office-expense", "/office-expense/entry", "/office-expense/wallet",
];

const DEFAULTS = [
  { key: "admin", name: "Admin", label: "Admin", description: "Full access to every Level 1 module and every Level 2 page.", permissions: ALL_PERMS, level2Routes: ALL_L2, isSystem: true },
  { key: "director", name: "Director", label: "Director", description: "Executive oversight — full operational access and approvals.", permissions: ALL_PERMS, level2Routes: ALL_L2, isSystem: true },
  { key: "hr", name: "HR", label: "HR", description: "People management — users, roles visibility, tickets and reports.", permissions: [PERMISSIONS.VIEW_USERS, PERMISSIONS.CREATE_USERS, PERMISSIONS.MANAGE_USER_ROLES, PERMISSIONS.VIEW_ROLES, PERMISSIONS.VIEW_TICKETS, PERMISSIONS.MANAGE_TICKETS, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AD_ACCOUNTS, PERMISSIONS.VIEW_AD_INSIGHTS], level2Routes: ["/", "/customers", "/reports", "/insights", "/invoices"], isSystem: true },
  { key: "key_manager", name: "Key Manager", label: "Key Manager", description: "Day-to-day operations — accounts, deposits, users and balances.", permissions: OPS_PERMS, level2Routes: OPS_L2, isSystem: true },
  { key: "accounts_manager", name: "Accounts Manager", label: "Accounts Manager", description: "Money operations — deposits, withdrawals, balances and expenses.", permissions: OPS_PERMS, level2Routes: OPS_L2, isSystem: true },
  { key: "approval_manager", name: "Approval Manager", label: "Approval Manager", description: "Final approvals — deposits, withdrawals, top-ups and refunds.", permissions: [PERMISSIONS.VIEW_USERS, PERMISSIONS.VIEW_AD_ACCOUNTS, PERMISSIONS.VIEW_AD_INSIGHTS, PERMISSIONS.VIEW_TOPUP_INSIGHTS, PERMISSIONS.VIEW_TOPUP_RECORDS, PERMISSIONS.VIEW_DEPOSITS, PERMISSIONS.APPROVE_DEPOSITS, PERMISSIONS.REJECT_DEPOSITS, PERMISSIONS.VIEW_WITHDRAWALS, PERMISSIONS.APPROVE_WITHDRAWALS, PERMISSIONS.REJECT_WITHDRAWALS, PERMISSIONS.VIEW_BALANCE_LOGS, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_TICKETS, PERMISSIONS.VIEW_AD_ACCOUNTS_TOPUP], level2Routes: ["/", "/topups", "/refund", "/invoices", "/reports", "/insights", "/customers", "/office-expense", "/office-expense/entry", "/office-expense/wallet"], isSystem: true },
  { key: "support_executive", name: "Support Executive", label: "Support Executive", description: "Customer support — read-only accounts plus ticket handling.", permissions: [PERMISSIONS.VIEW_AD_ACCOUNTS, PERMISSIONS.VIEW_AD_INSIGHTS, PERMISSIONS.VIEW_TICKETS, PERMISSIONS.MANAGE_TICKETS, PERMISSIONS.VIEW_TOPUP_RECORDS], level2Routes: ["/", "/customers", "/ad-accounts", "/series", "/cards", "/invoices", "/vendors", "/topups"], isSystem: true },
  { key: "technical_manager", name: "Technical Manager", label: "Technical Manager", description: "Legacy technical role — kept for backward compatibility.", permissions: [PERMISSIONS.VIEW_AD_ACCOUNTS, PERMISSIONS.VIEW_AD_INSIGHTS, PERMISSIONS.VIEW_TOPUP_RECORDS, PERMISSIONS.VIEW_TICKETS, PERMISSIONS.MANAGE_TICKETS], level2Routes: ["/", "/ad-accounts", "/insights", "/topups"], isSystem: false },
  { key: "customer", name: "Customer", label: "Customer", description: "Default role for self-registered users — no staff access.", permissions: [], level2Routes: null, isSystem: false },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || "ad_buzz";
  if (!uri) throw new Error("MONGODB_URI is not set.");
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection("roles");

  const now = new Date();
  let inserted = 0;
  let kept = 0;
  for (const def of DEFAULTS) {
    const res = await col.updateOne(
      { key: def.key },
      {
        $setOnInsert: {
          key: def.key,
          name: def.name,
          label: def.label,
          description: def.description,
          permissions: def.permissions,
          level2Routes: def.level2Routes,
          isSystem: def.isSystem,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      inserted += 1;
      console.log(`+ inserted role: ${def.key}`);
    } else {
      kept += 1;
      console.log(`= kept existing role: ${def.key}`);
    }
  }
  await col.createIndex({ key: 1 }, { unique: true }).catch(() => {});
  const total = await col.countDocuments();
  console.log(`\nDone. inserted=${inserted} kept=${kept} total=${total} (db=${dbName})`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
