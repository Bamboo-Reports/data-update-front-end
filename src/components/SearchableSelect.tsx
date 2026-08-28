"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 200;

interface SearchableSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  required?: boolean;
  legacyValue?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
  /** Offers "Add ..." for a typed value not in the list. */
  creatable?: boolean;
}

export default function SearchableSelect({
  id,
  label,
  value,
  options,
  required,
  legacyValue,
  describedBy,
  invalid,
  disabled,
  className,
  onChange,
  creatable,
}: SearchableSelectProps) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  const filteredOptions = useMemo(() => {
    const needle = debouncedQuery.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.toLocaleLowerCase().includes(needle),
    );
  }, [debouncedQuery, options]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setDebouncedQuery("");
    }
  }

  function choose(next: string) {
    onChange(next);
    changeOpen(false);
  }

  function focusFirstOption() {
    listRef.current?.querySelector<HTMLButtonElement>("[data-option]")?.focus();
  }

  function moveOptionFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-option]") ?? [],
    );
    const current = items.indexOf(event.currentTarget);
    const next = items[current + direction];
    if (next) {
      event.preventDefault();
      next.focus();
    } else if (direction === -1) {
      event.preventDefault();
      searchRef.current?.focus();
    }
  }

  const filtering = query !== debouncedQuery;

  // A typed name that matches an option only by case is a typo, so the list
  // steers to the listed spelling instead of offering to add a variant.
  const typed = debouncedQuery.trim();
  const caseMatch =
    creatable && typed
      ? options.find(
          (option) =>
            option !== typed && option.toLocaleLowerCase() === typed.toLocaleLowerCase(),
        )
      : undefined;
  const canCreate =
    !!creatable && !filtering && !!typed && !caseMatch && !options.includes(typed);

  return (
    <Popover modal open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "w-full justify-between bg-transparent px-2.5 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate" title={value || undefined}>
            {value || "Select..."}
          </span>
          <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="border-border relative border-b p-1.5">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusFirstOption();
              } else if (
                event.key === "Enter" &&
                !filtering &&
                filteredOptions.length === 1
              ) {
                event.preventDefault();
                choose(filteredOptions[0]);
              } else if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                choose(typed);
              }
            }}
            aria-label={`Search ${label}`}
            aria-controls={listId}
            autoComplete="off"
            placeholder={creatable ? "Search or type a new name..." : "Search options..."}
            className="pl-8"
          />
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className={cn(
            "max-h-56 overflow-y-auto overscroll-contain p-1 transition-opacity",
            filtering && "opacity-60",
          )}
        >
          {!debouncedQuery.trim() && (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              data-option
              onClick={() => choose("")}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") moveOptionFocus(event, 1);
                if (event.key === "ArrowUp") moveOptionFocus(event, -1);
              }}
              className="focus:bg-accent focus:text-accent-foreground relative flex w-full items-center rounded-md py-1.5 pr-8 pl-2 text-start text-sm outline-none"
            >
              <span className="text-muted-foreground">
                {required ? "Select..." : "Leave blank"}
              </span>
              <Check
                aria-hidden="true"
                className={cn(
                  "absolute right-2 size-4",
                  value === "" ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          )}

          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              data-option
              onClick={() => choose(option)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") moveOptionFocus(event, 1);
                if (event.key === "ArrowUp") moveOptionFocus(event, -1);
              }}
              className="focus:bg-accent focus:text-accent-foreground relative flex w-full items-center rounded-md py-1.5 pr-8 pl-2 text-start text-sm outline-none"
            >
              <span className="min-w-0 break-words">
                {option}
                {legacyValue === option && " (existing value)"}
              </span>
              <Check
                aria-hidden="true"
                className={cn(
                  "absolute right-2 size-4",
                  value === option ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              data-option
              onClick={() => choose(typed)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") moveOptionFocus(event, 1);
                if (event.key === "ArrowUp") moveOptionFocus(event, -1);
              }}
              className="focus:bg-accent focus:text-accent-foreground border-border relative mt-1 flex w-full items-center rounded-md border-t py-1.5 pr-8 pl-2 text-start text-sm outline-none"
            >
              <Plus aria-hidden="true" className="text-muted-foreground mr-1.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                Add &quot;{typed}&quot; as a new {label.toLocaleLowerCase()}
              </span>
            </button>
          )}

          {caseMatch && (
            <p className="text-warn px-3 py-2 text-xs text-pretty">
              &quot;{caseMatch}&quot; already exists with different casing. Pick it
              above to keep the records linked.
            </p>
          )}

          {!filtering && filteredOptions.length === 0 && !canCreate && !caseMatch && (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              {typed
                ? creatable
                  ? `No existing ${label.toLocaleLowerCase()} matches "${typed}".`
                  : `No options match "${typed}".`
                : "No options available."}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
