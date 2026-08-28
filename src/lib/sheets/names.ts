import { distinctValues, titleKey } from "./repo";
import type { SheetSchema } from "../schema/types";

/**
 * Lower-cased legal names already in use, for the uniqueness check.
 * `exceptId` lets a record keep its own name while being edited.
 */
export async function listAllNames(
  schema: SheetSchema,
  exceptName?: string,
): Promise<Set<string>> {
  const names = await distinctValues(schema, titleKey(schema));
  const set = new Set(names.map((n) => n.trim().toLowerCase()));
  if (exceptName) set.delete(exceptName.trim().toLowerCase());
  return set;
}

