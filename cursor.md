# Project Context for AI Agents

> **Read this file first** in new sessions. It summarizes architecture, flows, and conventions so you do not need to re-scan the whole repo. Dive into specific source files only when changing them.

**Do not paste secrets from `config.json`, `general.txt`, or logs into chat/commits.** Those files hold live Telegram tokens, API keys, and admin credentials. They are gitignored (or should stay out of git).

---

## What this project is

Windows + Python automation that takes customer orders (identity/document data + face/signature images), generates barcodes via an external FIS API, prepares Photoshop instruction tickets, runs Adobe Photoshop ExtendScript (`.jsx`) against PSD templates, optionally builds LightBurn (`.lbrn2`) laser files, and writes deliverables under `Final_Documents/`.

There are **two independent frontends** that share the same render stack (`modules/`, Photoshop, FIS, remove.bg):

| Path | Entry | Job store | Who renders |
|------|--------|-----------|-------------|
| **Telegram shop** | `telegram_bot.py` | Local SQLite `jobs.db` (raw `sqlite3`) | Bot itself (in-process asyncio queue + Photoshop) |
| **Web shop** | `app.py` (Flask, typically on PythonAnywhere) | Same filename `jobs.db` but **SQLAlchemy schema on the server** | Separate Windows process: `worker.py` polls the web API |

**Bot and worker do not call each other.** They only share `config.json`, `modules/*`, PSD/Lightburn assets, and temp/final folders on the Windows machine running Photoshop.

---

## Repo layout (source that matters)

```
telegram_bot.py      # Telegram UI + local job approval + Photoshop queue
worker.py            # Headless poller for Flask-approved jobs
app.py               # Flask storefront + admin + /api/worker/*
config.json          # Secrets + paths + PSD filenames (gitignored)
modules/
  *_module.py        # Per-state: prepare_job_files (+ LightBurn for NY/VA/GA/TX)
  process_*.jsx      # Photoshop ExtendScript; one or two scripts per state
PSDs/                # Adobe templates (large; gitignored)
Lightburn/           # .lbrn2 laser templates
Automated Messages/  # rules.txt, price.txt, payment_message.txt + Previews/{STATE}/
temp_files/          # Ephemeral barcodes, faces, data tickets
Final_Documents/     # Per-order output folders
logs/                # bot.log, worker.log, process_*.log
active_job.txt       # Single-line path to current data ticket (JSX reads this)
jobs.db              # Local Telegram bot DB (and separately Flask DB on host)
README.md            # Human setup / invite-link test guide
```

**Missing in this local checkout:** Flask `templates/` HTML files. `app.py` calls `render_template(...)`; templates live on the deployed host (or were never committed). Do not assume they exist locally.

Supporting / non-runtime: `backup_files/`, `Final_Documents/`, fonts, sample exports.

---

## Config (`config.json`)

| Section | Purpose |
|---------|---------|
| `telegram.bot_tokens_pool` + `active_token_index` | Multi-bot failover for `telegram_bot.py` |
| `telegram.bot_token_flask` + `flask_bot_username` | Separate bot for Flask Telegram Login Widget |
| `telegram.admin_chat_id` | Admin Telegram user for payments / commands |
| `web.*` | `worker_api_key`, admin user/pass, `web_url` (PythonAnywhere base URL) |
| `api.fis_*` | Fake ID Solutions barcode API |
| `api.removebg_key` | Background removal for face/signature |
| `paths.base_dir` | Absolute project root (must match this machine) |
| `paths.photoshop_exe` | Photoshop.exe path |
| `filenames.*` | PSD filenames under `PSDs/` |
| `toggles.admin_mode` | Telegram path: skip payment, generate immediately |

Update `base_dir` and `photoshop_exe` when moving machines. JSX also reads `config.json` via `eval` of the JSON text.

---

## High-level architecture

```
                    config.json
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
telegram_bot.py       worker.py            app.py (remote)
  local jobs.db         polls                SQLAlchemy jobs.db
  asyncio Queue         GET get_job          uploads/
     │                  POST submit              │
     └────────┬─────────┘                        │
              ▼                                  │
        modules/*.py  ◄── cart item dicts ───────┘
              │
              ├─ write data_*.txt + assets → temp_files /
              │                               Final_Documents
              ├─ write path into active_job.txt
              ├─ Photoshop.exe -r process_*.jsx
              └─ (NY/VA/GA/TX) generate_lightburn_lbrn(...)
```

### Render pipeline (both bot and worker)

