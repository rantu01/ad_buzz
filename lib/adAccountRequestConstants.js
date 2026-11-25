// Shared, server-safe constants and validation for Ad Account Requests.
// Kept free of DB/Next imports so the exact same rules can be unit tested and
// reused by both API routes and client-side form validation.

export const REQUEST_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "more_info_required",
];

export const STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  more_info_required: "More Information Required",
};

// Status badge colours, shared by the customer and admin tables.
export const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  more_info_required: "bg-violet-50 text-violet-700 border-violet-200",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.pending;
}

export function isValidStatus(status) {
  return REQUEST_STATUSES.includes(status);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

// URL validation for the "Website / Page Link" field. Accepts standard
// http(s) URLs (including social media page links); a bare host such as
// "facebook.com/page" is prefixed with https:// so genuine links are not
// rejected over a missing scheme.
export function normalizeWebsiteLink(value) {
  let text = clean(value);
  if (!text) return null;
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(text)) text = `https://${text}`;
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Validate and normalise a customer submission.
 * Returns { ok, errors: { field: message }, value }.
 * `value` only contains fields that are safe to persist.
 */
export function validateRequestPayload(payload) {
  const errors = {};
  const src = payload && typeof payload === "object" ? payload : {};

  const platform = clean(src.platform);
  if (!platform) errors.platform = "Please select a platform.";
  else if (platform.length > 120) errors.platform = "Platform name is too long.";

  const adAccountName = clean(src.adAccountName);
  if (!adAccountName) errors.adAccountName = "Ad account name is required.";
  else if (adAccountName.length > 200) errors.adAccountName = "Ad account name must be 200 characters or fewer.";

  const budgetRaw = src.monthlyBudget;
  const monthlyBudget = Number(budgetRaw);
  if (budgetRaw === "" || budgetRaw === null || budgetRaw === undefined || !Number.isFinite(monthlyBudget)) {
    errors.monthlyBudget = "Enter a valid monthly budget.";
  } else if (monthlyBudget <= 0) {
    errors.monthlyBudget = "Monthly budget must be greater than 0.";
  } else if (monthlyBudget > 1000000000) {
    errors.monthlyBudget = "Monthly budget is too large.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(budgetRaw).trim())) {
    errors.monthlyBudget = "Use at most 2 decimal places.";
  }

  const product = clean(src.product);
  if (!product) errors.product = "Product or service is required.";
  else if (product.length > 300) errors.product = "Product must be 300 characters or fewer.";

  // Stored exactly as entered: no case/format transformations.
  const businessManagerId = typeof src.businessManagerId === "string" ? src.businessManagerId : "";
  if (!businessManagerId.trim()) errors.businessManagerId = "Business Manager ID is required.";
  else if (businessManagerId.length > 100) errors.businessManagerId = "Business Manager ID must be 100 characters or fewer.";

  const websitePageLink = normalizeWebsiteLink(src.websitePageLink);
  if (!websitePageLink) errors.websitePageLink = "Enter a valid website or page URL.";
  else if (websitePageLink.length > 2000) errors.websitePageLink = "Link is too long.";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      platform,
      adAccountName,
      monthlyBudget: Number.isFinite(monthlyBudget) ? Math.round(monthlyBudget * 100) / 100 : null,
      product,
      businessManagerId,
      websitePageLink,
    },
  };
}

export function validateAdminAction(body) {
  const src = body && typeof body === "object" ? body : {};
  const action = clean(src.action);
  const errors = {};
  let status = null;
  let note = "";
  let reason = "";

  if (action === "approve") status = "approved";
  else if (action === "reject") status = "rejected";
  else if (action === "more_info") status = "more_info_required";
  else if (action === "status") status = clean(src.status);
  else errors.action = "Invalid action.";

  if (status && !isValidStatus(status)) errors.status = "Invalid status.";

  reason = clean(src.reason);
  // A rejection always carries a reason, including when an admin reaches
  // that status through the generic status-change control.
  if (status === "rejected") {
    if (!reason) errors.reason = "A rejection reason is required.";
    else if (reason.length > 2000) errors.reason = "Reason must be 2000 characters or fewer.";
  }
  if (status === "more_info_required") {
    note = clean(src.note);
    if (!note) errors.note = "Describe what additional information is needed.";
    else if (note.length > 2000) errors.note = "Message must be 2000 characters or fewer.";
  }
  if (action === "approve" || action === "status") {
    note = clean(src.note);
    if (note.length > 2000) errors.note = "Note must be 2000 characters or fewer.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { action, status, note, reason },
  };
}

export function validateCustomerInfo(payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const text = clean(src.message);
  if (!text) return { ok: false, errors: { message: "Enter the requested information." }, value: null };
  if (text.length > 2000) return { ok: false, errors: { message: "Message must be 2000 characters or fewer." }, value: null };
  return { ok: true, errors: {}, value: { message: text } };
}
