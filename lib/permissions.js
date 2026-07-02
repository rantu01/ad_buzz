export const ROLES = {
  ADMIN: "admin",
  TECHNICAL_MANAGER: "technical_manager",
  KEY_MANAGER: "key_manager",
  ACCOUNTS_MANAGER: "accounts_manager",
  SUPPORT_EXECUTIVE: "support_executive",
  CUSTOMER: "customer",
};

export const ROLE_LABELS = {
  admin: "Admin",
  technical_manager: "Technical Manager",
  key_manager: "Key Manager",
  accounts_manager: "Accounts Manager",
  support_executive: "Support Executive",
  customer: "Customer",
};

const PERMISSIONS = {
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

  // ---------- Deposits / Wallet ----------
  VIEW_DEPOSITS: "view_deposits",
  APPROVE_DEPOSITS: "approve_deposits",
  REJECT_DEPOSITS: "reject_deposits",

  // ---------- Withdrawals ----------
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
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),

  [ROLES.TECHNICAL_MANAGER]: [
    PERMISSIONS.VIEW_AD_ACCOUNTS,
    PERMISSIONS.VIEW_AD_INSIGHTS,
    PERMISSIONS.VIEW_TOPUP_RECORDS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.MANAGE_TICKETS,
  ],

  [ROLES.KEY_MANAGER]: [
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
  ],

  [ROLES.ACCOUNTS_MANAGER]: [
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
  ],

  [ROLES.SUPPORT_EXECUTIVE]: [
    PERMISSIONS.VIEW_AD_ACCOUNTS,
    PERMISSIONS.VIEW_AD_INSIGHTS,
    PERMISSIONS.VIEW_TICKETS,
    PERMISSIONS.MANAGE_TICKETS,
  ],

  [ROLES.CUSTOMER]: [],
};

export function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function getAllowedRoutes(role) {
  const routes = [];

  if (hasPermission(role, PERMISSIONS.VIEW_DEPOSITS) || hasPermission(role, PERMISSIONS.APPROVE_DEPOSITS)) {
    routes.push("deposits");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_WITHDRAWALS) || hasPermission(role, PERMISSIONS.APPROVE_WITHDRAWALS)) {
    routes.push("withdrawals");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_AD_ACCOUNTS)) {
    routes.push("ad-accounts");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_USERS) || hasPermission(role, PERMISSIONS.CREATE_USERS)) {
    routes.push("user-management");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_TICKETS) || hasPermission(role, PERMISSIONS.MANAGE_TICKETS)) {
    routes.push("support-tickets");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_PAYMENT_METHODS) || hasPermission(role, PERMISSIONS.MANAGE_PAYMENT_METHODS)) {
    routes.push("payment-methods");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_BALANCE_LOGS)) {
    routes.push("balance-logs");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_REPORTS)) {
    routes.push("reports");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_META_API) || hasPermission(role, PERMISSIONS.MANAGE_META_API)) {
    routes.push("meta-api");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_WHATSAPP) || hasPermission(role, PERMISSIONS.MANAGE_WHATSAPP)) {
    routes.push("whatsapp");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_SETTINGS) || hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)) {
    routes.push("settings");
  }
  if (hasPermission(role, PERMISSIONS.VIEW_TOPUP_INSIGHTS)) {
    routes.push("top-up-insights");
  }

  return routes;
}

export function canAccessRoute(role, route) {
  if (role === ROLES.ADMIN) return true;
  return getAllowedRoutes(role).includes(route);
}

export function isStaffRole(role) {
  return [ROLES.ADMIN, ROLES.TECHNICAL_MANAGER, ROLES.KEY_MANAGER, ROLES.ACCOUNTS_MANAGER, ROLES.SUPPORT_EXECUTIVE].includes(role);
}

const ICONS = {
  overview: "LayoutGrid",
  deposits: "DollarSign",
  withdrawals: "DollarSign",
  "ad-accounts": "Megaphone",
  "user-management": "Users",
  "support-tickets": "LifeBuoy",
  "balance-logs": "History",
  reports: "BarChart3",
  "meta-api": "RefreshCw",
  whatsapp: "MessageSquare",
  settings: "Settings",
  "top-up-insights": "TrendingUp",
};

export function getNavItemsForRole(role) {
  const routes = getAllowedRoutes(role);
  const allItems = [
    { label: "Overview", href: "/admin", key: "overview" },
    { label: "Deposit Verification", href: "/admin/deposits", key: "deposits" },
    { label: "Withdrawals", href: "/admin/withdrawals", key: "withdrawals" },
    { label: "Ad Accounts", href: "/admin/ad-accounts", key: "ad-accounts" },
    { label: "User Management", href: "/admin/user-management", key: "user-management" },
    { label: "Support Tickets", href: "/admin/support-tickets", key: "support-tickets" },
    { label: "Balance Logs", href: "/admin/balance-logs", key: "balance-logs" },
    { label: "Top-Up Insights", href: "/admin/top-up-insights", key: "top-up-insights" },
    { label: "Reports", href: "/admin/reports", key: "reports" },
    { label: "Meta API", href: "/admin/meta-api", key: "meta-api" },
    { label: "WhatsApp", href: "/admin/whatsapp", key: "whatsapp" },
    { label: "Settings", href: "/admin/settings", key: "settings" },
  ];

  return allItems
    .filter((item) => item.key === "overview" || item.key === "settings" ? true : routes.includes(item.key))
    .map((item) => ({
      ...item,
      icon: ICONS[item.key] || "LayoutGrid",
    }));
}
