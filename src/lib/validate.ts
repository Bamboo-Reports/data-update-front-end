import type { SheetSchema } from "./schema/types";
import { containsUrl, isCanonicalSheetDate, isLikelyUrl, parseYear } from "./format";

/** Shape checks for `FieldDef.format`, kept beside the messages they produce. */
const FORMAT_RULES: Record<
  NonNullable<import("./schema/types").FieldDef["format"]>,
  { test: (value: string) => boolean; message: (label: string) => string }
> = {
  pincode6: {
    test: (v) => /^\d{6}$/.test(v),
    message: (label) => `${label} must be a 6-digit Indian PIN code.`,
  },
  linkedin: {
    test: (v) => v.toLowerCase().includes("linkedin.com"),
    message: (label) => `${label} must be a linkedin.com link.`,
  },
  digits: {
    // Sheets number-formats long phone numbers, so "4,068,181,301" is a
    // legitimate stored shape and the separators have to be accepted.
    test: (v) => /^[\d+][\d\s,()+-]*$/.test(v),
    message: (label) => `${label} must be a phone number: digits, spaces and + ( ) - only.`,
  },
};

/** The service-line columns; a services row needs at least one of them. */
const SERVICE_LINE_KEYS = [
  "it",
  "erd",
  "fna",
  "hr",
  "procurement",
  "salesMarketing",
  "customerSupport",
  "others",
] as const;

export interface ValidationOutcome {
  /** field key to message. Blocks the save. */
  errors: Record<string, string>;
  /** field key to message. Shown to the user but does not block. */
  warnings: Record<string, string>;
}

export interface ValidateOptions {
  /** The record as it exists today, when updating. Absent when creating. */
  current?: Record<string, string>;
  /** Every other record's value for the uniqueness check. */
  takenNames?: Set<string>;
  /** Live allowed values, keyed by field key, for fields backed by another tab. */
  allowedValues?: Record<string, ReadonlySet<string>>;
  /**
   * Listed spellings for creatable sourced fields, lower-cased, keyed by field
   * key. A value that differs from one of these only by case is rejected.
   */
  similarValues?: Record<string, ReadonlyMap<string, string>>;
}

/**
 * Validates a full or partial record. Only the keys present in `values` are
 * checked, so a partial update does not trip over untouched legacy data.
 */
