import { cn } from "@/lib/utils"

/**
 * Placeholder block. The shimmer lives in globals.css so it can respect
 * `prefers-reduced-motion`. `delay` staggers rows so a list reads as one
 * sweep rather than every bar flashing in unison.
 */
function Skeleton({
  className,
  delay = 0,
  style,
  ...props
}: React.ComponentProps<"div"> & { delay?: number }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-muted", className)}
      style={delay ? { animationDelay: `${delay}ms`, ...style } : style}
      {...props}
    />
  )
}

export { Skeleton }
