export interface DraftRecord {
  id: string;
  sheet: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  values: Record<string, string>;
  /** Present when this draft is a deferred update to an existing record. */
  recordId?: string;
  recordRev?: string;
  baseValues?: Record<string, string>;
}
