"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The register tabs. Navigation feedback is deliberately quiet: the clicked tab
 * takes the selected style immediately and `[sheet]/loading.tsx` fills the body
 * with the finder's skeleton. An earlier version threw a blurred, full-screen
 * spinner over the app, which read as a stall rather than a page change.
 */
export default function RegisterSwitcher({
  sheets,
  active,
}: {
  sheets: Array<{ id: string; label: string }>;
  active: string;
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  // The server has answered once `active` catches up, so drop the optimistic
  // selection. This also clears it when the user navigates back.
  useEffect(() => setPendingTarget(null), [active]);

  const shown = pendingTarget ?? active;

  return (
    <nav
      className="scrollbar-none col-span-2 row-start-2 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 overflow-x-auto px-1 pt-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0 sm:pt-0"
      aria-label="Registers"
      aria-busy={pendingTarget !== null}
    >
      {sheets.map((sheet) => {
        const selected = sheet.id === shown;
        const loading = pendingTarget === sheet.id;
        return (
          <Link
            key={sheet.id}
            href={`/${sheet.id}`}
            prefetch
            aria-current={sheet.id === active ? "page" : undefined}
            onClick={() => setPendingTarget(sheet.id)}
            data-loading={loading || undefined}
            className={
              selected
                ? "bg-secondary text-foreground focus-visible:ring-ring data-loading:animate-pulse flex min-h-9 shrink-0 items-center px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-9 shrink-0 items-center px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
            }
          >
            {sheet.label}
          </Link>
        );
      })}
    </nav>
  );
}
