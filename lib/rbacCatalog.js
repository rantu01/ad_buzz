// Central RBAC catalog — shared source of truth for Level 1 (ad-buzz) and
// Level 2 (adsbuzz-ui-next). Both projects read role documents from the SAME
// MongoDB `roles` collection (shared `ad_buzz` database), so any change saved
// from the Level 1 admin panel is enforced on Level 2 automatically.
//
// Role document shape in MongoDB:
// {
//   key: "admin",               // unique slug, e.g. "key_manager"
//   name: "Admin",              // display name
//   label: "Admin",             // short label shown in tables/pills
//   description: "...",
//   permissions: ["view_users", ...],  // Level 1 granular permissions
//   level2Routes: ["/", "/customers", ...], // Level 2 page access (null = unrestricted legacy)
//   isSystem: true,             // system roles cannot be deleted, only edited
//   createdAt, updatedAt
// }

export const ROLES = {
  ADMIN: "admin",
  DIRECTOR: "director",
  HR: "hr",
  KEY_MANAGER: "key_manager",
  ACCOUNTS_MANAGER: "accounts_manager",
  APPROVAL_MANAGER: "approval_manager",
  SUPPORT_EXECUTIVE: "support_executive",
  TECHNICAL_MANAGER: "technical_manager", // legacy — kept for backward compatibility
  CUSTOMER: "customer",
};

export const ROLE_LABELS = {
  admin: "Admin",
  director: "Director",
  hr: "HR",
  key_manager: "Key Manager",
  accounts_manager: "Accounts Manager",
  approval_manager: "Approval Manager",
  support_executive: "Support Executive",
  technical_manager: "Technical Manager",
  customer: "Customer",
};

export const STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.DIRECTOR,
  ROLES.HR,
  ROLES.KEY_MANAGER,
  ROLES.ACCOUNTS_MANAGER,
  ROLES.APPROVAL_MANAGER,
  ROLES.SUPPORT_EXECUTIVE,
  ROLES.TECHNICAL_MANAGER,
];

// The 7 required system roles for the Role Management dashboard.
export const SYSTEM_ROLE_KEYS = [
  ROLES.ADMIN,
  ROLES.DIRECTOR,
  ROLES.HR,
  ROLES.KEY_MANAGER,
  ROLES.ACCOUNTS_MANAGER,
  ROLES.APPROVAL_MANAGER,
  ROLES.SUPPORT_EXECUTIVE,
];

export const PERMISSIONS = {
  // ---------- Ad Accounts ----------
  VIEW_AD_ACCOUNTS: "view_ad_accounts",
  MANAGE_AD_ACCOUNTS: "manage_ad_accounts",
  ASSIGN_AD_ACCOUNTS: "assign_ad_accounts",
  VIEW_AD_INSIGHTS: "view_ad_insights",
  VIEW_TOPUP_INSIGHTS: "view_topup_insights",
  VIEW_TOPUP_RECORDS: "view_topup_records",

  // ---------- Users ----------
  VIEW_USERS: "view_users",
  CREATE_USERS: "create_users",
  MANAGE_USER_ROLES: "manage_user_roles",
  MANAGE_USER_BALANCE: "manage_user_balance",

  // ---------- Roles ----------
  VIEW_ROLES: "view_roles",
  MANAGE_ROLES: "manage_roles",

  // ---------- Deposits / Withdrawals ----------
  VIEW_DEPOSITS: "view_deposits",
  APPROVE_DEPOSITS: "approve_deposits",
  REJECT_DEPOSITS: "reject_deposits",
  VIEW_WITHDRAWALS: "view_withdrawals",
  APPROVE_WITHDRAWALS: "approve_withdrawals",
  REJECT_WITHDRAWALS: "reject_withdrawals",

  // ---------- Support Tickets ----------
  VIEW_TICKETS: "view_tickets",
  MANAGE_TICKETS: "manage_tickets",

  // ---------- Balance Logs ----------
  VIEW_BALANCE_LOGS: "view_balance_logs",

  // ---------- Reports ----------
  VIEW_REPORTS: "view_reports",

  // ---------- Payment Methods ----------
  VIEW_PAYMENT_METHODS: "view_payment_methods",
  MANAGE_PAYMENT_METHODS: "manage_payment_methods",

  // ---------- Settings ----------
  VIEW_SETTINGS: "view_settings",
  MANAGE_SETTINGS: "manage_settings",

  // ---------- Meta API ----------
  VIEW_META_API: "view_meta_api",
  MANAGE_META_API: "manage_meta_api",

  // ---------- WhatsApp ----------
  VIEW_WHATSAPP: "view_whatsapp",
  MANAGE_WHATSAPP: "manage_whatsapp",

  // ---------- Unlimited Balance ----------
  UNLIMITED_BALANCE: "unlimited_balance",

  // ---------- Ad Accounts TopUp ----------
  VIEW_AD_ACCOUNTS_TOPUP: "view_ad_accounts_topup",
};

