/** Shared by the lookup UI and the records endpoint so the two cannot drift. */

/** Shortest search that is allowed to return records. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Hard ceiling on rows returned per request. The app is a lookup desk, not an
 * export, so no single call can pull down a meaningful slice of the sheet.
 */
export const MAX_PAGE_SIZE = 25;
