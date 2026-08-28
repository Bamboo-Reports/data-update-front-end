import type { SheetSchema } from "./schema/types";
import { isCanonicalSheetDate, isLikelyUrl, parseYear } from "./format";

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
  }

  /* cross-field rules */

  const nameKey = schema.fields.find((f) => f.header === schema.titleHeader)?.key;
  // CM and SM legitimately hold many rows per company, so this only applies
  // where the schema says the name identifies the record.
  if (schema.titleUnique && nameKey && nameKey in values && opts.takenNames) {
    const name = (values[nameKey] ?? "").trim().toLowerCase();
    if (name && opts.takenNames.has(name)) {
      errors[nameKey] = "Another record already uses this legal name.";
    }
  }

  if (schema.id === "br") {
    const gcc = (merged.gccStatus ?? "").trim();
    const nonGccComment = (merged.nonGccComments ?? "").trim();
    if (gcc === "GCC" && nonGccComment && "nonGccComments" in values) {
      errors.nonGccComments = "Non GCC Comments only applies when GCC / Non GCC is 'Non GCC'.";
    }
    if (gcc === "Non GCC" && !nonGccComment && "gccStatus" in values) {
      warnings.nonGccComments = "Non GCC records usually carry a Non GCC Comment.";
    }

  }

  return { errors, warnings };
}
