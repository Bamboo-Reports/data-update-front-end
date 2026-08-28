# Bamboo Reports Updater

A controlled editing surface for the centers master Google Sheet, so the team
can add, update and archive records without being given edit access to the
spreadsheet itself.

**accounts**, **centers** and **services** are all wired up. **irxdx,
co-ordinates and micro-location are deliberately out of scope** — the team
maintains them by hand, and the three registers read them through formulas, so
the app never writes to any of them.

| Register | Rows | Columns | Id | One row is |
| --- | --- | --- | --- | --- |
| accounts | 2,708 | 46 | `BR…` | one company |
| centers | 6,420 | 43 | `CN…` | one center |
| services | 6,372 | 33 | `CN…` | one center's service lines |

centers and services both number their rows `CN2`, `CN3`…, and in both a company
legitimately owns many rows — so the legal-name uniqueness check applies to
accounts only.

Column headers are snake_case (`account_global_legal_name`, `center_name`…) and
each schema in `src/lib/schema/` lists its columns in sheet order, because the
repo maps fields to columns by position. Columns filled by a single array
formula in row 2 (`lat`, `lng`, `center_services`) are marked `spill`: the app
never writes them and never copies their formula into new rows.

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
for later**. They live in a separate hidden `_Drafts` tab rather than accounts, centers
or services, so incomplete data never enters a master register or triggers its formulas.
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

**No master record is ever simply deleted.** Archiving copies the row to `accounts_archive` *first*,
then removes it from `accounts`. If the copy fails, the original is untouched. A reason
is required.

**Every change is logged.** A hidden `_AuditLog` tab records one row per changed
field: timestamp, user, sheet, action, record id and name, field, old value, new
value. The per-record History panel reads from it. If the audit write fails the
edit still succeeds and the user is warned — the log is never a reason to lose
someone's work.

## Formula columns

Twenty-four columns across the three sheets are **formulas, not data**:

| Sheet | Column | Source |
| --- | --- | --- |
| accounts | `account_hq_industry`, `account_primary_category`, `account_primary_nature` | `VLOOKUP` into irxdx |
| accounts | `account_hq_revenue_range` | banded from `account_hq_revenue` |
| accounts | `account_hq_employee_range` | banded from `account_hq_employee_count` |
| accounts | `account_center_employees`, `account_center_employees_range` | summed from centers |
| accounts | `years_in_india`, `account_first_center_year` | derived from centers |
| centers | `cn_unique_merge`, `cn_unique_key` | built from the identity columns |
| centers | `center_timeline` | banded from the incorporation / announced year |
| centers | `center_account_website` | `VLOOKUP` into accounts |
| centers | `center_micro_location` | `VLOOKUP` into micro-location |
| centers | `lat`, `lng` | one `ARRAYFORMULA` in row 2, via co-ordinates (`spill`) |
| centers | `center_employees`, `center_employees_range` | derived from the headcount columns |
| centers | `center_services` | one `LET` in row 2, summarising services (`spill`) |
| centers | `center_first_year` | computed across the account's centers |
| services | `cn_unique_merge`, `cn_unique_key` | built from the identity columns |

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
edit the revenue; an account's first center year moves when you edit its centers.

## Data validation

The sheets carry no data-validation rules of their own, so the app supplies them.
The canonical option lists in `src/lib/schema/*.ts` follow the ETL validator at
`etl/data_validator/validate.py` in the `bamboo-reports` repo, which is the
team's source of truth for the allowed vocabulary — not merely what the current
rows happen to contain.

**Invisible characters are stripped on save.** Zero-width spaces, joiners,
BOMs, soft hyphens and bidi controls arrive by copy-paste from websites and
PDFs. They render as nothing but break the `cn_unique_key` joins between the
registers, so every value is cleaned on the way in (`stripInvisible` in
`src/lib/format.ts`) rather than reported afterwards.

**Prose columns reject links.** Columns the ETL validator marks "Can Have URL:
No" carry `noUrl: true` and refuse a pasted link. A link already sitting in such
a cell is warned about, not blocked, so it cannot trap an unrelated edit.

**Extra shape rules.** `format: "pincode6" | "linkedin" | "digits"` on a field
adds a check on top of its `kind`: 6-digit PIN codes on `center_zip_code`, a
`linkedin.com` host on the two LinkedIn columns, and digits-only boardlines.

**A services row needs at least one service line.** Saving one with all eight
`service_*` columns empty warns; it does not block, since the row may be filled
in over several sittings.

**Existing non-standard values are preserved.** If a row already holds `1Bn-5Bn`
(no spaces) the editor offers it as "existing value" and keeps it unless someone
picks a canonical option. Opening a record never silently rewrites it.

### Known issues in the current data

The app does not touch these on its own.

All three registers are clean: every formula cell still holds its formula,
and no data cell holds one.

**Inconsistent values in free-choice columns:**

| Sheet | Column | Issue |
| --- | --- | --- |
| accounts | `account_hq_fy_end` | one row holds `2025` instead of a month |
| accounts | `account_hq_revenue_source_type`, `account_hq_employee_source_type` | one row each holds `Reuters` |
| centers | `center_country` | `India` and `india` both appear |
| centers | `center_jv_status` | three rows hold the literal text `JV Status` |

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
