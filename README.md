# Bamboo Reports Updater

A controlled editing surface for the `CM/SM-Centers Master` Google Sheet, so the
team can add, update and archive records without being given edit access to the
spreadsheet itself.

**BR**, **CM** and **SM** are all wired up. **Microlocations and Hub Structure
are deliberately out of scope** — the team maintains Microlocations by hand, and
both are read by formulas in the other sheets, so the app never writes to either.

| Register | Rows | Columns | Id | One row is |
| --- | --- | --- | --- | --- |
| BR | 2,708 | 41 | `BR…` | one company |
| CM | 6,420 | 41 | `CN…` | one center |
| SM | 6,372 | 34 | `CN…` | one center's service lines |

CM and SM both number their rows `CN2`, `CN3`… despite the tab names, and in both
a company legitimately owns many rows — so the legal-name uniqueness check
applies to BR only.

## How it works

The browser never talks to Google. Every read and write goes through this app's
API routes, which authenticate to Sheets with a service account. The team
authenticates to the *app* with Google Sign-In restricted to your domain, so the
spreadsheet stays shared with exactly one identity: the service account.

```
Browser  ->  Next.js API (service account)  ->  Google Sheets
   |
Google Sign-In, restricted to ALLOWED_EMAIL_DOMAINS
```

### It is a lookup desk, not a spreadsheet

The app deliberately never shows the dataset. There is no table and no browse
view. An analyst either searches for a record and opens it, or creates a new
one. Handing over a scrollable copy of all 2,708 rows would defeat the reason
for not sharing the sheet in the first place.

Incomplete new entries and unfinished updates to existing records can be **saved
for later**. They live in a separate hidden `_Drafts` tab rather than BR, CM or
SM, so incomplete data never enters a master register or triggers its formulas.
Authenticated updater users can reopen shared drafts from the search screen.
Completing a new-record draft runs normal validation; applying an update draft
keeps the source record's revision check. Either action removes the completed
draft.

That rule is enforced on the server, not just hidden in the UI:

- `GET /api/sheets/:sheet/records` **requires** a search term of at least
  `MIN_QUERY_LENGTH` characters and returns 400 without one.
- Page size is capped at `MAX_PAGE_SIZE` rows per request.
- Both constants live in `src/lib/search.ts` so the UI and the endpoint cannot
  drift apart.

This stops casual bulk copying. It is not a defence against a determined signed-in
user, who could still page through many searches — that risk is handled by named
accounts and the audit log, not by the API.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then fill in `.env.local`:

