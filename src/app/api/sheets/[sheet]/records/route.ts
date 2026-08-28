import { NextResponse, type NextRequest } from "next/server";
import { getSchema } from "@/lib/schema";
import {
  createRecord,
  listRecords,
  sourcedAllowedValues,
  sourcedSimilarValues,
  NotFoundError,
  titleKey,
  ValidationError,
  type ListQuery,
} from "@/lib/sheets/repo";
import { listAllNames } from "@/lib/sheets/names";
import { writeAudit } from "@/lib/sheets/audit";
import { deleteDraft } from "@/lib/sheets/drafts";
import { validateRecord } from "@/lib/validate";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canonicalSheetDate } from "@/lib/format";
import { todaySheetDate } from "@/lib/format";
import { MAX_PAGE_SIZE, MIN_QUERY_LENGTH } from "@/lib/search";

export const dynamic = "force-dynamic";
// A cold instance may need a multi-second Google read; stay clear of Vercel's
// default function timeout.
export const maxDuration = 30;

interface Params {
  params: Promise<{ sheet: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);

    const sp = req.nextUrl.searchParams;
    const filters: Record<string, string[]> = {};
    for (const [key, value] of sp.entries()) {
      if (!key.startsWith("filter.")) continue;
      const fieldKey = key.slice("filter.".length);
      if (!schema.fields.some((f) => f.key === fieldKey)) continue;
      filters[fieldKey] = value.split("|").filter(Boolean);
    }

    // This app is a lookup desk, not an export. A search term is required so
    // the endpoint cannot be used to pull the sheet down wholesale, and the
    // page size is capped well below the row count for the same reason.
    const q = (sp.get("q") ?? "").trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: `Search for a record first. Type at least ${MIN_QUERY_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const query: ListQuery = {
      q,
      filters,
      sortBy: sp.get("sortBy") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
      page: Number(sp.get("page") ?? 1) || 1,
      pageSize: Math.min(Number(sp.get("pageSize") ?? 8) || 8, MAX_PAGE_SIZE),
    };

    const result = await listRecords(schema, query);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);

    const body = (await req.json()) as {
      values?: Record<string, string>;
      draftId?: string;
    };
    const incoming = body.values ?? {};

    // Build a complete record so required-field checks see every column, not
    // only the ones the form happened to send.
    const values: Record<string, string> = {};
    for (const field of schema.fields) {
      // Computed columns get their formulas pasted in after the row is added.
      if (field.kind === "readonly" || field.computed) continue;
      values[field.key] = (incoming[field.key] ?? "").trim();
      // Dates go into the sheet in one shape only; a typed "07-Aug-2026" is
      // normalised here rather than bounced.
      if (field.kind === "date" && values[field.key]) {
        values[field.key] = canonicalSheetDate(values[field.key]);
      }
    }
    const dateField = schema.fields.find((f) => f.kind === "date");
    if (dateField && !values[dateField.key]) {
      values[dateField.key] = todaySheetDate();
    }

    const [takenNames, allowedValues, similarValues] = await Promise.all([
      schema.titleUnique ? listAllNames(schema) : undefined,
      sourcedAllowedValues(schema, values),
      sourcedSimilarValues(schema, values),
    ]);
    const { errors, warnings } = validateRecord(schema, values, {
      takenNames,
      allowedValues,
      similarValues,
    });
    if (Object.keys(errors).length) throw new ValidationError(errors);

    const record = await createRecord(schema, values, { actor: user.email });

    // The audit row and the draft clean-up touch different tabs, so they run
    // together rather than adding two round trips to the user's wait.
    const [auditWarning, draftWarning] = await Promise.all([
      writeAudit([
        {
          user: user.email,
          sheet: schema.sheetName,
          action: "create",
          recordId: record.id,
          recordName: record.values[titleKey(schema)] ?? "",
          field: "(new record)",
          oldValue: "",
          newValue: `Row ${record.rowNumber}`,
        },
      ]),
      body.draftId
        ? deleteDraft(schema.id, body.draftId).then(
            (deleted) =>
              deleted ? null : "Created the record. The draft was already gone.",
            (error) => {
              console.error("[draft] failed to remove completed draft", error);
              return "Created the record. The app could not remove the draft from Saved for later.";
            },
          )
        : null,
    ]);

    return NextResponse.json(
      { record, warnings, auditWarning, draftWarning },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