1. Parse / normalize order fields (`parse_bulk_input` / FL variant).
2. Optional remove.bg on face and signature images.
3. `generate_barcodes(user_data, api_height)` → FIS `POST /barcode`, then export SVG (+ TIFF for FL, PNG for PA/VA).
4. Route by `jurisdiction` → `*_module.prepare_job_files(...)`.
5. Module returns `(unique_id, data_path, out_front, out_back, out_psd, *jsx_paths)`.
6. Write `data_path` into `active_job.txt`.
7. Launch each JSX with `Photoshop.exe -r <script>`.
8. Poll until output markers exist (timeout **1800s**).
9. Laser states: call `generate_lightburn_lbrn(data_map, BASE_DIR)`.
10. Worker-only: rename output folder to `{FIRST} {LAST} {DOB} (ORDER {job_id})`.

JSX contract: read `active_job.txt` → open that Key:Value data file → open PSD from `PSDs/` → edit layers → export.

---

## Dual entry points in detail

### 1. `telegram_bot.py`

- Library: `python-telegram-bot` ConversationHandler (32 states, `range(32)`).
- Auth: one-time invite tokens (`/invite [hours]`, default 24h). New users need `/start <token>`. Returning users in `users` table skip invite. Blocked users silently end.
- Menus: Shop | Rules | Preview | Price | Cart. Shop “Physical Eyes” is live; Scan Eyes / 2nd Form are stubs.
- **Implemented jurisdictions:** `NJ`, `NY`, `FL`, `PA`, `VA`, `GA`, `TX`. Other US states show “Coming Soon”.
- Order flow (happy path): state → (NJ: DL/ID + grade) → bulk Key:Value paste → signature → (FL extras / PA Real ID) → face → “2nd form?” (answer ignored; always carts) → checkout → payment screenshot → admin Approve/Reject/Block.
- On approve: `execute_generation` per cart item → enqueue Photoshop work.
- Admin commands: `/invite`, `/block`, `/unblock`, `/status` (admin_chat_id only).
- Token rotation: on Forbidden/InvalidToken/NetworkError, bump `active_token_index` in config and restart; index only moves forward.
- Logs: `logs/bot.log` (FileHandler mode `w` — truncated every restart).

**Telegram SQLite tables (raw sqlite3):** `jobs`, `blocked_users`, `users`, `invites`. Job statuses: `PENDING` | `APPROVED` | `REJECTED` | `BLOCKED` | `UNBLOCKED`.

### 2. `app.py` + `worker.py`

- Flask app: invite gate → Telegram Login Widget → disclaimer → menu/shop/form/cart/checkout/track + `/admin`.
- Job statuses: `PENDING_APPROVAL` → `APPROVED` / `REJECTED` / `BLOCKED` → worker sets `COMPLETED`.
- Worker API:
  - `GET /api/worker/get_job?api_key=...` → `{ job_id, payload: [cart items] }` or “No jobs”.
  - `POST /api/worker/submit/<job_id>?api_key=...` → mark `COMPLETED`.
  - Downloads: `GET /uploads/<filename>`.
- **No job claim/lock** — concurrent workers can race on the same `APPROVED` job.
- Face/sig in payload are **filenames** on the web host until `download_file` pulls them.
- Logs: `logs/worker.log`.

**Important:** Local `jobs.db` used by the Telegram bot is **not** the same logical schema as Flask’s SQLAlchemy models (`User`, `Invite`, `Job`, `Setting`). On production, Flask’s DB lives on the web host; the Windows worker never opens SQLite directly.

---

## State modules matrix

| State | Module | JSX | Barcode assets into module | LightBurn | Typical outputs |
|-------|--------|-----|----------------------------|-----------|-----------------|
| NJ | `nj_module.py` | `process_nj.jsx` | SVG | No | Front/Back PNG + PSD |
| NY | `ny_module.py` | front + back | SVG | Yes | Front/Back dirs + layer PNGs + PSD + `.lbrn2` |
| FL | `fl_module.py` | `process_fl.jsx` + `process_fl_back.jsx` | TIFF + SVG | No | Color/Black TIF plates + Back Black TIF |
| PA | `pa_module.py` | `process_pa.jsx` + `process_pa_back.jsx` | PNG | No | Front Color TIF + Front Black PNG + Back Black PNG |
| VA | `va_module.py` | front + back | PNG | Yes | Layer PNGs + PSD + laser |
| GA | `ga_module.py` | front + back | SVG | Yes | Layer PNGs + PSD + laser |
| TX | `tx_module.py` | front + back | SVG | Yes | Layer PNGs + PSD + laser |

