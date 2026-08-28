import { sheetsClient, spreadsheetId } from "./auth";
import { withLock } from "../mutex";
import { sheetIdMap } from "./repo";
import { VersionedCache } from "../cache";

export const AUDIT_SHEET = "_AuditLog";

const AUDIT_HEADERS = [
  "Timestamp",
  "User",
  "Sheet",
  "Action",
  "Record ID",
  "Record Name",
  "Field",
  "Old Value",
  "New Value",
  "Note",
];

export type AuditAction = "create" | "update" | "archive";

export interface AuditEntry {
  user: string;
  sheet: string;
  action: AuditAction;
  recordId: string;
  recordName: string;
  field: string;
  oldValue: string;
  newValue: string;
  note?: string;
}

let ensured = false;

async function ensureAuditSheet(): Promise<void> {
  if (ensured) return;

  const exists = (await sheetIdMap()).has(AUDIT_SHEET);

  if (!exists) {
    await sheetsClient().spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: AUDIT_SHEET,
                // Hidden so the tab does not clutter the master file for the
                // people working in the sheet directly.
                hidden: true,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    await sheetsClient().spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `${AUDIT_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [AUDIT_HEADERS] },
    });
  }

  ensured = true;
}

/** Truncated so a 2,000-character "About Company" edit does not bloat the log. */
function clip(value: string): string {
  const max = 500;
  return value.length > max ? `${value.slice(0, max)}... [${value.length} chars]` : value;
}

/**
 * Appends one row per changed field. Never throws: a failed audit write is
 * reported to the caller as a warning rather than failing an edit the user
 * has already successfully made to the sheet.
 */
export async function writeAudit(entries: AuditEntry[]): Promise<string | null> {
  if (!entries.length) return null;
  try {
    return await withLock(AUDIT_SHEET, async () => {
      await ensureAuditSheet();
      const at = new Date().toISOString();
      const rows = entries.map((e) => [
        at,
        e.user,
        e.sheet,
        e.action,
        e.recordId,
        e.recordName,
        e.field,
        clip(e.oldValue),
        clip(e.newValue),
        e.note ?? "",
      ]);
      await sheetsClient().spreadsheets.values.append({
        spreadsheetId: spreadsheetId(),
        range: `${AUDIT_SHEET}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      });
      await auditCache.invalidate();
      return null;
    });
  } catch (err) {
    console.error("[audit] failed to write audit entries", err);
    return "Saved your change. The audit log did not record it.";
  }
}

export interface AuditRow {
  timestamp: string;
  user: string;
  sheet: string;
  action: string;
  recordId: string;
  recordName: string;
  field: string;
  oldValue: string;
  newValue: string;
  note: string;
}

/**
 * The whole log, oldest first. Only this app appends to it, so the cache is
 * dropped on every write and otherwise lives for a minute; the log grows
 * without bound, and re-reading it for each history panel was the slowest
 * request in the app.
 */
const auditCache = new VersionedCache<AuditRow[]>("audit", 60_000, async () => {
  await ensureAuditSheet();
  const res = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${AUDIT_SHEET}!A2:J`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return ((res.data.values ?? []) as unknown[][]).map(toAuditRow);
});

function loadAudit(): Promise<AuditRow[]> {
  return auditCache.get();
}

/** Most recent entries first. Used by the history panel. */
export async function readAudit(
  opts: { recordId?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  const mapped = await loadAudit();
  const filtered = opts.recordId
    ? mapped.filter((r) => r.recordId === opts.recordId)
    : mapped;

  // Walk from the end instead of reversing a copy of the whole log.
  const limit = opts.limit ?? 100;
  const out: AuditRow[] = [];
  for (let i = filtered.length - 1; i >= 0 && out.length < limit; i--) {
    out.push(filtered[i]);
  }
  return out;
}

function toAuditRow(r: unknown[]): AuditRow {
  return {
    timestamp: String(r[0] ?? ""),
    user: String(r[1] ?? ""),
    sheet: String(r[2] ?? ""),
    action: String(r[3] ?? ""),
    recordId: String(r[4] ?? ""),
    recordName: String(r[5] ?? ""),
    field: String(r[6] ?? ""),
    oldValue: String(r[7] ?? ""),
    newValue: String(r[8] ?? ""),
    note: String(r[9] ?? ""),
  };
}
