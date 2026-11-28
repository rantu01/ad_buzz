// Shared constants + validation for the Ads Buzz Notice & Announcement system.
//
// This module is imported by BOTH the admin API routes and the customer API
// routes (and by client components for labels), so it must stay dependency-
// free except for the existing sanitizeHtml helper.

import { sanitizeHtml } from "./sanitizeHtml.js";

// Official company identity for every notice surface. The reference
// screenshots used a different brand — notices are always signed "Ads Buzz".
export const COMPANY_NAME = "Ads Buzz";

export const NOTICE_TYPES = [
  "General Announcement",
  "Important Notice",
  "Account Rate Change",
  "Package Update",
  "Commission Update",
  "Policy Update",
  "Maintenance Notice",
  "Account-Related Notice",
  "Custom Notice",
];

export const NOTICE_PRIORITIES = [
  { value: "normal", label: "Normal", rank: 1 },
  { value: "high", label: "High", rank: 2 },
  { value: "urgent", label: "Urgent", rank: 3 },
];

export const NOTICE_STATUSES = ["draft", "scheduled", "published", "archived", "deleted"];
export const AUDIENCE_TYPES = ["all", "individual"];

// The structured-change format is shared by rate / package / commission /
// policy notices. Labels are chosen by the renderer from `changeKind`.
export const CHANGE_KINDS = ["rate", "package", "commission", "policy", "general"];

export const CHANGE_KIND_LABELS = {
  rate: "Account Rate Changes",
  package: "Package Changes",
  commission: "Commission Changes",
  policy: "Policy Changes",
  general: "Changes",
};

export function priorityRank(priority) {
  const found = NOTICE_PRIORITIES.find((p) => p.value === priority);
  return found ? found.rank : 1;
}

export function formatNoticeDate(value, withTime = false) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  if (!withTime) return day;
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return `${day}, ${time}`;
}

export function isNoticeType(value) {
  return NOTICE_TYPES.includes(value);
}

export function isChangeKind(value) {
  return CHANGE_KINDS.includes(value);
}

// Sanitize the rich-text body and make external links safe. The base helper is
// deliberately shared with the Help Center; the anchor rewrite is notice-only.
export function sanitizeNoticeHtml(html) {
  const cleaned = sanitizeHtml(html || "");
  return String(cleaned).replace(/<a\s([^>]*)>/gi, (match, attrs) => {
    if (/\brel\s*=/i.test(attrs)) return match;
    return `<a ${attrs} rel="noopener noreferrer">`;
  });
}