Shared module pattern:

- Entry: `prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, ...)`.
- Builds a flat `Key: Value` instruction file for JSX.
- Prefers `custom_dl`, else parses AAMVA fields from raw barcode text (`DAQ`, `DBB`, `DBD`, `DBA`, `DCF`, `DCK`, …).
- Sanitizes Windows filenames; path escaping differs slightly by state (backslash vs forward slash).

Completion polling (worker — bot is similar but slightly less state-specific in places):

- NY/VA/GA/TX: PSD present in both Front and Back output dirs.
- FL/PA: `Output Color` and `Output Black` files non-empty.
- NJ: `Output PSD` non-empty.

---

## Cart / user_data shape

Dict (and JSON array of such dicts on jobs). Common keys:

`jurisdiction`, `first_name`, `middle_name`, `last_name`, `address`, `city`, `state_code`, `zip_code`, `gender`, `dob`, `height`, `weight`, `hair_color`, `race`, `eyes`, `class`, `endorsements`, `restrictions`, `issue_date`, `expires_date`, `real_id`, `not_real_id`, `custom_dl`, `signature` / `signature_path`, `face_path`, …

- NJ: `nj_doc_type` (`nj_id` / `nj_dl`), `nj_grade`
- FL: `safe_driver`, `replaced`, plus restriction/endorsement answers
- GA: `county`, `weight`
- Gender normalized to `"1"` / `"2"` in bulk parser

Bulk prompts live in `show_unified_prompt` (Telegram) and the web form; TX/GA prompts include extra fields.

---

## How to run (local Windows)

1. Edit `config.json` paths / admin id / tokens as needed.
2. PSDs in `PSDs/`, Lightburn files in `Lightburn/`.
3. `pip install -r requirements.txt` (file is a large frozen dump; core runtime needs: `python-telegram-bot`, `Flask`, `Flask-SQLAlchemy`, `requests`, Pillow/image libs as imported).
4. Telegram path: `python telegram_bot.py`
5. Web path: deploy/run `app.py` on host; on Windows with Photoshop: `python worker.py`
6. Debug via `logs/` and per-state `process_*.log`.

Photoshop must allow script execution (`PSUserConfig.txt` setup noted in README).

---

## Conventions & gotchas for agents

1. **Duplicated logic:** barcode helpers, height parsing, remove.bg are copy-pasted between `telegram_bot.py` and `worker.py`. Fix both or extract if refactoring.
2. **Half-wired Telegram states:** `BUY_CHECK`, `CUSTOM_DL_*`, most `PA_DL/ISS/EXP/SIG_*` handlers exist but are **not** registered in the current ConversationHandler graph. Only `PA_REAL_ID` is wired for PA extras.
3. **“2nd Form?”** question does not change behavior — item always goes to cart.
4. **FL uses `parse_fl_data`**; other states use `parse_bulk_input` (different key maps).
5. **Token index is sticky** — rotation never resets to 0 automatically.
6. **`init_db()` is called twice** at import in the bot.
7. **Logs truncate on restart** (`mode='w'`).
8. **Do not commit** `config.json`, `general.txt`, `jobs.db`, PSDs, temp/final outputs (see `.gitignore`).
9. **Eyes codes:** templates normalize BRN/BRO by state (README notes NJ=BRN, NY=BRO).
10. Prefer minimal diffs; match existing procedural style (few classes, heavy functions).
11. When adding a new state: config filename → `*_module.py` → `process_*.jsx` → wire jurisdiction in bot `execute_generation` + worker loop + ConversationHandler/UI + optional LightBurn + preview assets.

---

## Suggested reading order for a specific change

| Task | Start here |
|------|------------|
| Telegram UX / auth / cart | `telegram_bot.py` |
| Web UX / admin / worker API | `app.py` (+ missing templates on host) |
| Polling / Photoshop wait / rename | `worker.py` |
| State-specific layout / ticket fields | `modules/<state>_module.py` then matching `.jsx` |
| Paths / PSD names / keys | `config.json` (structure only; no secret paste) |
| Human setup | `README.md` |

---

## Out of scope for casual browsing

Large binaries and assets (`PSDs/`, `Lightburn/`, `backup_files/`, `Final_Documents/`, preview images) are data, not application logic. Prefer reading Python/JSX over opening PSD/LBRN2 unless the task is template-layer work.
