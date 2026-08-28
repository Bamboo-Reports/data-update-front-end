import { NextResponse } from "next/server";
import { SCHEMA_LIST } from "@/lib/schema";
import { verifyFormulas, verifyHeaders } from "@/lib/sheets/repo";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Confirms the service account can reach the spreadsheet and that every
 * schema still lines up with the sheet's real headers.
 */
export async function GET() {
  try {
    await requireUser();
    const sheets: Record<string, { ok: boolean; problems: string[] }> = {};
    for (const schema of SCHEMA_LIST) {
      const headerProblems = await verifyHeaders(schema);
      // Only worth checking formulas once the columns line up; otherwise every
      // index is off and the output is noise.
      const formulaProblems = headerProblems.length
        ? []
        : await verifyFormulas(schema);
      const problems = [...headerProblems, ...formulaProblems];
      sheets[schema.sheetName] = { ok: problems.length === 0, problems };
    }
    const ok = Object.values(sheets).every((s) => s.ok);
    return NextResponse.json({ ok, sheets }, { status: ok ? 200 : 503 });
  } catch (err) {
    return errorResponse(err);
  }
}