| Variable | What it does |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to the service-account JSON. Local dev only. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The JSON itself (raw or base64). Use this in production instead of the file. |
| `SPREADSHEET_ID` | The master sheet id. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | OAuth web client, from [Cloud Console credentials](https://console.cloud.google.com/apis/credentials). |
| `AUTH_SECRET` | `openssl rand -base64 32`. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated. **Empty means nobody can sign in**, not everybody. |
| `ADMIN_EMAILS` | Comma-separated. Only these may archive. Empty means any signed-in user may. |
| `DEV_AUTH_BYPASS` | `1` skips sign-in. Ignored when `NODE_ENV=production`. |

The service account (`br-ingest-five@bamboo-reports.iam.gserviceaccount.com`)
needs **Editor** access on the spreadsheet.

### Creating the OAuth client

1. Cloud Console > APIs & Services > Credentials > Create OAuth client ID > Web application.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   for local dev, and `https://<your-domain>/api/auth/callback/google` for production.
3. Copy the client id and secret into `.env.local`.

Once that is done, set `DEV_AUTH_BYPASS=0`.

## What the app guarantees

**Writes cannot land in the wrong column.** On every page load the app compares
the sheet's real header row against the schema. If a column has been renamed,
reordered or inserted, the editor refuses to open and tells you which column
drifted. This caught a real mistake during development.

**Concurrent edits cannot silently clobber each other.** Each record carries a
fingerprint of the row as it was read. Saving sends that fingerprint back; if the
row changed in the meantime the save is rejected with a 409 and the user is asked
to reload. Additionally, only the fields the user actually changed are sent, so
two people editing different columns of the same row do not overwrite each other.

**Cell types are preserved.** Numeric columns are written as numbers (keeping the
sheet's `#,##0` formatting), and date columns stay text in the sheet's
`d-MMMM-yyyy` shape rather than being coerced into a Google date.

**Formulas are never overwritten.** See [Formula columns](#formula-columns).

**No master record is ever simply deleted.** Archiving copies the row to `BR_Archive` *first*,
then removes it from `BR`. If the copy fails, the original is untouched. A reason
is required.

**Every change is logged.** A hidden `_AuditLog` tab records one row per changed
field: timestamp, user, sheet, action, record id and name, field, old value, new
value. The per-record History panel reads from it. If the audit write fails the
edit still succeeds and the user is warned — the log is never a reason to lose
someone's work.

## Formula columns

Thirteen columns across the three sheets are **formulas, not data**:

| Sheet | Column | Source |
| --- | --- | --- |
| BR | `HQ Revenue Range` | banded from `HQ Revenue` |
| BR | `HQ Employee Range` | banded from `HQ Employee Count` |
| BR | `First Center`, `Center Type Priority` | `VLOOKUP` into CM |
| BR | `Hub Structure`, `Primary Location` | `VLOOKUP` into Hub Structure |
| CM | `CN CONCATENATE`, `CN Unique Key` | built from the identity columns |
| CM | `Microlocation` | `VLOOKUP` into Microlocations |
| CM | `First Center`, `Center Type Priority` | computed across the company's centers |
| SM | `CN CONCATENATE`, `CN Unique Key` | built from the identity columns |

They are marked `computed: true` in the schema, which means:

- The editor shows them with a lock and will not let you type into them.
- Saving writes **only the runs of columns between them** (`values.batchUpdate`
  with one range per run), so a save can never flatten a formula into text.
- The API rejects a value for a computed column even if the payload contains one.
- Creating a record appends the row with those cells blank, then copies the
  formulas down from row 2 with a `copyPaste` / `PASTE_FORMULA` request. Sheets
  translates the relative references, so the new row calculates like every other.
- `GET /api/health` samples rows and reports any column that gained or lost a
  formula, because either direction is dangerous.

To change a computed value, change what feeds it. Revenue Range moves when you
edit the revenue; BR's Center Type Priority moves when you edit the centers in CM.

## Data validation

The sheets carry no data-validation rules of their own, so the app supplies them.
The canonical option lists in `src/lib/schema/*.ts` were derived from the existing
rows.

**Existing non-standard values are preserved.** If a row already holds `1Bn-5Bn`
(no spaces) the editor offers it as "existing value" and keeps it unless someone
picks a canonical option. Opening a record never silently rewrites it.

### Known issues in the current data

The app does not touch these on its own.

**BR has formula cells that were overwritten by hand at some point.** Those rows
show a stale value that no longer tracks its inputs. Fixing them means copying
the formula back down that column:

| Column | Rows overwritten |
| --- | --- |
| `HQ Revenue Range` | 23 |
| `HQ Employee Range` | 23 |
| `Center Type Priority` | 9 |
| `First Center` | 8 |
| `Hub Structure` | 4 |
| `Primary Location` | 4 |

CM and SM are clean: every formula cell in both still holds its formula.

**Inconsistent values in free-choice columns:**

| Sheet | Column | Issue |
| --- | --- | --- |
| BR | `Primary Category` | `IT Service` vs `IT Services`, `Healthcare Life Sciences & Pharma` vs `Pharma & Life Sciences` |
| BR | `Primary Nature` | `Manufacturing` vs `Manufacturer`, `Retail` vs `Retailer` |
| BR | `HQ FY End` | one row holds `2025` instead of a month |
| CM | `Country` | `India` and `india` both appear |
| CM | `JV Status` | three rows hold the literal text `JV Status` |

**Two sheet headers are misspelled** — `Center Foucs` in CM, and
`Primary Serivces Foucs` in SM. The schema matches them character for character
because it has to; the UI shows the corrected label. If you fix the headers in
the sheet, update `header` in the matching schema file at the same time or the
app will refuse to open that register.

## Design system

Built on [shadcn/ui](https://ui.shadcn.com) (radix-nova style). Primitives live
in `src/components/ui/` and are yours to edit; app components sit alongside them.

**Type.** DM Sans is used throughout the interface. Two utility classes retain
useful numeric behavior without changing typeface:

- `.accession` — BRUIDs, letterspaced. The same mark follows a record from the
  search result to the editor header to its history.
- `.figure` — revenue, headcount, timestamps. Tabular so digits align between
  stacked cards.

**Colour.** The Bamboo Reports blue, navy, orange and cool-neutral palette is
defined at the top of `src/app/globals.css` and mapped onto shadcn's tokens:

| Name | Role |
| --- | --- |
| `paper` | page ground, a cool grey rather than cream |
| `card` | the pulled record |
| `ink` | body text and the top rail |
| `pine` | Bamboo blue; every primary action (`--primary`, `--ring`) |
| `ochre` | Bamboo orange; unsaved state and soft warnings (`--warn`) |
| `garnet` | archiving and validation failures (`--destructive`) |

Blue carries the primary-action role so garnet stays unambiguously destructive
and orange stays unambiguously "check this".

Dark mode is a `.dark` class driven by `next-themes` on `system` by default.

Motion is kept minimal, and `prefers-reduced-motion` is respected.

## Adding another sheet

1. Write `src/lib/schema/<name>.ts` following the existing three. **The `fields` array must be
   in the sheet's exact column order** — the `group` property drives form layout
   independently, so grouping never dictates ordering.
2. Mark every formula column `computed: true`.
3. Register it in `src/lib/schema/index.ts`.

No routes or components change. The register switcher, lookup, editor, archive
and audit log all read from the schema. `GET /api/health` will verify the new
schema against the real headers.

## Operational notes

- **Row data is cached in-process for 30 seconds** to keep the app responsive
  over ~2,700 rows. Writes invalidate it immediately, and every write re-reads
  from the sheet first, so a stale cache can never cause a bad write.
- **New id assignment is serialised per process.** Running more than one
  instance reopens a small race window where two simultaneous creates could
  claim the same `BRUID`. For a team of this size a single instance is fine; if
  you scale out, move id assignment behind a lock.
- **Google Sheets API quota** is 300 requests/minute/project. Normal editing is
  nowhere near it.
- `GET /api/health` returns 503 with details when a schema and its sheet disagree.

## Scripts

```bash
npm run dev        # localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```
