import { Skeleton } from "@/components/ui/skeleton";
import { ResultListSkeleton } from "@/components/skeletons";

/**
 * Mirrors the finder's layout so a register switch settles into place instead
 * of reflowing. Shown the moment navigation starts, which is why the switcher
 * no longer needs a blocking spinner.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-5xl px-4 pt-10 pb-24 sm:px-6 sm:pt-16"
    >
      <span className="sr-only" role="status">
        Loading register…
      </span>

      <div className="max-w-2xl">
        <Skeleton className="h-9 w-72 sm:h-10 sm:w-96" />
        <Skeleton className="mt-3 h-5 w-64 sm:w-80" />
      </div>

      <div className="mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row">
        <Skeleton className="h-12 min-w-0 flex-1 " />
        <Skeleton className="h-12 w-full sm:w-32" />
      </div>

      <div className="mt-3 flex max-w-3xl items-center justify-between gap-4">
        <Skeleton className="h-4 w-40 " />
        <Skeleton className="hidden h-4 w-48 sm:block" />
      </div>

      <div className="mt-8 max-w-3xl">
        <ResultListSkeleton rows={4} />
      </div>
    </main>
  );
}
