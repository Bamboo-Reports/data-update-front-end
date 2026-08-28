"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SheetSchema } from "@/lib/schema/types";
import type { RecordRow } from "@/lib/sheets/repo";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import RecordEditor, { type CloseGuard } from "./RecordEditor";

/**
 * One link in the BR → CM → SM chain: which register to add to next, what it
 * inherits from the record just created, and whether the user may decline.
 *
 * The inherited names are copied from the saved row, never retyped, and the
 * editor shows them locked. That is the whole enforcement of the exact-match
 * rule: the user is not given a place to spell the name differently.
 */
export interface LinkedStep {
  target: "cm" | "sm";
  prefill: Record<string, string>;
  lockedKeys: string[];
  prompt: {
    title: string;
    description: string;
    confirmLabel: string;
    /** Present only when the step may be declined. */
    skipLabel?: string;
  };
  /** Shown if the user tries to close the editor before saving. */
  closeGuard?: CloseGuard;
}

const ACTIVE_CENTER = "Active Center";

/** The step that follows creating `created` in `schema`, or null at the end of the chain. */
export function nextLinkedStep(
  schema: SheetSchema,
  created: RecordRow,
): LinkedStep | null {
  const v = created.values;

  if (schema.id === "br") {
    const account = v.accountName ?? "";
    return {
      target: "cm",
      prefill: { accountName: account },
      lockedKeys: ["accountName"],
      prompt: {
        title: "Account created. Now add its first center.",
        description: `Every account needs at least one center. ${account} has none yet, so the next step is a CM record. The account name is carried over exactly as you entered it.`,
        confirmLabel: "Add first center",
      },
      closeGuard: {
        title: "Leave without a center?",
        description: `${account} has no center yet, and every account needs at least one. You can save this center as a draft and finish it later instead.`,
        leaveLabel: "Leave anyway",
      },
    };
  }

  if (schema.id === "cm") {
    const center = v.centerLegalName ?? "";
    const status = v.centerStatus ?? "";
    const active = status === ACTIVE_CENTER;
    const prefill = {
      accountName: v.accountName ?? "",
      centerLegalName: center,
      centerType: v.centerType ?? "",
      centerFocus: v.centerFocus ?? "",
      city: v.city ?? "",
    };
    const lockedKeys = ["accountName", "centerLegalName"];
    if (active) {
      return {
        target: "sm",
        prefill,
        lockedKeys,
        prompt: {
          title: `${center} is an active center, so it needs a Service Master record.`,
          description:
            "Add the SM record now. The account and center names are carried over from CM, and the center type, focus and city are filled in to match.",
          confirmLabel: "Add SM record",
        },
        closeGuard: {
          title: "Leave without services?",
          description: `${center} is an active center and needs a Service Master record. You can save the SM as a draft and finish it later instead.`,
          leaveLabel: "Leave anyway",
        },
      };
    }
    return {
      target: "sm",
      prefill,
      lockedKeys,
      prompt: {
        title: `Add services for ${center}?`,
        description: `${center} is ${status || "not yet active"}, so a Service Master record is optional. You can add one now or come back to it later.`,
        confirmLabel: "Add SM record",
        skipLabel: "No SM for this center",
      },
    };
  }

  return null;
}

interface Meta {
  schema: SheetSchema;
  suggestions: Record<string, string[]>;
  optionGroups: Record<string, Record<string, string[]>>;
}

interface Props {
  step: LinkedStep;
  canArchive: boolean;
  /** Called with the following step once this one's record is created. */
  onStep: (next: LinkedStep) => void;
  onDone: () => void;
}

export default function LinkedRecordFlow({ step, canArchive, onStep, onDone }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [phase, setPhase] = useState<"prompt" | "editor">("prompt");

  // The target register's schema and live option lists are loaded while the
  // prompt is on screen, so the editor opens with the fresh account and
  // center lists rather than waiting on a request after the click.
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setMetaError(null);
    (async () => {
      try {
        const res = await fetch(`/api/sheets/${step.target}/meta`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? "Could not load the next register.");
        setMeta(body as Meta);
      } catch (error) {
        if (!cancelled) {
          setMetaError(
            error instanceof Error ? error.message : "Could not load the next register.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, retry]);

  if (phase === "editor" && meta) {
    return (
      <RecordEditor
        schema={meta.schema}
        record={null}
        suggestions={meta.suggestions}
        optionGroups={meta.optionGroups}
        canArchive={canArchive}
        initialValues={step.prefill}
        lockedKeys={new Set(step.lockedKeys)}
        closeGuard={step.closeGuard}
        onClose={onDone}
        onSaved={(message, created) => {
          toast.success(message);
          const next = created ? nextLinkedStep(meta.schema, created) : null;
          if (next) {
            setPhase("prompt");
            onStep(next);
          } else {
            onDone();
          }
        }}
        onDraftSaved={(message) => {
          toast.success(message);
          onDone();
        }}
        onWarning={(message) => toast.warning(message)}
      />
    );
  }

  const skippable = !!step.prompt.skipLabel;

  return (
    <AlertDialog open>
      <AlertDialogContent
        // The mandatory steps have no cancel path, so Escape must not close
        // them either; the skippable one has an explicit decline button.
        onEscapeKeyDown={(event) => {
          if (!skippable) event.preventDefault();
          else onDone();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pretty">{step.prompt.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            {step.prompt.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {metaError && (
          <Alert variant="destructive">
            <AlertDescription>
              {metaError}{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setRetry((n) => n + 1)}
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          {skippable && (
            <AlertDialogCancel onClick={onDone}>{step.prompt.skipLabel}</AlertDialogCancel>
          )}
          <AlertDialogAction
            disabled={!meta}
            onClick={(event) => {
              event.preventDefault();
              if (meta) setPhase("editor");
            }}
          >
            {!meta && !metaError && <Loader2 className="size-4 animate-spin" />}
            {step.prompt.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
