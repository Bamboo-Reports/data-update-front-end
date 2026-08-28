# BR / CM / SM — UX Flow Specification

## 1. Data Hierarchy & Relationship Rules

The system manages three linked record types:

- **BR (Business Record)** — Account/Company-level information
- **CM (Center Master)** — Center-level information under a parent account
- **SM (Service Master)** — Services delivered through a specific center

**Relationship rules:**

1. Every BR must have at least one CM. One BR can have multiple CMs (one account can operate multiple centers).
2. Not every CM will have an SM. Whether an SM is required depends on the CM's **Center Status**:
   - **Active Center** → SM is mandatory. The user cannot skip it.
   - **Upcoming** or **Non-Operational** → SM is optional. The user may skip via a "No SM for this center" button.
3. Linked fields must be byte-identical across records — never re-typed:
   - **Account Global Legal Name** entered in the BR (e.g., "3M Ltd") must carry down exactly to the CM and SM.
   - **Center Legal Name** entered in the CM (e.g., "3M India Ltd") must carry down exactly to the SM.

## 2. Exact-Match Rule for Inherited Fields

**Account Global Legal Name** and **Center Legal Name** must be character-for-character identical everywhere they appear — including casing, spacing, and punctuation.

- "3M India Ltd" ≠ "3m india ltd" ≠ "3M InDia lTD" — these are treated as different values and would break the linkage between records.
- The same applies to Center Legal Name across CM → SM.

**How the system enforces this:**

1. These fields are entered manually **only once** — Account Global Legal Name at BR creation, Center Legal Name at CM creation.
2. Everywhere downstream, they are **never free-text**:
   - In CM and SM, Account Global Legal Name is a dropdown/auto-populated value inherited from the BR.
   - In SM, Center Legal Name is a dropdown/auto-populated value inherited from the CM.
3. Because users select rather than re-type, case mismatches, typos, and duplicate variants are impossible by design — the value is copied byte-identical from the source record.
4. *(Optional safeguard)* At BR/CM creation, the system can run a case-insensitive duplicate check — so if "3M India Ltd" exists and someone tries to create "3m india ltd" as a *new* record, they get a warning: "A similar name already exists. Did you mean 3M India Ltd?"

Enforcement is not about validating matching text — it's about removing the opportunity to re-type it at all.

## 3. Flow 1 — Adding a New Account (BR → CM → SM)

1. User creates a new BR and completes all account-level fields.
2. On saving the BR, the system immediately prompts the user to add its first CM. The Account Global Legal Name is auto-populated (inherited from the BR, not manually entered).
3. On saving the CM, the system checks Center Status:
   - **Active Center** → user is required to add the SM before finishing. No skip option.
   - **Upcoming / Non-Operational** → user is prompted to add an SM but can decline via a "No SM for this center" button.
4. The SM inherits both the Account Global Legal Name (from the BR) and the Center Legal Name (from the CM) automatically.

## 4. Flow 2 — Adding a New Center to an Existing Account

**Example scenario:** "3M Ltd" was added as a BR on Aug 27, 2026, with 4 CMs (4 centers) and 3 SMs (one center was Upcoming). On Aug 28, 2026, 3M opens a new center, "3M India Hydro Limited."

1. User goes to CM and clicks **Add New Record**.
2. **Account Global Legal Name** is a dropdown, not a free-text field. The user selects an existing account (e.g., "3M Ltd") — guaranteeing an exact match with the BR and preventing typos or duplicate account entries.
3. User enters the new **Center Legal Name** ("3M India Hydro Limited") and completes the remaining CM fields.
4. On saving, the same SM prompt logic from Flow 1 applies:
   - Active Center → SM mandatory.
   - Upcoming / Non-Operational → SM optional, skippable via "No SM for this center."

## 5. Summary of Prompting Behavior

| After saving... | System prompts for... | Can the user skip? |
|---|---|---|
| BR | CM | No — every BR needs a CM |
| CM (Active) | SM | No |
| CM (Upcoming / Non-Operational) | SM | Yes — "No SM for this center" button |
