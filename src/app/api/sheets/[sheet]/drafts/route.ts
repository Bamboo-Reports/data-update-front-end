import { NextResponse, type NextRequest } from "next/server";
import { getSchema } from "@/lib/schema";
import { NotFoundError, ValidationError } from "@/lib/sheets/repo";
import { deleteDraft, listDrafts, saveDraft } from "@/lib/sheets/drafts";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { stripInvisible } from "@/lib/format";

export const dynamic = "force-dynamic";
// A cold instance may need a multi-second Google read; stay clear of Vercel's
// default function timeout.
export const maxDuration = 30;

interface Params {
  params: Promise<{ sheet: string }>;
}

function cleanValues(
  schema: NonNullable<ReturnType<typeof getSchema>>,
  incoming: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    schema.fields
      .filter((field) => !field.computed && field.kind !== "readonly")
      .map((field) => [field.key, stripInvisible(String(incoming[field.key] ?? ""))]),
  );
}

function cleanAllValues(
  schema: NonNullable<ReturnType<typeof getSchema>>,
  incoming: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    schema.fields.map((field) => [
      field.key,
      stripInvisible(String(incoming[field.key] ?? "")),
    ]),
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);
    return NextResponse.json({ drafts: await listDrafts(schema.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);
    const body = (await req.json()) as {
      id?: string;
      values?: Record<string, unknown>;
      recordId?: string;
      recordRev?: string;
      baseValues?: Record<string, unknown>;
    };
    const values = cleanValues(schema, body.values ?? {});
    if (!Object.values(values).some((value) => value.trim() !== "")) {
      throw new ValidationError({}, "Add some information before saving for later.");
    }
    const draft = await saveDraft({
      id: body.id,
      sheet: schema.id,
      actor: user.email,
      values,
      recordId: body.recordId,
      recordRev: body.recordRev,
      baseValues: body.baseValues
        ? cleanAllValues(schema, body.baseValues)
        : undefined,
    });
    return NextResponse.json({ draft }, { status: body.id ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) throw new ValidationError({}, "Draft ID is required.");
    const deleted = await deleteDraft(schema.id, id);
    if (!deleted) throw new NotFoundError("Draft not found.");
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
