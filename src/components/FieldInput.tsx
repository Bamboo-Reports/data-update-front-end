"use client";

import { useId } from "react";
import { Lock } from "lucide-react";
import type { FieldDef } from "@/lib/schema/types";
import { inputDateToSheet, sheetDateToInput, yearOptions } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import SearchableSelect from "./SearchableSelect";

export default function FieldInput({
  field,
  value,
  onChange,
  error,
  warning,
  suggestions,
  locked,
  disabled,
  disabledHelp,
}: {
  field: FieldDef;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  warning?: string;
  suggestions?: string[];
  /** Inherited from a parent record; shown but not editable. */
  locked?: boolean;
  /** Cannot be chosen yet, e.g. a center list before an account is picked. */
  disabled?: boolean;
  /** Replaces the help text while `disabled`. */
  disabledHelp?: string;
}) {
  const id = useId();
  const messageId = error
    ? `${id}-err`
    : warning
      ? `${id}-warn`
      : field.help
        ? `${id}-help`
        : undefined;

  const invalid = cn(
    error && "border-destructive focus-visible:ring-destructive/25",
    !error && warning && "border-warn focus-visible:ring-warn/25",
  );

  // A value already in the sheet that is not a canonical option still has to be
  // selectable, otherwise opening the form would silently change it.
  const options = field.optionSource ? (suggestions ?? []) : (field.options ?? []);
  // A combo backed by its own column (City, HQ State...) offers the values
  // already in the sheet and lets the user add one, through the same control
  // as every other dropdown rather than the browser's native datalist.
  const creatable = field.kind === "combo" && (!field.optionSource || !!field.optionSource.creatable);
  const isLegacy =
    value !== "" &&
    !creatable &&
    (field.optionSource !== undefined || options.length > 0) &&
    !options.includes(value);
  // A creatable field's new value has to appear in the list too, or the
  // trigger would show a value the listbox does not contain.
  const searchableOptions =
    isLegacy || (creatable && value !== "" && !options.includes(value))
      ? [value, ...options]
      : options;

  function control() {
    if (locked) {
      return (
        <Input
          id={id}
          value={value}
          readOnly
          aria-describedby={messageId}
          className="bg-muted text-foreground cursor-default font-medium"
        />
      );
    }

    if (field.computed) {
      return (
        <Input
          id={id}
          value={value}
          readOnly
          tabIndex={-1}
          aria-describedby={messageId}
          className="bg-muted text-muted-foreground cursor-default"
        />
      );
    }

    switch (field.kind) {
      case "readonly":
        return (
          <Input
            id={id}
            value={value}
            readOnly
            tabIndex={-1}
            className="bg-muted text-muted-foreground cursor-default text-sm font-medium"
          />
        );

      case "longtext":
        return (
          <Textarea
            id={id}
            value={value}
            rows={field.maxLength && field.maxLength > 600 ? 6 : 3}
            aria-describedby={messageId}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={cn("resize-y leading-relaxed", invalid)}
          />
        );

      case "select":
        return (
          <SearchableSelect
            id={id}
            label={field.label}
            value={value}
            options={searchableOptions}
            required={field.required}
            legacyValue={isLegacy ? value : undefined}
            describedBy={messageId}
            invalid={!!error}
            className={invalid}
            onChange={onChange}
          />
        );

      case "combo":
        return (
          <SearchableSelect
            id={id}
            label={field.label}
            value={value}
            options={searchableOptions}
            required={field.required}
            legacyValue={isLegacy ? value : undefined}
            describedBy={messageId}
            invalid={!!error}
            disabled={disabled}
            creatable={creatable}
            className={invalid}
            onChange={onChange}
          />
        );

      case "year": {
        const years = yearOptions();
        const legacyYear = value !== "" && !years.includes(value);
        return (
          <SearchableSelect
            id={id}
            label={field.label}
            value={value}
            options={legacyYear ? [value, ...years] : years}
            required={field.required}
            legacyValue={legacyYear ? value : undefined}
            describedBy={messageId}
            invalid={!!error}
            className={invalid}
            onChange={onChange}
          />
        );
      }

      case "date": {
        // Older rows hold shapes like "Apr-2026" that a date picker cannot
        // show. Surface the stored text so the blank picker is not mistaken
        // for an empty cell; picking a date replaces it.
        const unreadable = value !== "" && sheetDateToInput(value) === "";
        return (
          <>
            <Input
              id={id}
              type="date"
              value={sheetDateToInput(value)}
              aria-describedby={messageId}
              aria-invalid={!!error}
              onChange={(e) => onChange(inputDateToSheet(e.target.value))}
              className={invalid}
            />
            {unreadable && (
              <p className="text-warn mt-1.5 text-xs">
                Stored as &quot;{value}&quot;, which is not a full date. Pick a date to replace it.
              </p>
            )}
          </>
        );
      }

      case "number":
        return (
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            value={value}
            aria-describedby={messageId}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={invalid}
          />
        );

      case "url":
        return (
          <Input
            id={id}
            type="text"
            inputMode="url"
            value={value}
            aria-describedby={messageId}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={invalid}
          />
        );

      default:
        return (
          <Input
            id={id}
            type="text"
            value={value}
            aria-describedby={messageId}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={invalid}
          />
        );
    }
  }

  const helpText = locked
    ? "Carried over from the parent record. Edit it there to change it."
    : disabled
      ? disabledHelp
      : undefined;
  const overLimit = field.maxLength ? value.length > field.maxLength : false;
  const nearLimit = field.maxLength
    ? value.length > field.maxLength * 0.8
    : false;

  return (
    <div className={field.kind === "longtext" ? "sm:col-span-2" : undefined}>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <Label htmlFor={id} className="text-foreground text-xs font-medium">
          {(field.computed || locked) && (
            <Lock aria-hidden="true" className="text-faint size-3" />
          )}
          {field.label}
          {field.required && !field.computed && !locked && (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          )}
        </Label>
        {nearLimit && (
          <span
            className={cn(
              "ml-auto text-[0.7rem] tabular-nums",
              overLimit ? "text-destructive" : "text-faint",
            )}
          >
            {value.length}/{field.maxLength}
          </span>
        )}
      </div>

      {control()}

      {error && (
        <p id={`${id}-err`} className="text-destructive mt-1.5 text-xs">
          {error}
        </p>
      )}
      {!error && warning && (
        <p id={`${id}-warn`} className="text-warn mt-1.5 text-xs">
          {warning}
        </p>
      )}
      {!error && !warning && (helpText || field.help) && (
        <p id={`${id}-help`} className="text-faint mt-1.5 text-xs">
          {helpText ?? field.help}
        </p>
      )}
    </div>
  );
}
