export type FieldKind =
  | "text"
  | "longtext"
  | "number"
  | "url"
  | "date"
  | "year"
  | "select"
  | "combo"
  | "readonly";

export interface FieldDef {
  /** Stable machine key used in API payloads and URLs. */
  key: string;
  /** Exact header text in the sheet's first row. Must match character for character. */
  header: string;
  /** Label shown in the UI. */
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Canonical choices for `select`. */
  options?: readonly string[];
  /**
   * Live choices read from another tab in the same spreadsheet. The editor
   * renders these as a dropdown and the API rejects values outside the list.
   */
  optionSource?: {
    sheetName: string;
    header: string;
    /**
     * Partition the choices by another column of the source tab, and show
     * only the partition matching this record's value for `fieldKey`. Used
     * for services' Center Name, which must be a center of the chosen account.
     */
    groupBy?: {
      header: string;
      fieldKey: string;
    };
    /**
     * The user may type a value that is not in the list yet. The list exists
     * to steer them to an existing spelling; a case-only variant of a listed
     * value is rejected.
     */
    creatable?: boolean;
  };
  /**
   * The column must stay prose: a pasted link is a mistake, not data. Mirrors
   * the ETL validator's "Can Have URL: No".
   */
  noUrl?: boolean;
  /**
   * An extra shape check beyond `kind`, applied once the kind check passes.
   * A string rather than a RegExp because the schema is serialised to the
   * client with the page.
   */
  format?: "pincode6" | "linkedin" | "digits";
  /** Form section this field lives under. */
  group: string;
  /** Helper text under the input. */
  help?: string;
  /** Show on the search result card. */
  inTable?: boolean;
  /**
   * The sheet computes this cell with a formula. The app shows it but never
   * writes it, because a plain value write would destroy the formula.
   */
  computed?: boolean;
  /**
   * The column is filled by a single array formula that lives in row 2 and
   * spills down the whole sheet (or is the neighbouring column that formula
   * spills into). Implies `computed`: never written. Unlike an ordinary
   * computed column its formula must not be copied into new rows, and its
   * cells outside row 2 hold no formula of their own.
   */
  spill?: boolean;
  /** Soft cap surfaced in the editor; not enforced by the sheet. */
  maxLength?: number;
}

export interface SheetSchema {
  id: string;
  sheetName: string;
  label: string;
  /** Header of the primary key column. */
  idHeader: string;
  /** New ids are `${idPrefix}${n}`. */
  idPrefix: string;
  /** Header used as the human-readable name of a record. */
  titleHeader: string;
  /**
   * Whether `titleHeader` must be unique. True for accounts, where one row is
   * one company. False for centers and services, where a company legitimately has many rows.
   */
  titleUnique: boolean;
  /** Extra headers shown under the name on a search result card. */
  subtitleHeaders?: readonly string[];
  /** Tab that archived rows are moved to. Created on demand. */
  archiveSheetName: string;
  groups: readonly string[];
  fields: readonly FieldDef[];
}

export function fieldByKey(schema: SheetSchema, key: string): FieldDef | undefined {
  return schema.fields.find((f) => f.key === key);
}

/** Values a `select` field will accept, including legacy variants already in the sheet. */
export function isKnownOption(field: FieldDef, value: string): boolean {
  if (!field.options) return true;
  return field.options.includes(value);
}

/**
 * Header-to-key lookups. These live here rather than in the sheets repo so
 * client components can use them without pulling googleapis into the bundle.
 */
export function keyForHeader(schema: SheetSchema, header: string): string | undefined {
  return schema.fields.find((f) => f.header === header)?.key;
}

export function titleKeyOf(schema: SheetSchema): string {
  return keyForHeader(schema, schema.titleHeader) ?? schema.fields[0].key;
}

export function subtitleKeysOf(schema: SheetSchema): string[] {
  return (schema.subtitleHeaders ?? [])
    .map((h) => keyForHeader(schema, h))
    .filter((k): k is string => !!k);
}

/** Numeric columns flagged for the result card, used for the figures column. */
export function figureFieldsOf(schema: SheetSchema): FieldDef[] {
  return schema.fields.filter((f) => f.inTable && f.kind === "number");
}
