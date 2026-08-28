import { readFileSync } from "node:fs";
import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    // Accept either the raw JSON or a base64 blob, since some hosts mangle
    // multi-line env values.
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text) as ServiceAccount;
  }

  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file && file.trim()) {
    return JSON.parse(readFileSync(file, "utf8")) as ServiceAccount;
  }

  throw new Error(
    "No service account configured. Set GOOGLE_SERVICE_ACCOUNT_JSON (production) " +
      "or GOOGLE_SERVICE_ACCOUNT_FILE (local dev).",
  );
}

let cached: sheets_v4.Sheets | null = null;

export function sheetsClient(): sheets_v4.Sheets {
  if (cached) return cached;
  const sa = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    // Env vars often carry literal \n rather than real newlines.
    key: sa.private_key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

export function spreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error("SPREADSHEET_ID is not set.");
  return id;
}
