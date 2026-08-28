import { BR_SCHEMA } from "./br";
import { CM_SCHEMA } from "./cm";
import { SM_SCHEMA } from "./sm";
import type { SheetSchema } from "./types";

/**
 * Every sheet the app is allowed to touch. Adding CM or SM means adding a
 * schema file here; no route or component needs to change.
 *
 * "Microlocations" is deliberately absent: the team maintains it by hand.
 */
export const SCHEMAS: Record<string, SheetSchema> = {
  br: BR_SCHEMA,
  cm: CM_SCHEMA,
  sm: SM_SCHEMA,
};

export function getSchema(id: string): SheetSchema | null {
  return SCHEMAS[id.toLowerCase()] ?? null;
}

export const SCHEMA_LIST = Object.values(SCHEMAS);
