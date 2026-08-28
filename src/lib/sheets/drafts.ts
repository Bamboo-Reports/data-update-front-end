import { randomUUID } from "node:crypto";
import type { DraftRecord } from "../drafts";
import { withLock } from "../mutex";
import { sheetsClient, spreadsheetId } from "./auth";
import { sheetIdMap } from "./repo";
import { VersionedCache } from "../cache";

const DRAFT_SHEET = "_Drafts";
const DRAFT_HEADERS = [
  "Draft ID",
  "Sheet",
  "Created At",
  "Created By",
  "Updated At",
  "Updated By",
  "Values JSON",
  "Record ID",
  "Record Revision",
  "Base Values JSON",
];

let ensured = false;

async function ensureDraftSheet(): Promise<void> {
  if (ensured) return;
  const client = sheetsClient();
  const exists = (await sheetIdMap()).has(DRAFT_SHEET);

  if (!exists) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: DRAFT_SHEET,
                hidden: true,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
  }
  // Rewriting the header also upgrades drafts created before deferred updates
  // added the final three metadata columns. Existing data remains in A:G.
  await client.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${DRAFT_SHEET}!A1:J1`,
    valueInputOption: "RAW",
    requestBody: { values: [DRAFT_HEADERS] },
  });
  ensured = true;
}

function parseValues(raw: unknown): Record<string, string> | null {
  try {
    const values = JSON.parse(String(raw ?? "{}")) as unknown;
    if (!values || typeof values !== "object" || Array.isArray(values)) return null;
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, String(value ?? "")]),
    );
  } catch {
    return null;
  }
}

function toDraft(row: unknown[]): DraftRecord | null {
  const values = parseValues(row[6]);
  if (!values) return null;
  const baseValues = row[9] ? parseValues(row[9]) : undefined;
  try {
    return {
      id: String(row[0] ?? ""),
      sheet: String(row[1] ?? ""),
      createdAt: String(row[2] ?? ""),
      createdBy: String(row[3] ?? ""),
      updatedAt: String(row[4] ?? ""),
      updatedBy: String(row[5] ?? ""),
      values,
      recordId: String(row[7] ?? "") || undefined,
      recordRev: String(row[8] ?? "") || undefined,
      baseValues: baseValues ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Drafts change only through this app, so a short cache is safe and turns the
 * finder's "saved for later" list from a Google round trip into a memory read.
 * Writes invalidate it across every instance.
 */
const rowsCache = new VersionedCache<unknown[][]>("drafts", 30_000, async () => {
  await ensureDraftSheet();
  const response = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${DRAFT_SHEET}!A2:J`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (response.data.values ?? []) as unknown[][];
});

/** `force` is for the write paths, which must see the latest row positions. */
function readRows(force = false): Promise<unknown[][]> {
  return rowsCache.get(force);
}

export function invalidateDrafts(): Promise<void> {
  return rowsCache.invalidate();
}

export async function listDrafts(sheet: string): Promise<DraftRecord[]> {
  const drafts = (await readRows())
    .map(toDraft)
    .filter((draft): draft is DraftRecord => !!draft && draft.sheet === sheet);
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveDraft(input: {
  id?: string;
  sheet: string;
  actor: string;
  values: Record<string, string>;
  recordId?: string;
  recordRev?: string;
  baseValues?: Record<string, string>;
}): Promise<DraftRecord> {
  return withLock(DRAFT_SHEET, async () => {
    const rows = await readRows(true);
    const rowIndex = input.id
      ? rows.findIndex(
          (row) => String(row[0] ?? "") === input.id && String(row[1] ?? "") === input.sheet,
        )
      : input.recordId
        ? rows.findIndex(
            (row) =>
              String(row[1] ?? "") === input.sheet &&
              String(row[7] ?? "") === input.recordId,
          )
        : -1;
    const previous = rowIndex >= 0 ? toDraft(rows[rowIndex]) : null;
    const now = new Date().toISOString();
    const draft: DraftRecord = {
      id: previous?.id ?? `draft-${randomUUID()}`,
      sheet: input.sheet,
      createdAt: previous?.createdAt ?? now,
      createdBy: previous?.createdBy ?? input.actor,
      updatedAt: now,
      updatedBy: input.actor,
      values: input.values,
      recordId: input.recordId ?? previous?.recordId,
      recordRev: input.recordRev ?? previous?.recordRev,
      baseValues: input.baseValues ?? previous?.baseValues,
    };
    const row = [
      draft.id,
      draft.sheet,
      draft.createdAt,
      draft.createdBy,
      draft.updatedAt,
      draft.updatedBy,
      JSON.stringify(draft.values),
      draft.recordId ?? "",
      draft.recordRev ?? "",
      draft.baseValues ? JSON.stringify(draft.baseValues) : "",
    ];

    if (rowIndex >= 0) {
      const sheetRow = rowIndex + 2;
      await sheetsClient().spreadsheets.values.update({
        spreadsheetId: spreadsheetId(),
        range: `${DRAFT_SHEET}!A${sheetRow}:J${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
    } else {
      await sheetsClient().spreadsheets.values.append({
        spreadsheetId: spreadsheetId(),
        range: `${DRAFT_SHEET}!A1:J`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }
    await invalidateDrafts();
    return draft;
  });
}

export async function deleteDraft(sheet: string, id: string): Promise<boolean> {
  return withLock(DRAFT_SHEET, async () => {
    const rows = await readRows(true);
    const rowIndex = rows.findIndex(
      (row) => String(row[0] ?? "") === id && String(row[1] ?? "") === sheet,
    );
    if (rowIndex < 0) return false;
    await sheetsClient().spreadsheets.values.clear({
      spreadsheetId: spreadsheetId(),
      range: `${DRAFT_SHEET}!A${rowIndex + 2}:J${rowIndex + 2}`,
    });
    await invalidateDrafts();
    return true;
  });
}