export function validateRecord(
  schema: SheetSchema,
  values: Record<string, string>,
  opts: ValidateOptions = {},
): ValidationOutcome {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const merged = { ...(opts.current ?? {}), ...values };
  // Announced and upcoming centers can carry a future year.
  const thisYear = new Date().getFullYear();

  for (const field of schema.fields) {
    if (!(field.key in values)) continue;
    if (field.kind === "readonly" || field.computed) continue;

    const value = (values[field.key] ?? "").trim();

    if (field.required && value === "") {
      errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (value === "") continue;

    if (field.optionSource && !field.optionSource.creatable) {
      const allowed = opts.allowedValues?.[field.key];
      const isCurrent = opts.current?.[field.key] === value;
      if (!allowed?.has(value) && !isCurrent) {
        const parent = field.optionSource.groupBy
          ? schema.fields.find((f) => f.key === field.optionSource!.groupBy!.fieldKey)
          : undefined;
        errors[field.key] = parent
          ? `${field.label} must be one of the centers listed in ${field.optionSource.sheetName} for this ${parent.label}.`
          : `${field.label} must be a value listed in ${field.optionSource.sheetName}.`;
        continue;
      }
      if (!allowed?.has(value) && isCurrent) {
        warnings[field.key] =
          `"${value}" is no longer listed in ${field.optionSource.sheetName}. Choose a listed value if you change it.`;
      }
    }

    const similar = opts.similarValues?.[field.key]?.get(value.toLowerCase());
    if (similar && similar !== value) {
      errors[field.key] =
        `"${similar}" already exists with different casing. Pick it from the list so the records stay linked.`;
      continue;
    }

    // A link pasted into a prose column. Legacy values are warned about rather
    // than blocked, so an untouched bad cell cannot trap the rest of the form.
    if (field.noUrl && containsUrl(value)) {
      if (opts.current?.[field.key] === value) {
        warnings[field.key] = `${field.label} holds a link. It is meant to be text only.`;
      } else {
        errors[field.key] = `${field.label} must not contain a link.`;
        continue;
      }
    }

    if (field.maxLength && value.length > field.maxLength) {
      errors[field.key] =
        `${field.label} is ${value.length} characters; the limit is ${field.maxLength}.`;
      continue;
    }

    switch (field.kind) {
      case "number": {
        const n = Number(value.replace(/,/g, ""));
        if (!Number.isFinite(n)) {
          errors[field.key] = `${field.label} must be a number.`;
        } else if (n < 0) {
          errors[field.key] = `${field.label} cannot be negative.`;
        }
        break;
      }
      case "url": {
        if (!isLikelyUrl(value)) {
          errors[field.key] = `${field.label} does not look like a valid link.`;
        }
        break;
      }
      case "date": {
        if (!isCanonicalSheetDate(value)) {
          errors[field.key] =
            `${field.label} must be written like 7-August-2026: no leading zero, month in full, four-digit year.`;
        }
        break;
      }
      case "year": {
        const year = parseYear(value);
        if (year === null || year < 1900 || year > thisYear + 5) {
          errors[field.key] = `${field.label} must be a year between 1900 and ${thisYear + 5}.`;
        }
        break;
      }
      case "select": {
        const allowed = field.options ?? [];
        // A value already sitting in the sheet is accepted even if it is not a
        // canonical option, so editing another field cannot be blocked by
        // legacy data the team has not cleaned up yet.
        const isCurrent = opts.current?.[field.key] === value;
        if (allowed.length && !allowed.includes(value) && !isCurrent) {
          errors[field.key] = `${field.label} must be one of the listed options.`;
        } else if (allowed.length && !allowed.includes(value) && isCurrent) {
          warnings[field.key] =
            `"${value}" is not a standard ${field.label} value. Consider picking a listed option.`;
        }
        break;
      }
      default:
        break;
    }

    // Shape rules that sit on top of the kind check, so a value only reaches
    // this once it is already a well-formed number, URL and so on.
    const format = field.format ? FORMAT_RULES[field.format] : undefined;
    if (format && !errors[field.key] && !format.test(value)) {
      const isCurrent = opts.current?.[field.key] === value;
      if (isCurrent) {
        warnings[field.key] = format.message(field.label);
      } else {
        errors[field.key] = format.message(field.label);
      }
    }
  }

  /* cross-field rules */

  const nameKey = schema.fields.find((f) => f.header === schema.titleHeader)?.key;
  // centers and services legitimately hold many rows per company, so this only applies
  // where the schema says the name identifies the record.
  if (schema.titleUnique && nameKey && nameKey in values && opts.takenNames) {
    const name = (values[nameKey] ?? "").trim().toLowerCase();
    if (name && opts.takenNames.has(name)) {
      errors[nameKey] = "Another record already uses this legal name.";
    }
  }

  if (schema.id === "accounts") {
    const visibility = (merged.visibility ?? "").trim();
    const note = (merged.visibilityNote ?? "").trim();
    if (visibility === "GCC" && note && "visibilityNote" in values) {
      errors.visibilityNote = "Visibility Note only applies when Visibility is 'NON-GCC'.";
    }
    if (visibility === "NON-GCC" && !note && "visibility" in values) {
      warnings.visibilityNote = "NON-GCC accounts usually carry a Visibility Note.";
    }
  }

  // Every services row should describe at least one service line. Only raised
  // when the save actually touches a service column, so editing an address on
  // a row that was already empty does not nag about something else.
  if (schema.id === "services") {
    const touchesService = SERVICE_LINE_KEYS.some((key) => key in values);
    const anyFilled = SERVICE_LINE_KEYS.some((key) => (merged[key] ?? "").trim() !== "");
    if (touchesService && !anyFilled) {
      warnings.it =
        "This center has no service lines filled in. Add at least one, or the row records nothing.";
    }
  }

  return { errors, warnings };
}
