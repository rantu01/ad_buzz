// Canonical support-ticket stages (single source of truth for server + UI).
//
//   open               — customer created the ticket (initial stage)
//   customer_reply     — customer replied (needs staff attention)
//   support_agent_reply— staff/support agent replied (needs customer attention)
//   in_progress        — staff picked it up manually
//   hold               — staff put it on hold manually
//   closed             — resolved/closed manually
//
// Legacy documents may still carry `replied` (old staff-reply status) or
// `in_progress`; `replied` is treated as `support_agent_reply` everywhere.

export const TICKET_STAGES = [
  { key: "open", label: "Open" },
  { key: "customer_reply", label: "Customer Reply" },
  { key: "support_agent_reply", label: "Support Agent Reply" },
  { key: "in_progress", label: "In Progress" },
  { key: "hold", label: "HOLD" },
  { key: "closed", label: "Closed" },
];

export const TICKET_STAGE_KEYS = TICKET_STAGES.map((s) => s.key);

// Statuses a staff member may select manually (replies set their stage
// automatically, so they are excluded here).
export const MANUAL_TICKET_STAGES = ["open", "in_progress", "hold", "closed"];

// Statuses accepted by the admin PATCH endpoint (includes reply-driven
// stages for forward-compat plus the legacy `replied` value).
export const WRITABLE_TICKET_STATUSES = [
  ...TICKET_STAGE_KEYS,
  "replied",
];

export function normalizeTicketStatus(status) {
  if (status === "replied") return "support_agent_reply";
  return status;
}

export function ticketStageLabel(status) {
  const key = normalizeTicketStatus(status);
  return TICKET_STAGES.find((s) => s.key === key)?.label || String(status || "Open").replace(/_/g, " ");
}

// Shared badge colors for ticket stages (admin + customer panels).
export const TICKET_STAGE_COLORS = {
  open: "bg-blue-50 text-blue-700",
  customer_reply: "bg-amber-50 text-amber-700",
  support_agent_reply: "bg-purple-50 text-purple-700",
  in_progress: "bg-orange-50 text-orange-700",
  hold: "bg-slate-100 text-slate-600",
  closed: "bg-slate-50 text-slate-500",
  replied: "bg-purple-50 text-purple-700",
};

export function ticketStageColor(status) {
  return TICKET_STAGE_COLORS[normalizeTicketStatus(status)] || "bg-slate-50 text-slate-600";
}

// A ticket needs staff attention while it is anything but closed.
export function ticketNeedsAttention(status) {
  return normalizeTicketStatus(status) !== "closed";
}
