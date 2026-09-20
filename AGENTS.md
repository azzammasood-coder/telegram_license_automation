# Project briefing (read this before exploring)

Photoshop **ExtendScript (ES3)** tooling that fills driver's-license PSD templates from AAMVA CSV rows, then optionally lays finished PNGs onto 8-up Teslin upsheets.

**Do not** re-scan the tree to rediscover architecture. Open the file below for the area you are changing. Prefer `logs/card_generator.log` over guessing when a run fails.

| File | Role |
|---|---|
| `complete-automation.jsx` | Main entry: CSV → per-person PSDs/PNGs; optional upsheet chain |
| `just-upsheet-automation.jsx` | Standalone upsheet UI; same core as above |
| `shared/common.jsx` | Shared lib (`#include`d — not runnable alone) |
| `config.ini` | Absolute PSD paths per state + perforation / upsheet |
| `templates/CA\|MA\|SC/` | PSD assets |
| `logs/card_generator.log` | Per-run log (overwritten each run) |

Also present: `testing-files/`, `final-documents/`, `backup-files/` (outputs / samples; often gitignored). `cards_generator.jsx` is gone — replaced by `just-upsheet-automation.jsx`.

---

## Runtime (non-negotiable)

- Engine is **ES3**. No native `Array.map` / `filter` / `forEach` / `indexOf`, `Object.keys`, `String.trim` / `padStart`. Polyfills live at the top of `shared/common.jsx` — add there before using a modern method.
- `#include "shared/common.jsx"` is textual/preprocess. Including scripts must set `var scriptFile = new File($.fileName);` **before** the include (logging paths depend on it).
- Debug via ExtendScript Toolkit / VS Code ExtendScript Debugger. Do not commit `debugger;`.
- Layer/group name lookups are **case-insensitive** (`findLayerRecursive`, `findSmartObjectRecursive`, `updateTextLayersRecursive`).

---

## Data flow

1. UI picks CSV + destination folder (+ optional upsheet checkboxes).
2. `parseCSV` — **two header rows** (machine names, then labels); data starts at row index 2. State = column `DAJ`.
3. `getTemplatePaths(state)` reads `[STATE]` from `config.ini`.
4. `getJobsForState(state)` → `CA_TEMPLATE_JOBS`, `MA_TEMPLATE_JOBS`, or `SC_TEMPLATE_JOBS`.
5. Per CSV row: create folder `FIRSTNAME LASTNAME STATE DOBYEAR` (`computePersonFolderName`), then for each job open template → `process*PSD` → save PSD+PNG named after the **template basename** → close.
6. Missing one template skips that job only; row counts as processed if ≥1 job saved.
7. Optional: `runUpsheetAutomation(rows, destFolder, separateNonPerforated)`.

---

## Where to edit what

| Change | Where |
|---|---|
| Shared helpers, SO replace, signatures, upsheet bucketing | `shared/common.jsx` |
| CA/MA/SC field mapping, DOB formatters, `process*PSD`, job lists | `complete-automation.jsx` |
| Upsheet UI only | `just-upsheet-automation.jsx` |
| Template paths / perforated flag | `config.ini` (machine-specific absolute paths) |
| New state | `templates/<ST>/` + `[ST]` in config + `process*` fns + `*_TEMPLATE_JOBS` + `getJobsForState` branch |

---

## CA jobs (6 PSDs / person)

| config key | Processor | Edits |
|---|---|---|
| `FrontPSD` | `processFrontPSD` | Photo → `photo`/`big photo`(+copy) cover-scale; personal text; `MICROTEXT ABYY`×3; `LASER SIGNATURES`; `DONOR` / Real ID group visibility |
| `FrontUVPSD` | `processFrontUVPSD` | `UV DOB MMDDYYYY`; `PHOTO OF DL HOLDER` SO (delete `Layer 3`, place cover, invert, move top, keep `GREEN BG`) |
| `FrontLaserPSD` | `processFrontLaserPSD` | `LASER SIGNATURES`; `LASER DOB MMDDYYYY` |
| `HologramPSD` | `null` | Open/save unchanged |
| `BackPSD` | `processBackPSD` | `PDF417`←`barcode`, `CODE 128`←`linear`; `SIGNATURES`; `LASER DOB MMDDYY`; `INVENTORY CONTROL NUMBER`←`DCK` |
| `BackLaserPSD` | `processBackLaserPSD` | `DOB MMDDYY` |

`Perforated=true`; has `UpsheetPSD`.

## MA jobs (3 PSDs / person)

