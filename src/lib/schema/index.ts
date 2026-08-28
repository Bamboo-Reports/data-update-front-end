import { ACCOUNTS_SCHEMA } from "./accounts";
import { CENTERS_SCHEMA } from "./centers";
import { SERVICES_SCHEMA } from "./services";
import type { SheetSchema } from "./types";

/**
 * Every sheet the app is allowed to touch. Adding a register means adding a
 * schema file here; no route or component needs to change.
 *
 * "irxdx", "co-ordinates" and "micro-location" are deliberately absent: the
 * team maintains them by hand and the other tabs read them through formulas.
 */
export const SCHEMAS: Record<string, SheetSchema> = {
  accounts: ACCOUNTS_SCHEMA,
  centers: CENTERS_SCHEMA,
  services: SERVICES_SCHEMA,
};

export function getSchema(id: string): SheetSchema | null {
  return SCHEMAS[id.toLowerCase()] ?? null;
}

export const SCHEMA_LIST = Object.values(SCHEMAS);
