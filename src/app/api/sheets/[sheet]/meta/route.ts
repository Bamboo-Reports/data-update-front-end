import { NextResponse, type NextRequest } from "next/server";
import { getSchema } from "@/lib/schema";
import {
  distinctValues,
  nextId,
  NotFoundError,
  optionGroupsForSchema,
  suggestionsForField,
} from "@/lib/sheets/repo";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";
// A cold instance may need a multi-second Google read; stay clear of Vercel's
// default function timeout.
export const maxDuration = 30;

interface Params {
  params: Promise<{ sheet: string }>;
}

/**
 * Schema plus the live option lists the editor needs: existing values for
 * `combo` fields, and the id the next created record will get.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { sheet } = await params;
    const schema = getSchema(sheet);
    if (!schema) throw new NotFoundError(`Unknown sheet "${sheet}"`);

    const suggestions: Record<string, string[]> = {};
    // Filter facets cover the low-cardinality columns worth filtering on.
    const facets: Record<string, string[]> = {};
    const [, , next, optionGroups] = await Promise.all([
      Promise.all(
        schema.fields
          .filter((f) => f.kind === "combo")
          .map(async (f) => {
            suggestions[f.key] = await suggestionsForField(schema, f);
          }),
      ),
      Promise.all(
        schema.fields
          .filter((f) => f.kind === "select" && f.inTable)
          .map(async (f) => {
            facets[f.key] = await distinctValues(schema, f.key);
          }),
      ),
      nextId(schema),
      optionGroupsForSchema(schema),
    ]);

    return NextResponse.json({ schema, suggestions, optionGroups, facets, nextId: next });
  } catch (err) {
    return errorResponse(err);
  }
}
