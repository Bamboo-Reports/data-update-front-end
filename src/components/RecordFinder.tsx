"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock3, FileClock, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  figureFieldsOf,
  subtitleKeysOf,
  titleKeyOf,
  type FieldDef,
  type SheetSchema,
} from "@/lib/schema/types";
import type { ListResult, RecordRow } from "@/lib/sheets/repo";
import type { DraftRecord } from "@/lib/drafts";
import { groupNumber } from "@/lib/format";
import { MAX_PAGE_SIZE, MIN_QUERY_LENGTH } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressLine, ResultListSkeleton } from "@/components/skeletons";
import RecordEditor from "./RecordEditor";
import HistoryPanel from "./HistoryPanel";
import LinkedRecordFlow, { nextLinkedStep, type LinkedStep } from "./LinkedRecordFlow";

interface Props {
  schema: SheetSchema;
  totalRecords: number;
  suggestions: Record<string, string[]>;
  optionGroups: Record<string, Record<string, string[]>>;
  canArchive: boolean;
  /** Loaded with the page; `null` means the server could not read them. */
  initialDrafts: DraftRecord[] | null;
}

type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; record: RecordRow }
  | { mode: "draft"; draft: DraftRecord }
  | null;

export default function RecordFinder({
  schema,
  totalRecords,
  suggestions,
  optionGroups,
  canArchive,
  initialDrafts,
}: Props) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [historyFor, setHistoryFor] = useState<RecordRow | null>(null);
  // The accounts → centers → services chain that follows a create, driven by LinkedRecordFlow.
  const [linkedStep, setLinkedStep] = useState<LinkedStep | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>(initialDrafts ?? []);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Bumped after a save so the visible cards refresh from the sheet.
  const [reloadToken, setReloadToken] = useState(0);
  const [draftReloadToken, setDraftReloadToken] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Guards against a slow response for an old query overwriting a newer one.
  const requestId = useRef(0);
  // Results by query, so backspacing through a search replays from memory
  // instead of hitting the server again. Cleared whenever the sheet changes.
  const resultCache = useRef(new Map<string, ListResult>());

  const searchable = debouncedQ.trim().length >= MIN_QUERY_LENGTH;

  const card = useMemo(
    () => ({
      titleKey: titleKeyOf(schema),
      subtitleKeys: subtitleKeysOf(schema),
      figures: figureFieldsOf(schema).slice(0, 2),
    }),
    [schema],
  );

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // The first render already has the server's copy; only refetch after a
    // save or when the server could not read the tab.
    if (draftReloadToken === 0 && initialDrafts !== null) return;
    let cancelled = false;
    setDraftsLoading(true);
    setDraftError(null);
    (async () => {
      try {
        const res = await fetch(`/api/sheets/${schema.id}/drafts`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(
            body.error ??
              "The app did not load your saved drafts. Refresh the page to try again.",
          );
        }
        setDrafts(body.drafts as DraftRecord[]);
      } catch (error) {
        if (!cancelled) {
          setDraftError(
            error instanceof Error
              ? error.message
              : "The app did not load your saved drafts. Refresh the page to try again.",
          );
        }
      } finally {
        if (!cancelled) setDraftsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schema.id, draftReloadToken, initialDrafts]);

  useEffect(() => {
    resultCache.current.clear();
  }, [schema.id, reloadToken]);

  useEffect(() => {
    if (q.trim().length < MIN_QUERY_LENGTH) {
      requestId.current += 1;
      setResult(null);
      setError(null);
      setLoading(false);
    }
    const t = setTimeout(() => setDebouncedQ(q), 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!searchable) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    const term = debouncedQ.trim();
    const cached = resultCache.current.get(term);
    if (cached) {
      setResult(cached);
      setCursor(-1);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const controller = new AbortController();

    (async () => {
      try {
        const sp = new URLSearchParams({
          q: term,
          pageSize: String(MAX_PAGE_SIZE),
          // Sorting by the record's own name column keeps centers and services sensible
          // too, where the title is the center rather than the company.
          sortBy: card.titleKey,
          sortDir: "asc",
        });
        const res = await fetch(`/api/sheets/${schema.id}/records?${sp}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (id !== requestId.current) return;
        if (!res.ok) throw new Error(body.error ?? "Search failed. Try again.");
        resultCache.current.set(term, body as ListResult);
        setResult(body as ListResult);
        setCursor(-1);
      } catch (err) {
        if (id !== requestId.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed. Try again.");
        setResult(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();
    // Abort the in-flight request when the query moves on, so a superseded
    // search stops occupying a connection the newer one could use.
    return () => controller.abort();
  }, [debouncedQ, searchable, schema.id, reloadToken, card.titleKey]);

  // "/" focuses the lookup from anywhere, the way a search-first tool should.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) === true;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const records = useMemo(() => result?.records ?? [], [result]);
  const matchingDrafts = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return drafts;
    return drafts.filter(
      (draft) =>
        draft.recordId?.toLowerCase().includes(query) ||
        Object.values(draft.values).some((value) =>
          value.toLowerCase().includes(query),
        ),
    );
  }, [drafts, q]);


  const openRecord = useCallback((record: RecordRow) => {
    setEditor({ mode: "edit", record });
  }, []);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
      return;
    }
    if (!records.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, records.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      openRecord(records[cursor] ?? records[0]);
    }
  }

  useEffect(() => {
    const active = resultsRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const truncated = result ? result.total > records.length : false;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-10 pb-24 sm:px-6 sm:pt-16">
      <div className="max-w-2xl">
        <h1 className="text-ink text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Find a record in {schema.label}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm text-pretty sm:text-base">
          Search by company, {schema.idPrefix} number, city, or website.
        </p>
      </div>

      <div className="mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          />
          <Input
            ref={inputRef}
            type="text"
            role="searchbox"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Adobe, BR46, Bengaluru..."
            aria-label={`Search ${schema.label} records`}
            className="bg-card h-12 pr-11 pl-12 text-base shadow-xs md:text-base"
          />
          {q && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="size-4" />
            </Button>
          )}
          <ProgressLine active={loading && result !== null} />
        </div>
        <Button
          size="lg"
          onClick={() => setEditor({ mode: "new" })}
          className="h-12 px-4 sm:self-stretch"
        >
          <Plus className="size-4" />
          New record
        </Button>
      </div>

      <div className="text-muted-foreground mt-3 flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <p>
          {totalRecords.toLocaleString()} records · {schema.fields.length} fields each
          {drafts.length > 0 ? ` · ${drafts.length} saved for later` : ""}
        </p>
        <p className="hidden sm:block">Use ↑ ↓ to browse · Enter to open</p>
      </div>

      <div
        className="mt-8 max-w-3xl"
        ref={resultsRef}
        aria-live="polite"
        aria-busy={loading}
      >
        {loading && <span className="sr-only">Searching records…</span>}
        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-danger-surface text-destructive border px-4 py-3 text-sm"
          >
            {error}
          </p>
        )}

        {draftError && (
          <p
            role="alert"
            className="border-warn/30 bg-card text-warn mb-5 border px-4 py-3 text-sm"
          >
            {draftError}
          </p>
        )}

        {matchingDrafts.length > 0 && (
          <section className="mb-6" aria-labelledby="saved-drafts-heading">
            <div className="mb-2 flex items-center gap-2">
              <FileClock aria-hidden="true" className="text-warn size-4" />
              <h2 id="saved-drafts-heading" className="text-foreground text-sm font-semibold">
                Saved for later
              </h2>
              <span className="text-muted-foreground text-xs">
                {matchingDrafts.length}
              </span>
            </div>
            <div className="border-warn/30 divide-border divide-y overflow-hidden border">
              {matchingDrafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  card={card}
                  onOpen={() => setEditor({ mode: "draft", draft })}
                />
              ))}
            </div>
          </section>
        )}

        {loading && !result && <ResultListSkeleton rows={3} />}

        {searchable && result && records.length === 0 && matchingDrafts.length === 0 && !loading && !draftsLoading && (
            <div className="border-border bg-card border px-6 py-10 text-center">
            <p className="text-ink text-sm font-medium">
              No record matches &quot;{debouncedQ.trim()}&quot;
            </p>
            <p className="text-muted-foreground mx-auto mt-1.5 max-w-xs text-sm text-pretty">
              Check the spelling or try the company&apos;s legal name. Create a new
              record if it is not in the register.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setEditor({ mode: "new" })}
            >
              <Plus className="size-4" />
              Add &quot;{debouncedQ.trim()}&quot;
            </Button>
          </div>
        )}

        {records.length > 0 && (
          <>
            <div
              className={
                loading
                  ? "divide-border divide-y overflow-hidden border opacity-60 transition-opacity"
                  : "divide-border divide-y overflow-hidden border transition-opacity"
              }
            >
              {records.map((r, i) => (
                <ResultCard
                  key={r.id}
                  record={r}
                  card={card}
                  active={i === cursor}
                  onOpen={() => openRecord(r)}
                  onHistory={() => setHistoryFor(r)}
                  onHover={() => setCursor(i)}
                />
              ))}
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              {truncated ? (
                <>
                  Showing {records.length} of {result?.total.toLocaleString()}{" "}
                  matches. Narrow the search to find the right one.
                </>
              ) : (
                <>
                  {records.length} {records.length === 1 ? "match" : "matches"}
                </>
              )}
            </p>
          </>
        )}

        {!searchable && !error && q.trim().length > 0 && (
          <p className="text-muted-foreground text-sm">
            Enter at least {MIN_QUERY_LENGTH} characters to search.
          </p>
        )}

        {!q && !error && !draftsLoading && drafts.length === 0 && (
          <div className="border-border/80 bg-card/60 border border-dashed px-5 py-8">
            <p className="text-foreground text-sm font-medium">Search by name or record number</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Results appear as you type. Press <kbd className="border-border bg-muted border px-1.5 py-0.5 text-xs">/</kbd> anytime to return here.
            </p>
          </div>
        )}
      </div>

      {editor && (
        <RecordEditor
          schema={schema}
          suggestions={suggestions}
          optionGroups={optionGroups}
          canArchive={canArchive}
          record={
            editor.mode === "edit"
              ? editor.record
              : editor.mode === "draft"
                ? recordFromDraft(editor.draft)
                : null
          }
          draft={editor.mode === "draft" ? editor.draft : null}
          onClose={() => setEditor(null)}
          onSaved={(message, created) => {
            setEditor(null);
            toast.success(message);
            // Re-run the current lookup so the cards reflect what was saved.
            setReloadToken((n) => n + 1);
            setDraftReloadToken((n) => n + 1);
            if (created) setLinkedStep(nextLinkedStep(schema, created));
          }}
          onDraftSaved={(message) => {
            setEditor(null);
            toast.success(message);
            setDraftReloadToken((n) => n + 1);
          }}
          onWarning={(message) => toast.warning(message)}
        />
      )}

      {linkedStep && (
        <LinkedRecordFlow
          step={linkedStep}
          canArchive={canArchive}
          onStep={setLinkedStep}
          onDone={() => {
            setLinkedStep(null);
            // The chain may have written to this register (centers page → new center).
            setReloadToken((n) => n + 1);
            setDraftReloadToken((n) => n + 1);
          }}
        />
      )}

      {historyFor && (
        <HistoryPanel
          schema={schema}
          record={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </main>
  );
}

function recordFromDraft(draft: DraftRecord): RecordRow | null {
  if (!draft.recordId || !draft.recordRev) return null;
  return {
    id: draft.recordId,
    rowNumber: 0,
    rev: draft.recordRev,
    values: draft.baseValues ?? {},
  };
}

function DraftCard({
  draft,
  card,
  onOpen,
}: {
  draft: DraftRecord;
  card: CardShape;
  onOpen: () => void;
}) {
  const title = draft.values[card.titleKey]?.trim() || "Untitled draft";
  const subtitle = card.subtitleKeys
    .map((key) => draft.values[key])
    .filter((value) => value?.trim())
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card hover:bg-muted/70 focus-visible:ring-ring relative flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset sm:gap-4"
    >
      <span className="border-warn/40 text-warn shrink-0 border px-2 py-1 text-xs font-semibold">
        {draft.recordId ?? "Draft"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm font-semibold">
          {title}
        </span>
        <span className="text-muted-foreground mt-1 block truncate text-xs">
          {subtitle ? `${subtitle} · ` : ""}saved by {draft.updatedBy}
        </span>
      </span>
      <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
        {new Date(draft.updatedAt).toLocaleDateString()}
      </span>
      <ArrowRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}

interface CardShape {
  titleKey: string;
  subtitleKeys: string[];
  figures: FieldDef[];
}

function ResultCard({
  record,
  card,
  active,
  onOpen,
  onHistory,
  onHover,
}: {
  record: RecordRow;
  card: CardShape;
  active: boolean;
  onOpen: () => void;
  onHistory: () => void;
  onHover: () => void;
}) {
  const v = record.values;
  const subtitle = card.subtitleKeys
    .map((k) => v[k])
    .filter((x) => x && x.trim() !== "")
    .join(" · ");

  return (
    <div
      data-active={active}
      onMouseEnter={onHover}
      className="group bg-card data-[active=true]:bg-accent/70 flex min-h-20 items-stretch transition-colors"
    >
      <button
        type="button"
        onClick={onOpen}
        className="focus-visible:ring-ring relative flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset sm:gap-4"
      >
        <span className="accession bg-accent text-accent-foreground shrink-0 px-2 py-1 text-xs">
          {record.id}
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-sm font-semibold">
            {v[card.titleKey] || "(unnamed)"}
          </span>
          {subtitle && (
            <span className="text-muted-foreground mt-1 block truncate text-xs">
              {subtitle}
            </span>
          )}
        </span>

        {card.figures.length > 0 && (
          <span className="hidden w-20 shrink-0 text-right sm:block">
            {card.figures.map((f, i) => (
              <span
                key={f.key}
                className={
                  i === 0
                    ? "figure text-ink block text-xs"
                    : "figure text-muted-foreground mt-1 block text-xs"
                }
              >
                {v[f.key] ? groupNumber(v[f.key]) : "\u2014"}
              </span>
            ))}
          </span>
        )}
        <ArrowRight
          aria-hidden="true"
          className="text-muted-foreground ml-auto size-4 shrink-0"
        />
      </button>

      <button
        type="button"
        onClick={onHistory}
        aria-label={`View history for ${record.id}`}
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring relative flex w-12 shrink-0 items-center justify-center gap-1 border-l text-xs outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset sm:w-20"
      >
        <Clock3 className="size-3.5" />
        <span className="hidden sm:inline">History</span>
      </button>
    </div>
  );
}
