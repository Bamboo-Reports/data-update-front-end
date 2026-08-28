import { notFound, redirect } from "next/navigation";
import { getSchema, SCHEMA_LIST } from "@/lib/schema";
import {
  listRecords,
  optionGroupsForSchema,
  prewarm,
  suggestionsForField,
  verifyFormulas,
  verifyHeaders,
} from "@/lib/sheets/repo";
import { listDrafts } from "@/lib/sheets/drafts";
import { currentUser } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import RecordFinder from "@/components/RecordFinder";

export const dynamic = "force-dynamic";
// A cold instance may need a multi-second Google read; stay clear of Vercel's
// default function timeout.
export const maxDuration = 30;

export default async function SheetPage({
  params,
}: {
  params: Promise<{ sheet: string }>;
}) {
  const { sheet } = await params;
  const schema = getSchema(sheet);
  if (!schema) notFound();

  const user = await currentUser();
  if (!user) redirect(`/signin?callbackUrl=/${sheet}`);

  // Warm the registers the user has not opened yet. Switching costs several
  // Google round trips, so paying for them here — off the critical path of this
  // render — is what makes the next switch land on a warm cache.
  prewarm(SCHEMA_LIST.filter((s) => s.id !== schema.id));

  // Start every independent sheet read together. The repository deduplicates
  // the shared table load, so header checks, counts and suggestions wait on one
  // Google request instead of creating a waterfall.
  const [
    headerProblems,
    checkedFormulaProblems,
    count,
    suggestionEntries,
    optionGroups,
    drafts,
  ] = await Promise.all([
      verifyHeaders(schema),
      verifyFormulas(schema),
      listRecords(schema, { pageSize: 1 }),
      Promise.all(
        schema.fields
          .filter((field) => field.kind === "combo")
          .map(
            async (field) =>
              [field.key, await suggestionsForField(schema, field)] as const,
          ),
      ),
      optionGroupsForSchema(schema),
      // Rendered with the page rather than fetched after it, so the "saved
      // for later" list does not pop in a beat behind the search box.
      listDrafts(schema.id).catch((error: unknown) => {
        console.error("[drafts] failed to load", error);
        return null;
      }),
    ]);
  // A column that quietly gained or lost a formula is just as dangerous as a
  // renamed one, so both block the editor. Header drift takes precedence so the
  // formula diagnostics do not add noise when the column map is already wrong.
  const formulaProblems = headerProblems.length ? [] : checkedFormulaProblems;
  const schemaProblems = [...headerProblems, ...formulaProblems];
  if (schemaProblems.length) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <Alert variant="destructive">
          <AlertTitle>
            The {schema.sheetName} sheet no longer matches the app
          </AlertTitle>
          <AlertDescription className="block">
            <p className="text-pretty">
              Editing is off because a write could land in the wrong column.
              Restore the column order in the sheet, or update{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs font-medium">
                src/lib/schema/{schema.id}.ts
              </code>{" "}
              to match it.
            </p>
            <ul className="mt-4 space-y-1.5">
              {schemaProblems.map((p) => (
                <li
                  key={p}
                  className="border-border bg-card text-ink rounded border px-3 py-2 text-xs"
                >
                  {p}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <RecordFinder
      schema={schema}
      totalRecords={count.total}
      suggestions={Object.fromEntries(suggestionEntries)}
      optionGroups={optionGroups}
      canArchive={user.admin}
      initialDrafts={drafts}
    />
  );
}
