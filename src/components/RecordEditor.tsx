"use client";

import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { titleKeyOf, type FieldDef, type SheetSchema } from "@/lib/schema/types";
import type { DraftRecord } from "@/lib/drafts";
import type { RecordRow } from "@/lib/sheets/repo";
import { todaySheetDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import FieldInput from "./FieldInput";

export interface CloseGuard {
  title: string;
  description: string;
  leaveLabel: string;
}

interface Props {
  schema: SheetSchema;
  record: RecordRow | null;
  draft?: DraftRecord | null;
  suggestions: Record<string, string[]>;
  /** field key to parent value to the options available under it. */
  optionGroups?: Record<string, Record<string, string[]>>;
  canArchive: boolean;
  /** Values a new record starts with, e.g. names inherited from a parent. */
  initialValues?: Record<string, string>;
  /** Inherited fields the user must not retype. */
  lockedKeys?: ReadonlySet<string>;
  /** Replaces the usual discard dialog when closing this editor. */
  closeGuard?: CloseGuard;
  onClose: () => void;
  /** `record` is the row as written, present when a record was created. */
  onSaved: (message: string, record?: RecordRow) => void;
  onDraftSaved: (message: string) => void;
  onWarning: (message: string) => void;
}

function blankValues(schema: SheetSchema): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of schema.fields) v[f.key] = "";
  const dateField = schema.fields.find((f) => f.kind === "date");
  if (dateField) v[dateField.key] = todaySheetDate();
  return v;
}

