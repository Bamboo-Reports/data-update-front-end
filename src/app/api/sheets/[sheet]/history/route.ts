import { NextResponse, type NextRequest } from "next/server";
import { getSchema } from "@/lib/schema";
import { NotFoundError } from "@/lib/sheets/repo";
import { readAudit } from "@/lib/sheets/audit";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

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

    const recordId = req.nextUrl.searchParams.get("recordId") ?? undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100;
    const entries = await readAudit({ recordId, limit: Math.min(limit, 500) });

    return NextResponse.json({
      entries: entries.filter((e) => !e.sheet || e.sheet === schema.sheetName),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
