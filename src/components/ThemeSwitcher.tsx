"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

/**
 * Segmented light / dark / system control, shaped like the register tabs
 * beside it so the header reads as one family of controls.
 *
 * `system` is a first-class choice rather than a hidden default: the provider
 * starts there, and someone who has switched away needs a way back without
 * guessing which of light or dark their machine is currently on.
 */
export default function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored choice on the client, so the selected
  // segment is withheld until mount. The control keeps its full size
  // throughout, which is why this cannot shift the header around.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: ThemeValue | null = mounted ? ((theme as ThemeValue) ?? "system") : null;

  // Arrow keys move within a radio group; Tab moves past it. Without this the
  // group would swallow three separate tab stops in an already busy header.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !back) return;
    event.preventDefault();
    const index = OPTIONS.findIndex((o) => o.value === current);
    const from = index === -1 ? 0 : index;
    const next = OPTIONS[(from + (forward ? 1 : OPTIONS.length - 1)) % OPTIONS.length];
    setTheme(next.value);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-theme-option="${next.value}"]`)
      ?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      onKeyDown={onKeyDown}
      className={cn(
        "border-border/80 bg-muted/40 flex items-center gap-0.5 border p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-theme-option={value}
            // One stop for the whole group: the selected segment holds it, and
            // before mount the first segment does so focus is never lost.
            tabIndex={selected || (current === null && value === "light") ? 0 : -1}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              "focus-visible:ring-ring grid size-8 place-items-center outline-none transition-colors focus-visible:ring-2",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