export default function RecordEditor({
  schema,
  record,
  draft,
  suggestions,
  optionGroups = {},
  canArchive,
  initialValues,
  lockedKeys,
  closeGuard,
  onClose,
  onSaved,
  onDraftSaved,
  onWarning,
}: Props) {
  const isNew = record === null;
  const isDraft = !!draft;
  const [values, setValues] = useState<Record<string, string>>(
    () =>
      draft
        ? { ...(record?.values ?? {}), ...draft.values }
        : record?.values ?? { ...blankValues(schema), ...(initialValues ?? {}) },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [savingAction, setSavingAction] = useState<
    "record" | "draft" | "archive" | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"record" | "draft" | null>(
    null,
  );
  const [archiveReason, setArchiveReason] = useState("");

  const groups = useMemo(
    () =>
      schema.groups
        .map((g) => ({ name: g, fields: schema.fields.filter((f) => f.group === g) }))
        .filter((g) => g.fields.length > 0),
    [schema],
  );

  const submittedKeys = useMemo(() => {
    const writable = schema.fields.filter((f) => !f.computed && f.kind !== "readonly");
    if (isNew) {
      return writable
        .filter((f) => (values[f.key] ?? "").trim() !== "")
        .map((f) => f.key);
    }
    return writable
      .filter((f) => (values[f.key] ?? "") !== (record.values[f.key] ?? ""))
      .map((f) => f.key);
  }, [values, record, isNew, schema]);

  const unsavedKeys = useMemo(() => {
    if (!draft) return submittedKeys;
    return schema.fields
      .filter((field) => !field.computed && field.kind !== "readonly")
      .filter(
        (field) =>
          (values[field.key] ?? "") !== (draft.values[field.key] ?? ""),
      )
      .map((field) => field.key);
  }, [draft, schema, submittedKeys, values]);

  const dirty = unsavedKeys.length > 0;
  const saving = savingAction !== null;
  const reviewRows = useMemo(() => {
    const keys = reviewAction === "draft" ? unsavedKeys : submittedKeys;
    const baseValues =
      reviewAction === "draft" && draft
        ? draft.values
        : (record?.values ?? {});

    return keys.flatMap((key) => {
      const field = schema.fields.find((item) => item.key === key);
      if (!field) return [];
      return [
        {
          key,
          label: field.label,
          current: baseValues[key] ?? "",
          next: values[key] ?? "",
        },
      ];
    });
  }, [draft, record, reviewAction, schema.fields, submittedKeys, unsavedKeys, values]);
  const hasDraftContent = schema.fields.some(
    (field) =>
      !field.computed &&
      field.kind !== "readonly" &&
      field.kind !== "date" &&
      (values[field.key] ?? "").trim() !== "",
  );

  function requestClose() {
    if (dirty || closeGuard) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function set(key: string, next: string) {
    // A field whose choices depend on this one (SM's center list depends on
    // the account) cannot keep a value that belongs to the old parent.
    const dependents = schema.fields
      .filter((f) => f.optionSource?.groupBy?.fieldKey === key)
      .map((f) => f.key);
    setValues((prev) => {
      const out = { ...prev, [key]: next };
      if (prev[key] !== next) for (const d of dependents) out[d] = "";
      return out;
    });
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  }

  /** Choices for a field, narrowed to its parent's partition when grouped. */
  function optionsFor(field: FieldDef): string[] | undefined {
    const groupBy = field.optionSource?.groupBy;
    if (!groupBy) return suggestions[field.key];
    const parent = values[groupBy.fieldKey] ?? "";
    return parent ? (optionGroups[field.key]?.[parent] ?? []) : [];
  }

  function parentLabel(field: FieldDef): string | undefined {
    const key = field.optionSource?.groupBy?.fieldKey;
    return key ? schema.fields.find((f) => f.key === key)?.label : undefined;
  }

  async function save(): Promise<boolean> {
    setSavingAction("record");
    setFormError(null);
    setErrors({});
    try {
      const url = isNew
        ? `/api/sheets/${schema.id}/records`
        : `/api/sheets/${schema.id}/records/${encodeURIComponent(record.id)}`;

      const payload = isNew
        ? { values, draftId: draft?.id }
        : {
            // Send only what actually changed, so a stale field in the form
            // cannot overwrite someone else's untouched column.
            values: Object.fromEntries(submittedKeys.map((k) => [k, values[k] ?? ""])),
            rev: record.rev,
            draftId: draft?.id,
          };

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();

      if (!res.ok) {
        if (body.fields) setErrors(body.fields);
        setFormError(body.error ?? "Save failed. Your changes are still here. Try again.");
        return false;
      }

      if (body.warnings && Object.keys(body.warnings).length) {
        setWarnings(body.warnings);
      }
      if (body.auditWarning) onWarning(body.auditWarning);
      if (body.draftWarning) onWarning(body.draftWarning);

      const id = body.record?.id ?? record?.id;
      onSaved(
        isNew
          ? `Created ${id}`
          : body.changed === 0
            ? "No changes to save"
            : `Updated ${id} · ${body.changed} ${body.changed === 1 ? "field" : "fields"}`,
        isNew ? (body.record as RecordRow | undefined) : undefined,
      );
      return true;
    } catch {
      setFormError("Save failed. Your changes are still here. Check your connection and try again.");
      return false;
    } finally {
      setSavingAction(null);
    }
  }

  async function saveForLater(): Promise<boolean> {
    setSavingAction("draft");
    setFormError(null);
    try {
      const res = await fetch(`/api/sheets/${schema.id}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft?.id,
          values,
          recordId: record?.id,
          recordRev: record?.rev,
          baseValues: record?.values,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Draft save failed. Your changes are still here. Try again.");
        return false;
      }
      onDraftSaved(
        draft ? "Saved changes for later" : "Saved as a draft for later",
      );
      return true;
    } catch {
      setFormError("Draft save failed. Your changes are still here. Check your connection and try again.");
      return false;
    } finally {
      setSavingAction(null);
    }
  }

  async function archive() {
    if (!record) return;
    setSavingAction("archive");
    setFormError(null);
    try {
      const res = await fetch(
        `/api/sheets/${schema.id}/records/${encodeURIComponent(record.id)}?reason=${encodeURIComponent(archiveReason)}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok) {
        setArchiveOpen(false);
        setFormError(body.error ?? "Archive failed. The record is still in the register. Try again.");
        return;
      }
      onSaved(`${record.id} moved to ${body.movedTo}`);
    } catch {
      setArchiveOpen(false);
      setFormError("Archive failed. The record is still in the register. Check your connection and try again.");
    } finally {
      setSavingAction(null);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <>
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next && !saving) requestClose();
        }}
      >
        <SheetContent
          side="right"
          // Match SheetContent's side-scoped position and size classes so
          // tailwind-merge replaces the drawer defaults predictably. The inset
          // floats the editor off all four edges; overflow-hidden keeps the
          // header and footer borders inside the rounded corners.
          className="gap-0 overflow-hidden rounded-xl border p-0 data-[side=right]:inset-3 data-[side=right]:h-auto data-[side=right]:w-auto data-[side=right]:max-w-none data-[side=right]:sm:inset-6 data-[side=right]:sm:max-w-none"
          onInteractOutside={(e) => {
            // Losing a half-finished record to a stray click is not recoverable.
            // The dialogs portal outside this sheet, so clicking either dialog
            // reads as an outside interaction and must not close the editor.
            if (dirty || archiveOpen || reviewAction) e.preventDefault();
          }}
        >
          <SheetHeader className="border-border gap-1 border-b px-5 py-4 pr-14 sm:px-6">
            <SheetTitle className="text-ink truncate text-lg font-semibold">
              {isDraft
                ? values[titleKeyOf(schema)] || `Saved ${schema.label} draft`
                : isNew
                  ? `New ${schema.label} record`
                : record.values[titleKeyOf(schema)] || record.id}
            </SheetTitle>
            <SheetDescription asChild>
              <p className="text-xs">
                {isDraft ? (
                  record
                    ? `Draft update for ${record.id}`
                    : `Draft ${schema.label} record`
                ) : isNew ? (
                  "The app assigns the record number when you create it"
                ) : (
                  <>
                    <span className="text-primary font-semibold">{record.id}</span>
                    <span className="text-muted-foreground"> · row {record.rowNumber}</span>
                  </>
                )}
              </p>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            {isDraft && (
              <Alert className="mb-5">
                <AlertDescription>
                  {record
                    ? "This draft changes only the fields you edited. If someone changed the source record after you saved this draft, the app will ask you to review it."
                    : "A draft can be incomplete. The app checks every required field when you create the record."}
                </AlertDescription>
              </Alert>
            )}
            {formError && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {errorCount > 0 && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>
                  Fix {errorCount} {errorCount === 1 ? "field" : "fields"} before
                  saving.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-8">
              {groups.map((group) => (
                <fieldset key={group.name}>
                  <legend className="text-foreground border-border mb-4 w-full border-b pb-2 text-sm font-semibold">
                    {group.name}
                  </legend>
                  <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                    {group.fields.map((f) => (
                      <FieldInput
                        key={f.key}
                        field={f}
                        value={values[f.key] ?? ""}
                        onChange={(next) => set(f.key, next)}
                        error={errors[f.key]}
                        warning={warnings[f.key]}
                        suggestions={optionsFor(f)}
                        locked={lockedKeys?.has(f.key)}
                        disabled={
                          !!f.optionSource?.groupBy &&
                          !(values[f.optionSource.groupBy.fieldKey] ?? "")
                        }
                        disabledHelp={`Choose ${parentLabel(f) ?? "the parent"} first.`}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {!isNew && !isDraft && canArchive && (
              <div className="border-destructive/25 bg-danger-surface/50 mt-9 flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">Archive this record</p>
                  <p className="text-muted-foreground text-xs text-pretty">
                    Moves the row into {schema.archiveSheetName}. Nothing is
                    deleted.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveOpen(true)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
                >
                  Archive
                </Button>
              </div>
            )}
          </div>

          <div className="border-border bg-card grid gap-3 border-t px-5 py-3.5 sm:grid-cols-[auto_1fr] sm:items-center sm:px-6">
            <span className="text-xs">
              {dirty ? (
                <span className="text-warn font-medium">
                  {unsavedKeys.length}{" "}
                  {unsavedKeys.length === 1 ? "field" : "fields"} unsaved
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {isDraft ? "Saved for later" : "No changes"}
                </span>
              )}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={requestClose}
              >
                {dirty ? "Discard" : "Close"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !dirty || (isNew && !hasDraftContent)}
                onClick={() => setReviewAction("draft")}
              >
                {savingAction === "draft" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Review draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  saving ||
                  (isNew ? !dirty && !isDraft : submittedKeys.length === 0)
                }
                onClick={() => setReviewAction("record")}
                className="col-span-2 sm:col-auto"
              >
                {savingAction === "record" && <Loader2 className="size-4 animate-spin" />}
                {savingAction === "record"
                  ? isNew
                    ? "Creating..."
                    : "Saving..."
                  : isNew
                    ? "Review record"
                    : "Review changes"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={reviewAction !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setReviewAction(null);
        }}
      >
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewAction === "draft"
                ? "Review draft changes"
                : isNew
                  ? `Review new ${schema.label} record`
                  : `Review ${reviewRows.length} ${reviewRows.length === 1 ? "change" : "changes"}`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {reviewAction === "draft"
                ? "Check these fields. Save draft stores them without changing the master register."
                : isNew
                  ? `Check these values. Create record writes them to ${schema.sheetName}.`
                  : isDraft
                    ? `Check each change. Apply changes writes them to ${schema.sheetName}.`
                    : `Check each change. Save changes writes them to ${schema.sheetName}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="border-border max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {reviewRows.map((row) => (
              <div key={row.key} className="px-3.5 py-3">
                <p className="text-foreground text-xs font-semibold">
                  {row.label}
                </p>
                {isNew ? (
                  <p className="text-muted-foreground mt-1.5 whitespace-pre-wrap break-words text-sm">
                    {row.next || "(blank)"}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-faint text-[0.7rem] font-medium">
                        Current
                      </p>
                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words text-sm">
                        {row.current || "(blank)"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-faint text-[0.7rem] font-medium">New</p>
                      <p className="text-foreground mt-1 whitespace-pre-wrap break-words text-sm font-medium">
                        {row.next || "(blank)"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              Back to editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async (event) => {
                event.preventDefault();
                const saved =
                  reviewAction === "draft"
                    ? await saveForLater()
                    : await save();
                if (!saved) setReviewAction(null);
              }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving
                ? "Saving..."
                : reviewAction === "draft"
                  ? "Save draft"
                  : isNew
                    ? "Create record"
                    : isDraft
                      ? "Apply changes"
                      : "Save changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {record?.id}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              The row moves out of {schema.sheetName} into{" "}
              {schema.archiveSheetName}, with your name and the reason attached.
              It stops appearing in search.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div>
            <Label htmlFor="archive-reason" className="text-xs font-medium">
              Reason
            </Label>
            <Input
              id="archive-reason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Duplicate of BR1204"
              className="mt-1.5"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setArchiveReason("")}>
              Keep record
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveReason.trim().length < 3 || saving}
              onClick={(e) => {
                e.preventDefault();
                void archive();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingAction === "archive" && <Loader2 className="size-4 animate-spin" />}
              Archive record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {closeGuard?.title ?? "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {closeGuard?.description ??
                `Your ${unsavedKeys.length} changed ${unsavedKeys.length === 1 ? "field" : "fields"} will not be saved.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={onClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closeGuard?.leaveLabel ?? "Discard changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
