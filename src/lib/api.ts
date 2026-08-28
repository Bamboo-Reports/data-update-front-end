import { NextResponse } from "next/server";
import { ConflictError, NotFoundError, ValidationError } from "./sheets/repo";
import { ForbiddenError, UnauthorizedError } from "./session";
import { LockTimeoutError } from "./cache";

export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}

/**
 * Turns thrown domain errors into the right status code. Anything unrecognised
 * is logged and reported as a generic 500 so internal detail (sheet ranges,
 * credentials paths) never reaches the browser.
 */
export function errorResponse(err: unknown): NextResponse<ApiError> {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof LockTimeoutError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message, fields: err.fields }, { status: 422 });
  }

  console.error("[api] unhandled error", err);
  const message =
    err instanceof Error && /SPREADSHEET_ID|service account/i.test(err.message)
      ? err.message
      : "Google Sheets did not respond. Try again.";
  return NextResponse.json({ error: message }, { status: 500 });
}
