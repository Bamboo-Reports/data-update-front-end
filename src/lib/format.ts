/** Helpers shared by the server and the browser. Keep this file dependency-free. */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The sheet stores dates as text in exactly one shape: "7-August-2026". No
 * leading zero on the day, the month spelled out in full, a four-digit year.
 */
export const SHEET_DATE_RE = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/;

/** "7-August-2026" from parts. The only formatter that should ever write a date. */
export function formatSheetDate(y: number, m: number, d: number): string {
  return `${d}-${MONTH_NAMES[m - 1]}-${y}`;
}

/**
 * Reads a date leniently ("07-Aug-2026", "7-august-2026", "7/8/2026" are all
 * understood) so a typed value can be normalised to the canonical shape
 * instead of being bounced back.
 */
export function parseSheetDate(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]+|\d{1,2})[-/ ](\d{4})$/.exec(value.trim());
  if (!m) return null;
  const monthIdx = /^\d+$/.test(m[2])
    ? Number(m[2]) - 1
    : MONTH_NAMES.findIndex(
        (name) =>
          name.toLowerCase() === m[2].toLowerCase() ||
          (m[2].length >= 3 && name.toLowerCase().startsWith(m[2].toLowerCase())),
      );
  if (monthIdx < 0 || monthIdx > 11) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  // Reject impossible days such as 31-February.
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { y: year, m: monthIdx + 1, d: day };
}

/** "3-December-2024" to "2024-12-03" for a native date input. */
export function sheetDateToInput(value: string): string {
  const p = parseSheetDate(value);
  if (!p) return "";
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** "2024-12-03" back to "3-December-2024". */
export function inputDateToSheet(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value.trim();
  return formatSheetDate(Number(m[1]), monthIdx + 1, Number(m[3]));
}

/**
 * The canonical "7-August-2026" for any date the parser understands, or the
 * value untouched when it is not a date at all (so validation can reject it).
 */
export function canonicalSheetDate(value: string): string {
  const p = parseSheetDate(value);
  return p ? formatSheetDate(p.y, p.m, p.d) : value.trim();
}

export function isCanonicalSheetDate(value: string): boolean {
  return parseSheetDate(value) !== null && canonicalSheetDate(value) === value;
}

export function todaySheetDate(now = new Date()): string {
  return formatSheetDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Years offered by the year picker: a few ahead for announced centers, back to 1900. */
export function yearOptions(now = new Date()): string[] {
  const out: string[] = [];
  for (let y = now.getFullYear() + 5; y >= 1900; y--) out.push(String(y));
  return out;
}

/** Thousands separators for display only; the stored cell stays a plain number. */
export function groupNumber(value: string): string {
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(n) || value.trim() === "") return value;
  return n.toLocaleString("en-US");
}

/**
 * Zero-width and other invisible characters. They arrive by copy-paste from
 * websites and PDFs, render as nothing in Sheets, and silently corrupt the
 * keys the registers join on: a center whose name carries a zero-width space
 * no longer matches the same name typed by hand. Stripped from every value on
 * the way into the sheet rather than reported afterwards.
 *
 * Wider than the ETL validator's list, which covers only ZWSP/ZWNJ/ZWJ/BOM and
 * the soft hyphen. The bidi controls below are just as invisible and just as
 * damaging — `centers!AH4286` held a phone number ending in U+202C that the
 * ETL scan reported as clean.
 */
const INVISIBLE_CHARS_RE =
  /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;

export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE_CHARS_RE, "");
}

/** True if the text has a link in it. Used for columns that must stay prose. */
export function containsUrl(value: string): boolean {
  return /https?:\/\/|www\./i.test(value);
}

export function isLikelyUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // The sheet mixes bare hosts ("www.3m.com") with full URLs, and some source
  // cells hold several space-separated links. Accept all three shapes.
  return v
    .split(/\s+/)
    .every((part) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(part));
}

/** Parses a 4-digit year, rejecting anything else. */
export function parseYear(value: string): number | null {
  const v = value.replace(/,/g, "").trim();
  if (!/^\d{4}$/.test(v)) return null;
  return Number(v);
}
