import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholders shaped like the real components they stand in for, so content
 * lands in place instead of reflowing. Shared by the route-level loading
 * screen and the in-page loading states.
 */

/** Mirrors `ResultCard` in RecordFinder: id badge, title + subtitle, figures, history column. */
export function ResultCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="bg-card flex min-h-20 items-stretch">
      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:gap-4">
        <Skeleton delay={delay} className="h-6 w-14 shrink-0 " />
        <div className="min-w-0 flex-1">
          <Skeleton delay={delay} className="h-4 w-[62%] max-w-72 " />
          <Skeleton delay={delay} className="mt-2 h-3 w-[38%] max-w-44 " />
        </div>
        <div className="hidden w-20 shrink-0 sm:block">
          <Skeleton delay={delay} className="ml-auto h-3 w-12 " />
          <Skeleton delay={delay} className="mt-2 ml-auto h-3 w-9 " />
        </div>
        <Skeleton delay={delay} className="size-4 shrink-0 rounded-full" />
      </div>
      <div className="border-border flex w-12 shrink-0 items-center justify-center border-l sm:w-20">
        <Skeleton delay={delay} className="h-3 w-3.5 sm:w-12" />
      </div>
    </div>
  );
}

export function ResultListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading records"
      className="divide-border divide-y overflow-hidden border"
    >
      {Array.from({ length: rows }, (_, i) => (
        <ResultCardSkeleton key={i} delay={i * 90} />
      ))}
    </div>
  );
}

/** Mirrors one entry in HistoryPanel: field + time, user, then old → new. */
export function HistoryEntrySkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <li className="bg-card px-4 py-4">
      <div className="flex items-baseline gap-2">
        <Skeleton delay={delay} className="h-3 w-24 " />
        <Skeleton delay={delay} className="ml-auto h-3 w-28 " />
      </div>
      <Skeleton delay={delay} className="mt-2 h-3 w-36 " />
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Skeleton delay={delay} className="h-8 " />
        <Skeleton delay={delay} className="size-3.5 rounded-full" />
        <Skeleton delay={delay} className="h-8 " />
      </div>
    </li>
  );
}

export function HistoryListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ol
      role="status"
      aria-label="Loading history"
      className="border-border divide-border overflow-hidden border"
    >
      {Array.from({ length: rows }, (_, i) => (
        <HistoryEntrySkeleton key={i} delay={i * 90} />
      ))}
    </ol>
  );
}

/** Thin indeterminate bar. Sits under an input while a refetch is in flight. */
export function ProgressLine({ active }: { active: boolean }) {
  return (
    <div
      data-slot={active ? "progress-line" : undefined}
      aria-hidden="true"
      className="bg-primary/15 pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
}