function cleanString(value, max = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// Validate + normalize every field accepted from an admin request. The result
// contains Date objects (ready to store) and never trusts client-side flags.
export function validateNoticeInput(input = {}) {
  const errors = {};
  const title = cleanString(input.title, 200);
  if (title.length < 3) errors.title = "Notice title must be at least 3 characters.";

  const rawMessage = typeof input.message === "string" ? input.message : "";
  const message = sanitizeNoticeHtml(rawMessage);
  const plainText = message.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!plainText) errors.message = "Notice message is required.";
  if (message.length > 200000) errors.message = "Notice message is too long.";

  const type = cleanString(input.type, 80) || "General Announcement";
  if (!isNoticeType(type)) errors.type = "Invalid notice type.";

  const priority = NOTICE_PRIORITIES.some((p) => p.value === input.priority) ? input.priority : "normal";
  const audienceType = AUDIENCE_TYPES.includes(input.audienceType) ? input.audienceType : "all";

  const targetCustomerIds = Array.isArray(input.targetCustomerIds)
    ? [...new Set(input.targetCustomerIds.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))].slice(0, 10000)
    : [];
  if (audienceType === "individual" && targetCustomerIds.length === 0) {
    errors.targetCustomerIds = "Select at least one customer for an individual notice.";
  }

  const changeKind = isChangeKind(input.changeKind) ? input.changeKind : "general";
  const structuredChanges = [];
  if (Array.isArray(input.structuredChanges)) {
    for (const raw of input.structuredChanges.slice(0, 200)) {
      if (!raw || typeof raw !== "object") continue;
      const entry = {
        accountName: cleanString(raw.accountName, 200),
        identifier: cleanString(raw.identifier, 80),
        previousRate: cleanString(raw.previousRate, 80),
        newRate: cleanString(raw.newRate, 80),
        rateUnit: cleanString(raw.rateUnit, 20) || "৳",
      };
      if (!entry.accountName && !entry.newRate) continue;
      structuredChanges.push(entry);
    }
  }

  const status = ["draft", "scheduled", "published"].includes(input.status) ? input.status : "draft";
  const effectiveAt = parseDate(input.effectiveAt);
  const expiresAt = parseDate(input.expiresAt);
  const scheduledAt = parseDate(input.scheduledAt);
  if (input.effectiveAt && !effectiveAt) errors.effectiveAt = "Invalid effective date.";
  if (input.expiresAt && !expiresAt) errors.expiresAt = "Invalid expiry date.";
  if (input.scheduledAt && !scheduledAt) errors.scheduledAt = "Invalid schedule date.";
  if (effectiveAt && expiresAt && expiresAt <= effectiveAt) {
    errors.expiresAt = "Expiry date must be after the effective date.";
  }
  if (status === "scheduled" && !scheduledAt) {
    errors.scheduledAt = "Choose a publish date and time for a scheduled notice.";
  }
  if (status === "published" && expiresAt && expiresAt <= new Date()) {
    errors.expiresAt = "A published notice cannot already be expired.";
  }

  const requireAcknowledgement = Boolean(input.requireAcknowledgement);

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      title,
      message,
      type,
      priority,
      priorityRank: priorityRank(priority),
      audienceType,
      targetCustomerIds: audienceType === "all" ? [] : targetCustomerIds,
      changeKind: structuredChanges.length > 0 ? changeKind : null,
      structuredChanges,
      status,
      effectiveAt,
      expiresAt,
      scheduledAt: status === "scheduled" ? scheduledAt : null,
      requireAcknowledgement,
      publishedAt: status === "published" ? new Date() : null,
    },
  };
}

// Fields a published notice may still change. Content, audience and dates that
// customers may already have acknowledged are intentionally immutable.
export const SAFE_PUBLISHED_FIELDS = ["priority", "expiresAt"];

export function validateSafePublishedUpdate(input = {}, current = {}) {
  const errors = {};
  const value = {};
  if (input.priority !== undefined) {
    if (!NOTICE_PRIORITIES.some((p) => p.value === input.priority)) {
      errors.priority = "Invalid priority.";
    } else {
      value.priority = input.priority;
      value.priorityRank = priorityRank(input.priority);
    }
  }
  if (input.expiresAt !== undefined) {
    const expiresAt = parseDate(input.expiresAt);
    if (input.expiresAt && !expiresAt) errors.expiresAt = "Invalid expiry date.";
    else {
      const currentExpiry = current.expiresAt ? new Date(current.expiresAt) : null;
      // Only extensions are allowed: shortening a live notice could hide
      // content a customer was told they could still read.
      if (currentExpiry && expiresAt && expiresAt <= currentExpiry) {
        errors.expiresAt = "Expiry can only be extended on a published notice.";
      }
      value.expiresAt = expiresAt;
    }
  }
  const protectedFields = ["title", "message", "type", "audienceType", "targetCustomerIds", "structuredChanges", "changeKind", "effectiveAt", "scheduledAt", "requireAcknowledgement"];
  const attempted = protectedFields.filter((field) => input[field] !== undefined);
  if (attempted.length > 0) {
    errors.locked = "Published notice content is locked. Create a revision to change it.";
  }
  if (Object.keys(value).length === 0 && attempted.length === 0) {
    errors.noChanges = "No editable fields were provided.";
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}