| config key | Processor | Notes |
|---|---|---|
| `FrontPSD` | `processMAFrontPSD` | Front group text (many uppercased); microprint; `ORGAN DONOR` / `REAL ID COMPLIANCY`; `PHOTO` cover; `SIGNATURES` |
| `FrontRaisedPSD` | `processMAFrontRaisedPSD` | `Raised Text MM/DD/YY` ← DOB |
| `BackPSD` | `processMABackPSD` | DOB, revision, inventory; barcodes `2D or PDF417 barcode` / `1D or Code 128barcode` |

`Perforated=false`; no upsheet until `[GLOBAL] NonPerforatedUpsheetPSD` exists. Rules: `templates/MA/Massachusetts ID rules.txt`. Fixed `MA_REVISION_DATE = "02/22/2016"`. Inventory: `computeMAInventoryNumber` = `YY` + day-of-year(**+1**) + DL# + `0601`.

## SC jobs (1 combined PSD / person)

| config key | Processor | Notes |
|---|---|---|
| `FrontPSD` | `processSCCombinedPSD` | Single file with UV+FRONT+BACK. EDIT group text (`ID`, `LAST`, `FIRST MIDDLE`, addresses, DOB/DOB 2, ISSUE, EXPIRY, SEX, HGT `F -II`, WGT, EYES, CLASS, ENDORSE, RESTRICTIONS, DD); `MAIN PHOTO`/`GHOST PHOTO` cover (top-level + `PHOTO` group); `SIGNATURE EDIT`; back `DONOR` YES/NO, `RESTRICTIONS (BACK)`, `ENDORSEMENTS (BACK)`; `PDF417 2D BARCODE` / `CODE128 1D BARCODE` |

`Perforated=false`; no upsheet yet. Height helper: `formatHeightSC`. After PSD save, exports `FRONT.jpg` / `BACK.jpg` by toggling FRONT/BACK group visibility (no single combined PNG).

---

## Important helpers

**DOB formats (not interchangeable):** `formatDOB_MMDDYY` (6 digit) vs `formatDOB_MMDDYYYY` (8 digit) vs `formatDOB_MMDDYY_slash` / `formatDateSlash` (slashed). Match the **layer name**.

**Photos:** `scaleMode: "cover"`. **Barcodes/signatures:** default stretch-to-fill.

**Smart Objects:** `replaceSmartObjectCore(parentSet, layerName, fileRef, opts)` — one path for all placements. Default deletes other SO layers; use `opts.deleteLayerNames`, `invert`, `moveToTop`, `scaleMode`, `ensureVisibleLayerNames` as needed. `replaceSmartObject` = thin legacy wrapper.

**Signatures:** `getSignatureData` order: CSV `signature image` → `signature text` → `"FirstName L"`. Apply via `applySignatureToGroup` per group (`LASER SIGNATURES` / `SIGNATURES`).

**Real ID:** `DDA` is AAMVA compliance type — `F` = compliant, `N` = not (`isRealIdCompliant`). Not a boolean.

**Donor:** `isAffirmative(DDK)`.

---

## Upsheets

Single core: `runUpsheetAutomation` in `common.jsx` (both UIs call it — **do not duplicate** bucketing).

- Template groups: `FRONT`, `FRONT UV`, `LASER FRONT`, `BACK`, `LASER BACK` (note order vs config keys; see `UPSHEET_SIDE_GROUPS`). Each has `Card 1`…`Card 8`. No hologram group.
- Perforated states (CA): own `UpsheetPSD`, never mixed with other states.
- Non-perforated: shared `[GLOBAL] NonPerforatedUpsheetPSD` (not set yet); UI checkbox controls separate vs combined pools.
- Output: `<dest>/Upsheets/<state|Combined Non-Perforated>/Sheet N.psd` (+ per-side PNG export order in `UPSHEET_PNG_EXPORT_ORDER`).

---

## CSV (AAMVA + extras)

Two header rows; fields include `DAC` first, `DCS` last, `DAJ` state, `DBB` DOB, `DAQ` DL#, `DCK` inventory, `DDA` Real ID, `DDK` donor, plus non-AAMVA `city`, `photo`, `barcode`, `linear`, `signature image`, `signature text`. Sample: `single-id.csv` / `many-ids.csv`.

---

## Agent habits

1. ES3 only; polyfill before using modern APIs.
2. Shared logic → `common.jsx`; state-specific layout → `complete-automation.jsx`.
3. After path / silent-fail issues: check `config.ini` absolute paths, then the log.
4. This file (`AGENTS.md`) is the canonical briefing Cursor auto-loads — keep it updated when architecture changes.
