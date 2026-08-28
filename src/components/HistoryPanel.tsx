"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { titleKeyOf, type SheetSchema } from "@/lib/schema/types";
import type { RecordRow } from "@/lib/sheets/repo";
import type { AuditRow } from "@/lib/sheets/audit";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HistoryListSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function HistoryPanel({
  schema,
  record,
  onClose,
}: {
  schema: SheetSchema;
  record: RecordRow;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/sheets/${schema.id}/history?recordId=${encodeURIComponent(record.id)}`,
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(
            body.error ??
              "The app did not load this record's history. Close this panel and try again.",
          );
        }
        setEntries(body.entries as AuditRow[]);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "The app did not load this record's history. Close this panel and try again.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schema.id, record.id]);

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-border gap-1 border-b px-5 py-4 pr-14 sm:px-6">
          <SheetTitle className="text-lg font-semibold">Change history</SheetTitle>
          <SheetDescription asChild>
            <p className="text-xs">
              <span className="text-primary font-semibold">{record.id}</span>
              <span className="text-muted-foreground">
                {record.values[titleKeyOf(schema)]
                  ? ` · ${record.values[titleKeyOf(schema)]}`
                  : ""}
              </span>
            </p>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!entries && !error && <HistoryListSkeleton rows={3} />}

          {entries?.length === 0 && (
            <div className="border-border border border-dashed px-5 py-9 text-center">
              <p className="text-ink text-sm font-medium">No edits yet</p>
              <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                This app records changes made here. It cannot see edits made
                directly in Google Sheets.
              </p>
            </div>
          )}

          {entries && entries.length > 0 && (
            <ol className="border-border divide-border overflow-hidden border">
              {entries.map((e, i) => (
              <li
                key={`${e.timestamp}-${e.field}-${i}`}
                className="bg-card px-4 py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-ink text-xs font-medium">{e.field}</span>
                  <time
                    className="text-muted-foreground ml-auto text-xs"
                    dateTime={e.timestamp}
                  >
                    {new Date(e.timestamp).toLocaleString()}
                  </time>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">{e.user}</p>

                {e.action === "update" ? (
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                    <p className="text-muted-foreground line-clamp-3 bg-muted px-2.5 py-2 line-through">
                      {e.oldValue || "(blank)"}
                    </p>
                    <ArrowRight aria-hidden="true" className="text-muted-foreground size-3.5" />
                    <p className="text-ink line-clamp-3 bg-accent px-2.5 py-2">
                      {e.newValue || "(blank)"}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {e.action === "create"
                      ? "Record created"
                      : `Archived. ${e.note}`}
                  </p>
                )}
              </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