// Horizontal module/add-on tabs shown on the Edit Role screen.
export const PERMISSION_GROUPS = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [
      { key: "view_ad_insights", label: "View Ad Insights" },
      { key: "view_topup_insights", label: "View Top-Up Insights" },
      { key: "view_topup_records", label: "View Top-Up Records" },
      { key: "view_reports", label: "View Reports" },
    ],
  },
  {
    key: "users",
    label: "Users",
    permissions: [
      { key: "view_users", label: "View Users" },
      { key: "create_users", label: "Create Users" },
      { key: "manage_user_roles", label: "Manage User Roles" },
      { key: "manage_user_balance", label: "Manage User Balance" },
    ],
  },
  {
    key: "roles",
    label: "Roles",
    permissions: [
      { key: "view_roles", label: "View Roles" },
      { key: "manage_roles", label: "Manage Roles & Permissions" },
    ],
  },
  {
    key: "ad_accounts",
    label: "Ad Accounts",
    permissions: [
      { key: "view_ad_accounts", label: "View Ad Accounts" },
      { key: "manage_ad_accounts", label: "Manage Ad Accounts" },
      { key: "assign_ad_accounts", label: "Assign Ad Accounts" },
      { key: "view_ad_accounts_topup", label: "View Ad Accounts Top-Up" },
      { key: "unlimited_balance", label: "Unlimited Balance Top-Up" },
    ],
  },
  {
    key: "deposits",
    label: "Deposits & Wallet",
    permissions: [
      { key: "view_deposits", label: "View Deposits" },
      { key: "approve_deposits", label: "Approve Deposits" },
      { key: "reject_deposits", label: "Reject Deposits" },
      { key: "view_withdrawals", label: "View Withdrawals" },
      { key: "approve_withdrawals", label: "Approve Withdrawals" },
      { key: "reject_withdrawals", label: "Reject Withdrawals" },
    ],
  },
  {
    key: "tickets",
    label: "Support Tickets",
    permissions: [
      { key: "view_tickets", label: "View Tickets" },
      { key: "manage_tickets", label: "Manage Tickets" },
    ],
  },
  {
    key: "finance",
    label: "Finance & Reports",
    permissions: [
      { key: "view_balance_logs", label: "View Balance Logs" },
      { key: "view_payment_methods", label: "View Payment Methods" },
      { key: "manage_payment_methods", label: "Manage Payment Methods" },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    permissions: [
      { key: "view_meta_api", label: "View Meta API" },
      { key: "manage_meta_api", label: "Manage Meta API" },
      { key: "view_whatsapp", label: "View WhatsApp" },
      { key: "manage_whatsapp", label: "Manage WhatsApp" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    permissions: [
      { key: "view_settings", label: "View Settings" },
      { key: "manage_settings", label: "Manage Settings" },
    ],
  },
];

// Every routable page of Level 2 (adsbuzz-ui-next), grouped for the
// "Level 2 Page Access" section of the Edit Role screen.
export const LEVEL2_ROUTE_GROUPS = [
  {
    key: "core",
    label: "Core",
    routes: [
      { path: "/", label: "Dashboard" },
      { path: "/customers", label: "Customers (CRM Hub)" },
      { path: "/invoices", label: "Invoices" },
    ],
  },
  {
    key: "sales",
    label: "Sales (POS)",
    routes: [
      { path: "/sales", label: "Sales Entry" },
      { path: "/sale-setup", label: "Sale Setup" },
      { path: "/topups", label: "Topups Audit" },
      { path: "/refund", label: "Refund" },
    ],
  },
  {
    key: "inventory",
    label: "Accounts & Inventory",
    routes: [
      { path: "/ad-accounts", label: "Ad Accounts" },
      { path: "/series", label: "Series" },
      { path: "/cards", label: "Cards" },
      { path: "/platforms", label: "Platform" },
      { path: "/wallets", label: "Wallets" },
      { path: "/vendors", label: "Vendors" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    routes: [
      { path: "/reports", label: "Reports" },
      { path: "/insights", label: "Insights" },
    ],
  },
  {
    key: "office",
    label: "Office Expense (LMS add-on)",
    routes: [
      { path: "/office-expense", label: "Office Expense Dashboard" },
      { path: "/office-expense/entry", label: "Monthly Data Entry" },
      { path: "/office-expense/wallet", label: "Office Wallet" },
      { path: "/office-expense/settings", label: "Office Expense Settings" },
    ],
  },
  {
    key: "system",
    label: "System",
    routes: [{ path: "/settings", label: "Settings" }],
  },
];

export const LEVEL2_ROUTES = LEVEL2_ROUTE_GROUPS.flatMap((g) =>
  g.routes.map((r) => ({ ...r, group: g.label }))
);

const ALL_PERMS = Object.values(PERMISSIONS);
const ALL_L2 = LEVEL2_ROUTES.map((r) => r.path);

const OPS_PERMS = [
  PERMISSIONS.VIEW_AD_ACCOUNTS,
  PERMISSIONS.MANAGE_AD_ACCOUNTS,
  PERMISSIONS.ASSIGN_AD_ACCOUNTS,
  PERMISSIONS.VIEW_AD_INSIGHTS,
  PERMISSIONS.VIEW_TOPUP_INSIGHTS,
  PERMISSIONS.VIEW_TOPUP_RECORDS,
  PERMISSIONS.VIEW_USERS,
  PERMISSIONS.CREATE_USERS,
  PERMISSIONS.MANAGE_USER_BALANCE,
  PERMISSIONS.VIEW_DEPOSITS,
  PERMISSIONS.APPROVE_DEPOSITS,
  PERMISSIONS.REJECT_DEPOSITS,
  PERMISSIONS.VIEW_WITHDRAWALS,
  PERMISSIONS.APPROVE_WITHDRAWALS,
  PERMISSIONS.REJECT_WITHDRAWALS,
  PERMISSIONS.VIEW_PAYMENT_METHODS,
  PERMISSIONS.MANAGE_PAYMENT_METHODS,
  PERMISSIONS.VIEW_BALANCE_LOGS,
  PERMISSIONS.VIEW_TICKETS,
  PERMISSIONS.MANAGE_TICKETS,
  PERMISSIONS.UNLIMITED_BALANCE,
  PERMISSIONS.VIEW_AD_ACCOUNTS_TOPUP,
];

const OPS_L2 = [
  "/",
  "/customers",
  "/sales",
  "/sale-setup",
  "/topups",
  "/refund",
  "/ad-accounts",
  "/series",
  "/cards",
  "/platforms",
  "/wallets",
  "/vendors",
  "/invoices",
  "/reports",
  "/insights",
  "/office-expense",
  "/office-expense/entry",
  "/office-expense/wallet",
];

// Default seed for every role. `level2Routes: null` means unrestricted
// (legacy behaviour); an array means strictly enforced page access.
export const SYSTEM_ROLE_DEFAULTS = [
  {
    key: "admin",
    name: "Admin",
    label: "Admin",
    description: "Full access to every Level 1 module and every Level 2 page.",
    permissions: ALL_PERMS,
    level2Routes: ALL_L2,
    isSystem: true,
  },
  {
    key: "director",
    name: "Director",
    label: "Director",
    description: "Executive oversight — full operational access and approvals.",
    permissions: ALL_PERMS,
    level2Routes: ALL_L2,
    isSystem: true,
  },
  {
    key: "hr",
    name: "HR",
    label: "HR",
    description: "People management — users, roles visibility, tickets and reports.",
    permissions: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.MANAGE_USER_ROLES,
      PERMISSIONS.VIEW_ROLES,
      PERMISSIONS.VIEW_TICKETS,
      PERMISSIONS.MANAGE_TICKETS,
      PERMISSIONS.VIEW_REPORTS,
      PERMISSIONS.VIEW_AD_ACCOUNTS,
      PERMISSIONS.VIEW_AD_INSIGHTS,
    ],
    level2Routes: ["/", "/customers", "/reports", "/insights", "/invoices"],
    isSystem: true,
  },
  {
    key: "key_manager",
    name: "Key Manager",
    label: "Key Manager",
    description: "Day-to-day operations — accounts, deposits, users and balances.",
    permissions: OPS_PERMS,
    level2Routes: OPS_L2,
    isSystem: true,
  },
  {
    key: "accounts_manager",
    name: "Accounts Manager",
    label: "Accounts Manager",
    description: "Money operations — deposits, withdrawals, balances and expenses.",
    permissions: OPS_PERMS,
    level2Routes: OPS_L2,
    isSystem: true,
  },
  {
    key: "approval_manager",
    name: "Approval Manager",
    label: "Approval Manager",
    description: "Final approvals — deposits, withdrawals, top-ups and refunds.",
    permissions: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.VIEW_AD_ACCOUNTS,
      PERMISSIONS.VIEW_AD_INSIGHTS,
      PERMISSIONS.VIEW_TOPUP_INSIGHTS,
      PERMISSIONS.VIEW_TOPUP_RECORDS,
      PERMISSIONS.VIEW_DEPOSITS,
      PERMISSIONS.APPROVE_DEPOSITS,
      PERMISSIONS.REJECT_DEPOSITS,
      PERMISSIONS.VIEW_WITHDRAWALS,
      PERMISSIONS.APPROVE_WITHDRAWALS,
      PERMISSIONS.REJECT_WITHDRAWALS,
      PERMISSIONS.VIEW_BALANCE_LOGS,
      PERMISSIONS.VIEW_REPORTS,
      PERMISSIONS.VIEW_TICKETS,
      PERMISSIONS.VIEW_AD_ACCOUNTS_TOPUP,
    ],
    level2Routes: [
      "/",
      "/topups",
      "/refund",
      "/invoices",
      "/reports",
      "/insights",
      "/customers",
      "/office-expense",
      "/office-expense/entry",
      "/office-expense/wallet",
    ],
    isSystem: true,
  },
  {
    key: "support_executive",
    name: "Support Executive",
    label: "Support Executive",
    description: "Customer support — read-only accounts plus ticket handling.",
    permissions: [
      PERMISSIONS.VIEW_AD_ACCOUNTS,
      PERMISSIONS.VIEW_AD_INSIGHTS,
      PERMISSIONS.VIEW_TICKETS,
      PERMISSIONS.MANAGE_TICKETS,
      PERMISSIONS.VIEW_TOPUP_RECORDS,
    ],
    level2Routes: ["/", "/customers", "/ad-accounts", "/series", "/cards", "/invoices", "/vendors", "/topups"],
    isSystem: true,
  },
  {
    key: "technical_manager",
    name: "Technical Manager",
    label: "Technical Manager",
    description: "Legacy technical role — kept for backward compatibility.",
    permissions: [
      PERMISSIONS.VIEW_AD_ACCOUNTS,
      PERMISSIONS.VIEW_AD_INSIGHTS,
      PERMISSIONS.VIEW_TOPUP_RECORDS,
      PERMISSIONS.VIEW_TICKETS,
      PERMISSIONS.MANAGE_TICKETS,
    ],
    level2Routes: ["/", "/ad-accounts", "/insights", "/topups"],
    isSystem: false,
  },
  {
    key: "customer",
    name: "Customer",
    label: "Customer",
    description: "Default role for self-registered users — no staff access.",
    permissions: [],
    level2Routes: null,
    isSystem: false,
  },
];

export function getRoleDefault(key) {
  return SYSTEM_ROLE_DEFAULTS.find((r) => r.key === key) || null;
}

export function isValidPermission(permission) {
  return ALL_PERMS.includes(permission);
}

export function isValidLevel2Route(path) {
  return ALL_L2.includes(path);
}

export function roleLabel(key) {
  return ROLE_LABELS[key] || key || "Customer";
}
