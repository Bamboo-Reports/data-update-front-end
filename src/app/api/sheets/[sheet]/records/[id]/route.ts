import { NextResponse, type NextRequest } from "next/server";
import { getSchema } from "@/lib/schema";
import {
  archiveRecord,
  getRecord,
  NotFoundError,
  titleKey,
  updateRecord,
  sourcedAllowedValues,
  sourcedSimilarValues,
  ValidationError,
} from "@/lib/sheets/repo";
import { listAllNames } from "@/lib/sheets/names";
import { writeAudit, type AuditEntry } from "@/lib/sheets/audit";
import { deleteDraft } from "@/lib/sheets/drafts";
import { validateRecord } from "@/lib/validate";
import { requireAdmin, requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canonicalSheetDate, stripInvisible } from "@/lib/format";

export const dynamic = "force-dynamic";
// A cold instance may need a multi-second Google read; stay clear of Vercel's
// default function timeout.
export const maxDuration = 30;

interface Params {
  params: Promise<{ sheet: string; id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { sheet, id } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);
    return NextResponse.json({ record: await getRecord(schema, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { sheet, id } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);

    const body = (await req.json()) as {
      values?: Record<string, string>;
      rev?: string;
      draftId?: string;
    };

    const current = await getRecord(schema, id);

    // Accept only known, writable keys so a crafted payload cannot reach a
    // column the schema does not describe.
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.values ?? {})) {
      const field = schema.fields.find((f) => f.key === key);
      // Never accept a value for a formula column, whatever the payload says.
      if (!field || field.kind === "readonly" || field.computed) continue;
      values[key] = stripInvisible(String(value ?? "").trim());
      if (field.kind === "date" && values[key]) {
        values[key] = canonicalSheetDate(values[key]);
      }
    }

    const merged = { ...current.values, ...values };
    const [takenNames, allowedValues, similarValues] = await Promise.all([
      schema.titleUnique
        ? listAllNames(schema, current.values[titleKey(schema)])
        : undefined,
      sourcedAllowedValues(schema, merged, new Set(Object.keys(values))),
      sourcedSimilarValues(schema, merged, current.values),
    ]);
    const { errors, warnings } = validateRecord(schema, values, {
      current: current.values,
      takenNames,
      allowedValues,
      similarValues,
    });
    if (Object.keys(errors).length) throw new ValidationError(errors);

    const { record, changes } = await updateRecord(
      schema,
      id,
      values,
      body.rev,
      { actor: user.email },
    );

    const entries: AuditEntry[] = changes.map((c) => ({
      user: user.email,
      sheet: schema.sheetName,
      action: "update" as const,
      recordId: id,
      recordName: record.values[titleKey(schema)] ?? "",
      field: c.header.replace(/\n/g, " "),
      oldValue: c.from,
      newValue: c.to,
    }));
    const [auditWarning, draftWarning] = await Promise.all([
      writeAudit(entries),
      body.draftId
        ? deleteDraft(schema.id, body.draftId).then(
            (deleted) =>
              deleted ? null : "Saved your update. The draft was already gone.",
            (error) => {
              console.error("[draft] failed to remove completed update draft", error);
              return "Saved your update. The app could not remove the draft from Saved for later.";
            },
          )
        : null,
    ]);

    return NextResponse.json({
      record,
      changed: changes.length,
      warnings,
      auditWarning,
      draftWarning,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAdmin();
    const { sheet, id } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);

    const reason = (req.nextUrl.searchParams.get("reason") ?? "").trim();
    if (reason.length < 3) {
      throw new ValidationError(
        { reason: "Give a short reason for archiving this record." },
        "A reason is required",
      );
    }

    const record = await archiveRecord(schema, id, reason, { actor: user.email });

    const auditWarning = await writeAudit([
      {
        user: user.email,
        sheet: schema.sheetName,
        action: "archive",
        recordId: id,
        recordName: record.values[titleKey(schema)] ?? "",
        field: "(whole record)",
        oldValue: `Row ${record.rowNumber}`,
        newValue: schema.archiveSheetName,
        note: reason,
      },
    ]);

    return NextResponse.json({
      archived: id,
      movedTo: schema.archiveSheetName,
      auditWarning,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
