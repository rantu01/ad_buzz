// Central date-display format for the entire site: Day/Month/Year (DD/MM/YYYY).
//
// Every page, table, report and export must render calendar dates through
// these helpers so the format stays consistent regardless of the viewer's
// browser/server locale. All helpers are display-only: database values,
// date calculations, sorting and filtering logic are intentionally untouched.
//
//   formatDate      -> "12/10/2026"
//   formatTime      -> "14:30:05" (24-hour)
//   formatDateTime  -> "12/10/2026, 14:30:05"
//   formatMonthYear -> "10/2026"
//   formatWeekdayDate -> "Monday, 12/10/2026"
//
// Invalid/empty input renders as "" so unconditional call sites never show
// "Invalid Date"; call sites with their own fallbacks (ternaries) keep them.

function toDate(input) {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Exact calendar-day labels (e.g. financial-report grouping keys) are split
// as plain text so a UTC-midnight string can never shift to the previous
// day in negative-offset timezones.
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function formatDate(input) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input === "string") {
    const s = input.trim();
    const day = s.match(DAY_RE);
    if (day) return `${day[3]}/${day[2]}/${day[1]}`;
    const month = s.match(MONTH_RE);
    if (month) return `${month[2]}/${month[1]}`;
  }
  const d = toDate(input);
  if (!d) return typeof input === "string" ? input : "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatTime(input) {
  const d = toDate(input);
  if (!d) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(input) {
  const d = toDate(input);
  if (!d) return "";
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatMonthYear(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  return `${String(m).padStart(2, "0")}/${y}`;
}

export function formatWeekdayDate(input) {
  const d = toDate(input);
  if (!d) return "";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday}, ${formatDate(d)}`;
}
