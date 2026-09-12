# NovaDownloader — Architecture & Design (Phase 1)

> **SUPERSEDED (2026-08-25).** This document describes the original PySide6/QML + FastAPI + SQLite
> design, which was never built past the Python skeleton (`core/branding.py`, `core/logger.py`).
> The app that actually runs today is Electron + Node: `electron/main.js` (window + IPC),
> `electron/engine.js` (yt-dlp queue — the real `DownloadManager`), `electron/store.js`
> (JSON settings in place of SQLite), `electron/localApi.js` (the extension bridge in place of
> FastAPI), and `renderer/` (the UI in place of QML). Sections 0.1 (legal constraints) and the
> security posture still apply; the technology table and module layout below do not.

- **Status:** Phase 1 deliverable (design + skeleton). No application code yet, per the phased plan.
- **Repo root:** `D:\ProjectS\Y-T.Downloader` — the folder name is *not* the product name; all branding lives in `core/branding.py` so the app can be renamed in one place.
- **Next:** Phase 2 (core: config, paths, database, logging, utils) starts on "NEXT".

---

## 0. Ground rules

### 0.1 Legal / compliance (hard constraints)

- NovaDownloader is intended **only** for content the user owns, has permission to download, or that the source platform's license permits downloading.
- **Never implemented:** DRM circumvention, bypassing encrypted/protected streams, authentication bypass, paywall bypass, CAPTCHA bypass, security bypass, unauthorized access.
- Only standard, publicly available media manifests and download mechanisms are used (via yt-dlp's public APIs).
- The app never claims to exceed the user's connection or server-side limits. Throughput is maximized via concurrency, connection reuse, buffering, resume, and queue management — within configurable, polite limits.
- Possible future *optional* feature: "use my browser cookies" (user's own credentials, explicitly enabled by the user). Default: off.

### 0.2 Engineering principles

1. **Single source of truth** — `DownloadManager` owns the task state store. The QML UI (via Qt signals) and the HTTP API both read/write through it, never through separate copies.
2. **UI-agnostic backend** — `backend/` and `core/` import **no Qt**; they run headless and are unit-testable without a display.
3. **The UI thread never blocks** — analysis, downloads, ffmpeg, and DB writes happen on worker threads; updates cross to QML via queued signals.
4. **No fake implementations** — anything not technically possible is documented with the reason (see §6.4), not silently stubbed.

---

## 1. Technology decisions (final)

| Concern | Decision | Rationale |
|---|---|---|
| Language | Python 3.12+ | Per spec. One language for engine, API, and UI glue. |
| UI toolkit | PySide6 ≥ 6.7, Qt Quick (QML) + Qt Multimedia | GPU-composited scene graph → smooth glassmorphism/animations at low CPU; QML `Video` element plays the looping background natively; Python logic stays in-process. |
| Download engine | **yt-dlp embedded as a Python library** (not a CLI subprocess) | In-process format/audio-track/subtitle metadata, real progress hooks, fragment-level concurrency, resume (`continuedl`), cancellation (`DownloadCancelled`). No fragile stdout parsing. |
| Mux / post-process | FFmpeg binary via `subprocess` with **argument lists only** | Merge separate video+audio streams, embed subtitles, MP3 extraction, container remux. Never `shell=True`, never string-interpolated user input. |
| Local API | FastAPI + Uvicorn, run in a **daemon thread inside the desktop app** | One process, one `DownloadManager` shared by UI and extension; pydantic validation; async endpoints; tiny footprint. |
| Storage | SQLite in WAL mode via stdlib `sqlite3` + thin DAO | Zero-config, safe concurrent reads while workers write, write volume is throttled so no ORM needed. |
| Concurrency | `ThreadPoolExecutor` (size = max simultaneous downloads) for tasks; dedicated single-thread executor for analysis | Bounded parallelism matching the Settings value; analyses serialize (gentle on extractor rate limits) and never block downloads. |
| Chrome extension | Manifest V3, vanilla JS, **no remote code** | Per spec. Service worker `fetch()` to `http://127.0.0.1:8765` with `host_permissions`. |
| Packaging | PyInstaller **onedir** via `scripts/build_windows.py` | Faster startup than onefile, `ffmpeg.exe` sits beside the exe, fewer antivirus false positives. Output: `NovaDownloader/NovaDownloader.exe`. |
| Tests | pytest (+ `pytest-qt` optional for UI smoke) | Backend runs headless, so most logic tests need no display. |

---

## 2. Final architecture

```
┌─────────────────────────── NovaDownloader.exe (single process) ────────────────────────────┐
│                                                                                            │
│  ┌───────────────────── Presentation (Qt Quick / QML) ──────────────────────┐              │
│  │  Main.qml · pages/{Home,Downloads,History,Settings} · components/ · Theme│              │
│  └───────────────┬──────────────────────────────────────────────────────────┘              │
│                  │ context properties (slots) / signals (queued to main thread)            │
│  ┌───────────────▼──────────────── UI bridge (ui/) ─────────────────────────┐              │
│  │  AppController · AnalyzeController · DownloadsController ·               │              │
│  │  HistoryController · SettingsController                                  │              │
│  └───────┬───────────────────────────────────────────────┬─────────────────┘              │
│          │                                               │                                │
│  ┌───────▼──────────── Services (backend/) ──────────────▼───────────────┐  ┌────────────┐ │
│  │  Analyzer  ──►  MediaInfo (formats · audio tracks · subtitles)        │  │ Local API  │ │
│  │  DownloadManager (queue + worker pool + task state store + signals)   │◄─┤ FastAPI +  │ │
│  │  FormatManager · SubtitleManager                                      │  │ Uvicorn    │ │
│  └───────┬──────────────────────────────────┬───────────────────────────┘  │ 127.0.0.1   │ │
│          │                                  │                                │ :8765       │ │
│  ┌───────▼────────┐              ┌──────────▼─────────┐              ┌─────┴────────────┐ │
│  │  yt-dlp        │              │  FFmpeg            │              │  SQLite (WAL)    │ │
│  │  (embedded lib)│              │  (subprocess,      │              │  downloads       │ │
│  │                │              │   arg-list only)   │              │  settings        │ │
│  └───────┬────────┘              └──────────┬─────────┘              └──────────────────┘ │
│          │ network I/O                       │ mux / embed / extract                       │
│          ▼                                   ▼                                             │
│     media streams ───────────────►  output files in Downloads folder                       │
│                                                                                            │
│  Platform services (main thread): system tray · clipboard monitor · desktop notifications  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                                         │  fetch() + X-Nova-Token, CORS-restricted
                              ┌──────────┴───────────┐
                              │  Chrome MV3 extension │
                              │  background.js (SW)   │
                              │  content.js · popup   │
                              └──────────────────────┘
```

### 2.1 Thread model

| Thread | Owns | Rules |
|---|---|---|
| Main | Qt event loop, QML scene, tray, clipboard, toasts | Never performs I/O; only reacts to signals. |
| Uvicorn daemon | FastAPI request handling | Shares `DownloadManager` via app state; calls only thread-safe manager methods. |
| Worker pool (N = max simultaneous downloads) | One download task each: yt-dlp call + ffmpeg post-processing | Updates flow: progress hook → store (locked) → Qt signal. |
| Analysis executor (1 thread) | `Analyzer.analyze(url)` | Serialized; keeps extractors' rate limits happy. |

Cross-thread updates use a lock-protected task store in `DownloadManager`; Qt signals are auto-queued to the main thread; API responses snapshot the store under the same lock.

---

## 3. Complete folder structure (final)

```
Y-T.Downloader/                        ← repo root (product name lives in core/branding.py)
├── app.py                             # Entry point: Qt app, services, API thread, icon
├── requirements.txt                   # Pinned runtime deps
├── requirements-dev.txt               # pytest, ruff, pyinstaller
├── README.md                          # Phase 10
├── LICENSE                            # User to choose (noted, intentionally absent now)
├── .gitignore
│
├── core/                              # Infrastructure — imports NO Qt, NO backend
│   ├── branding.py                    # APP_NAME, APP_VERSION, ORG_NAME (single branding source)
│   ├── paths.py                       # App-data dirs: config, db, logs, thumbnails, downloads
│   ├── config.py                      # Config dataclass + JSON load/save + defaults + validation
│   ├── database.py                    # SQLite conn (WAL), PRAGMA user_version migrations, DAO
│   ├── logger.py                      # Rotating multi-file logging (app/downloader/api)
│   └── utils.py                       # sanitize_filename, format_bytes/eta/speed, URL validation
│
├── backend/                           # Application services — imports core only, NO Qt
│   ├── models.py                      # TaskStatus enum; MediaInfo, FormatInfo, AudioTrack,
│   │                                  #   SubtitleTrack, DownloadRequest, DownloadTask dataclasses
│   ├── ytdlp_engine.py                # yt-dlp embedding: analyze_opts/download_opts builders,
│   │                                  #   extract(), download() with progress/pause/cancel hooks
│   ├── ffmpeg.py                      # ffmpeg discovery + safe arg-list runner
│   ├── analyzer.py                    # raw info → normalized MediaInfo (dedup, language detect)
│   ├── format_manager.py              # quality+container+audio-lang → yt-dlp format selector
│   ├── subtitle_manager.py            # none/external/embedded decisioning per container
│   ├── download_manager.py            # queue, worker pool, task lifecycle, state store, signals
│   └── api.py                         # FastAPI app factory, routes, pydantic schemas, CORS,
│                                      #   token auth, uvicorn thread runner
│
├── ui/                                # Qt glue — the ONLY package that imports both Qt and backend
│   ├── application.py                 # QQmlApplicationEngine, context properties, window icon
│   └── controllers/
│       ├── app_controller.py          # Navigation, clipboard monitor, toasts, tray wiring, window state
│       ├── analyze_controller.py      # URL → Analyzer (async) → MediaInfo → QML
│       ├── downloads_controller.py    # Queue views, pause/resume/cancel/retry/reorder actions
│       ├── history_controller.py      # Search/filter, open file/folder, redownload, clear
│       └── settings_controller.py     # Config read/write, pairing-token display, reset
│
├── qml/
│   ├── Main.qml                       # Frameless window, TitleBar, BackgroundLayer, Sidebar,
│   │                                  #   StackView page host with transitions
│   ├── Theme.qml                      # Singleton: palette, spacing, radii, typography,
│   │                                  #   animation intensity, blur/opacity scale factors
│   ├── components/
│   │   ├── GlassCard.qml              # Translucent card w/ border glow, hover scale
│   │   ├── TitleBar.qml               # Logo, title, window controls (min/max/close)
│   │   ├── Sidebar.qml                # Nav rail w/ animated selection indicator
│   │   ├── UrlInput.qml               # "Paste video URL…" + paste/clear/analyze, validation
│   │   ├── VideoInfoCard.qml          # Thumbnail, title, uploader, duration, selectors
│   │   ├── PillSelector.qml           # Reusable chip group (quality/format/audio/subs)
│   │   ├── DownloadCard.qml           # Per-task row: thumb, progress, speed, ETA, actions
│   │   ├── ProgressBar.qml            # Animated, shimmer-while-indeterminate
│   │   ├── SpeedGraph.qml             # Canvas line graph, ≤8 Hz repaint, 60 s window
│   │   └── Toast.qml                  # Notification popups (clipboard, completion, errors)
│   └── pages/
│       ├── Home.qml                   # URL input, spinner, VideoInfoCard, recent activity
│       ├── Downloads.qml              # Active/queue sections, DownloadCards, SpeedGraph
│       ├── History.qml                # Search, filters, table/list, item actions
│       └── Settings.qml               # General / Downloads / Appearance / Advanced
│
├── assets/                            # background.mp4 (optional, user-supplied), icons, fonts
├── extension/                         # Chrome MV3
│   ├── manifest.json
│   ├── background.js                  # Service worker: sole HTTP client to 127.0.0.1:8765
│   ├── content.js                     # Button injection (MutationObserver, idempotent)
│   ├── popup.html / popup.js / popup.css
│   └── icons/
├── ffmpeg/                            # ffmpeg.exe fetched by scripts/fetch_ffmpeg.py (gitignored)
├── scripts/
│   ├── fetch_ffmpeg.py                # Downloads a pinned ffmpeg build
│   └── build_windows.py               # PyInstaller onedir build + assets bundling
├── docs/
│   └── ARCHITECTURE.md                # This document
├── logs/                              # Runtime output (gitignored)
└── build/                             # PyInstaller work/output (gitignored)
```

Dependency rule (enforced by convention + a Phase 9 lint check):
`qml → ui → backend → core`. `core` imports nothing project-internal. `backend` imports `core`. `ui` imports `backend` + `core` + Qt. `app.py` imports `ui` + `backend`.

---

## 4. Task state machine

```
                       enqueue
   ┌──────────┐   ────────────────►  ┌──────────┐   worker slot free    ┌───────────┐
   │ CREATED  │                      │  QUEUED  │ ────────────────────► │ ANALYZING │
   └──────────┘                      └──────────┘                       └─────┬─────┘
                                        ▲  ▲                                  │
                          retry (failed)│  │retry (cancelled)                 │ info ok
                                        │  │                                  ▼
                                   ┌────┴──┴───┐   pause request        ┌────────────┐
                     resume ──────►│ PAUSED    │◄────────────────────── │ DOWNLOADING│
                                   └───────────┘   (cooperative hook)   └─┬─┬─┬─┬────┘
                                        ▲                                 │ │ │ └─ cancel ──► ┌───────────┐
                                        │           merge/embed (ffmpeg)  │ │ └─ error ────► │ CANCELLED │
                                        │                                     │ ▼                └───────────┘
                                        │                              ┌────────────┐           ▲
                                        └──── retry ◄── error ───────── │ PROCESSING│           │
                                                                       └─────┬──────┘           │
                                                                             │ done              │
                                                                             ▼                   │
                                                                       ┌───────────┐             │
                                                                       │ COMPLETED │   cancel ───┘
                                                                       └───────────┘   (before finalize)
```

- Statuses persisted to DB: `queued, analyzing, downloading, processing, paused, completed, failed, cancelled`.
- On app start, `DownloadManager` reloads non-terminal tasks as `queued` (resume via `.part` files where the protocol supports it) and terminal tasks stay in History.
- "Processing" covers ffmpeg merge, subtitle embedding, and MP3 extraction.

---

## 5. Data flow

### 5.1 Analyze flow (UI path)

```
Paste URL ─► UrlInput (scheme/host validation, paste/clear buttons)
        ─► Analyze ─► AnalyzeController.analyze(url)          [analysis executor, UI free]
                  ─► Analyzer.analyze(url)
                        ─► yt_dlp.YoutubeDL({quiet, skip_download}).extract_info(url)
                        ─► normalize: dedup heights → quality tiers
                                        audio formats' language fields → audio_tracks
                                        info['subtitles'] + automatic_captions → subtitles
                  ◄─ MediaInfo ── Qt signal ──► VideoInfoCard animates in
                                              selectors built ONLY from real data
```

### 5.2 Download flow

```
Selection (quality/format/audio/subs)
  ─► DownloadsController.enqueue(DownloadRequest)
  ─► DownloadManager.create_task: DB row (queued) + state store + signal
  ─► queue admits task when worker slot free (max simultaneous setting)
  ─► worker:
       1. ANALYZING (skipped if MediaInfo cached from UI flow / extension flow)
       2. FormatManager.build_selector(request) → yt-dlp opts:
            format selector, merge_output_format, concurrent fragments,
            continuedl=True, retries, ratelimit, ffmpeg_location, outtmpl
       3. ytdlp_engine.download(opts, hooks): progress hook per chunk/fragment
            → store update (locked) → signal → QML card + throttled DB write
            → speed/ETA from sliding-byte window
       4. PROCESSING: yt-dlp invokes our ffmpeg to merge separate streams;
            SubtitleManager adds --write-subs/--embed-subs or MP3 extraction
       5. finalize: record file_path, status=completed, tray notification,
            History refresh
```

### 5.3 Failure/cancel paths

- Hook raises `DownloadCancelled` → worker marks `cancelled`, keeps `.part`.
- Exception → mapped to `(error_code, user_message)` via §14 matrix → status `failed`, details to `logs/downloader.log`.
- Retry → re-enqueue same task id (fresh attempt counter).

---

## 6. Download engine design (yt-dlp embedding)

### 6.1 Format selection mapping (`FormatManager`)

| User choice | Meaning | yt-dlp selector fragment (example: 1080p + mp4) |
|---|---|---|
| Best available | best combined/merged | `bv*+ba/b` |
| 8K/4K/1440p/1080p/720p/480p/360p | height cap at tier | `bv*[height<=1080][ext=mp4]+ba/bv*[height<=1080]+ba/b[height<=1080]` |
| Audio only | best audio, container decides post-process | `ba/b` → ffmpeg extract to mp3, or keep m4a/webm |
| Audio language = X | filter audio formats by language metadata | `ba[language=bn]+bv*` (fallback to unfiltered when extractor publishes no language data — UI then only offers "Original") |
| Container | merge/remux target | `merge_output_format: mp4 \| mkv \| webm`; stream-copy remux, codec conversion only when the target container cannot hold the codecs |

Quality tiers shown in the UI are derived from **actual reported format heights** (e.g., 2160→"4K"); a tier never appears without a real format behind it. Audio-only and subtitle lists likewise come only from `MediaInfo`.

### 6.2 Speed / concurrency

- `concurrent_fragment_downloads = Connections setting` (default 8, range 1–16) — parallel HLS/DASH fragment fetches.
- `continuedl = True` → `.part` files → resume support.
- `ratelimit` (bytes/s) from the Speed-limit setting (0 = unlimited).
- `retries` / `fragment_retries` from the Retry-count setting (default 3).
- Max simultaneous tasks = worker pool size (default 3, range 1–6).
- Documented honestly: more connections does not always mean more speed; the caps exist partly to avoid excessive server load.

### 6.3 Pause / resume / cancel mechanics

- **Pause** is cooperative: the progress hook sleeps in a loop while `pause_requested` is set. Takes effect at the next chunk/fragment boundary; partial data is preserved.
- **Cancel** raises `yt_dlp.utils.DownloadCancelled` from the hook → clean abort, `.part` kept.
- **Resume** (same session) clears the pause flag. **Resume** (after restart/re-enqueue) relies on `continuedl`.
- State transitions are driven by `DownloadManager`, not the engine, so the UI/API cannot desync.

### 6.4 Known limitations (explicit, not hidden)

1. Live streams: no meaningful total size/ETA; no resume. UI shows "live" badge and disables ETA.
2. Pause granularity is chunk/fragment-level, not TCP-socket-level.
3. Per-connection server throttling cannot be bypassed; concurrency helps only where ranged/fragment access is allowed.
4. Audio-track languages appear **only** when the extractor publishes per-format language metadata; otherwise only "Original" is offered. We never fabricate languages.
5. DRM-protected streams are rejected with a clear error (§14).
6. External subtitles can always be written; *embedding* depends on container/codec compatibility (mp4 → mov_text, mkv → native, webm → WebVTT).

---

## 7. FFmpeg integration

- **Discovery order:** Settings `ffmpeg_path` → `ffmpeg/ffmpeg.exe` beside the app/exe → system `PATH`. Missing ffmpeg → UI warns in Settings and in any task needing it; combined-stream downloads explain the requirement in the error message.
- **Operations:** merge of separate video/audio streams (normally invoked *by yt-dlp* with our `ffmpeg_location` so merging, fragment joining, and post-processing all use the same binary), subtitle embedding, MP3 extraction, container remux.
- **Safety:** `subprocess.run([path, *args])` with argument lists only; no shell; paths validated with `Path.resolve()` containment checks; output filenames sanitized (§32 of the spec); no user-provided strings ever placed in a command position.

---

## 8. Local API design (localhost only)

- **Bind:** `127.0.0.1` only. Port default **8765** (configurable). Never `0.0.0.0`.
- **CORS:** `allow_origin_regex=r"^chrome-extension://[a-p]{32}$"` — extension origins only; no wildcard.
- **Auth:** pairing token (default **enabled**). Generated on first run, displayed in Settings → *Extension Pairing*, sent by the extension as `X-Nova-Token`. Mutating endpoints reject bad tokens with `401`. `GET /api/status` stays open (returns only reachability + `token_required`) so the popup can show "Not Running" vs "Connected".
- **Validation:** pydantic request models; URL format/length checks; download options constrained to enums/regex (no free-form yt-dlp flags, no paths, no commands). Output paths are derived server-side from the configured download folder only.
- **Rate limiting:** in-process token bucket on `/api/analyze` (≈30 req/min) to prevent hammering extractors.
- **Error envelope:**

```json
{ "error": { "code": "UNSUPPORTED_URL", "message": "This page doesn't expose a downloadable video." } }
```

Codes: `INVALID_URL`, `UNSUPPORTED_URL`, `PROTECTED_CONTENT`, `NETWORK`, `DISK_FULL`, `FFMPEG_MISSING`, `ENGINE_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`.

### 8.1 Endpoints

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/status` | — | `{ok, app, version, queue:{active,queued}, token_required}` |
| POST | `/api/analyze` | `{url}` | `MediaInfo` JSON (below) |
| POST | `/api/download` | `{url, quality?, format?, audio_language?, subtitle_mode?, subtitle_lang?}` | `202 {id, status:"queued"}` |
| GET | `/api/downloads` | `?status=&offset=&limit=` | `{tasks:[TaskDTO], total}` |
| GET | `/api/download/{id}` | — | `TaskDTO` |
| POST | `/api/download/{id}/pause` | — | `{ok}` |
| POST | `/api/download/{id}/resume` | — | `{ok}` |
| POST | `/api/download/{id}/cancel` | — | `{ok}` |
| POST | `/api/download/{id}/retry` | — | `{ok}` |
| POST | `/api/downloads/pause_all` | — | `{ok}` |
| POST | `/api/downloads/resume_all` | — | `{ok}` |

### 8.2 Analyze response example

```json
{
  "url": "https://example.com/watch?v=…",
  "title": "Sample Video",
  "uploader": "Sample Channel",
  "thumbnail": "https://…/hqdefault.jpg",
  "duration": 768,
  "is_live": false,
  "qualities": ["1080p", "720p", "480p", "360p", "audio"],
  "formats": [
    {"id": "137", "kind": "video", "ext": "mp4", "vcodec": "h264", "height": 1080, "fps": 30,
     "tbr": 4300, "filesize": 410236600},
    {"id": "251", "kind": "audio", "ext": "webm", "acodec": "opus", "language": "en",
     "tbr": 160, "filesize": 15300000}
  ],
  "audio_tracks": [
    {"language": "original", "label": "Original"},
    {"language": "bn", "label": "Bengali"}
  ],
  "subtitles": [
    {"language": "en", "name": "English", "auto": false, "ext": "vtt"},
    {"language": "bn", "name": "Bengali", "auto": true, "ext": "vtt"}
  ]
}
```

---

## 9. Chrome extension architecture & communication flow

### 9.1 Components

- `manifest.json` — MV3; `permissions: ["activeTab", "storage"]`, `host_permissions: ["http://127.0.0.1:8765/*"]`, content script at `document_idle` on `<all_urls>` (yt-dlp supports thousands of sites, so we don't hardcode a match list).
- `content.js` — injects an original **"↓ Download"** button. Strategy: (1) known placement near the player's action controls when a stable anchor exists (YouTube), (2) otherwise a small unobtrusive floating button bottom-right. Uses `MutationObserver` to re-attach on SPA/DOM changes; idempotent (marks nodes with `data-nova-injected`); minimal footprint, never restyles or removes page elements.
- `background.js` (service worker) — the **sole** HTTP client. Holds connection state, caches last analyze result, forwards download requests. No remote code, all logic local.
- `popup.html/js/css` — premium mini-UI: connection dot (● Connected / ○ Not Running), current page title, Quality / Format / Audio dropdowns populated from `/api/analyze` of the active tab, one `[ Download ]` button, one-time token pairing field (stored in `chrome.storage.local`).

### 9.2 Sequence

```
[video page]      content.js        background.js (SW)        FastAPI 127.0.0.1:8765        DownloadManager
    │ DOM ready       │                    │                        │                          │
    │─detect player──►│                    │                        │                          │
    │◄─inject "↓ Download" (once, observed)│                        │                          │
    │                 │                    │                        │                          │
    │ user clicks ────┼─runtime.sendMessage►│  GET /api/status       │                          │
    │                 │                    │─fetch──────────────────►│ 200 (reachability)      │
    │                 │                    │  POST /api/analyze      │                          │
    │                 │                    │─{url}+token────────────►│─Analyzer─yt-dlp         │
    │                 │                    │◄─MediaInfo──────────────│                          │
    │                 │   action.openPopup?() or quick-send defaults │                          │
    │                 │                    │  POST /api/download    │                          │
    │                 │                    │─{url,quality,…}+token─►│─create task, enqueue ───►│
    │                 │                    │◄─202 {id}──────────────│                          │
    │                 │                    │  GET /api/downloads (popup polls for progress)      │
```

### 9.3 Security notes

- Service worker fetch includes `X-Nova-Token`; server enforces origin regex + token.
- The extension sends only: page URL + enum-constrained choices. No paths, no commands.
- Token shown in desktop Settings; user pairs once. If token disabled in Settings, header is optional.
- Desktop app rejects any request whose `Origin` isn't an extension origin (browser `fetch` always sends it; curl dev use documented).

---

## 10. UI page architecture (PySide6/QML)

### 10.1 Window shell

- `Main.qml`: frameless `ApplicationWindow` + custom `TitleBar` (logo, `NovaDownloader` title, min/max/close), drag-to-move, double-click to maximize. (Trade-off: Windows Aero Snap isn't available for frameless v1 — noted, acceptable for premium chrome.)
- `BackgroundLayer`: QML `Video` (muted, looping, cover-scaled) under a dark overlay whose opacity comes from Settings; **falls back to a static gradient when the video file is missing, the setting is off, or initialization fails — never crashes**. Performance-conscious: `sceneGraph`-rendered, paused when window minimized/hidden.
- `Sidebar` + `StackView` hosting pages with push/pop transitions. Sidebar collapses to icon-rail on narrow widths.

### 10.2 Pages ↔ controllers ↔ backend

| Page | QML components used | Controller (context property) | Backend calls |
|---|---|---|---|
| Home | UrlInput, VideoInfoCard, PillSelector, Toast | `AnalyzeController`, `AppController` | `Analyzer.analyze`, `DownloadManager.enqueue` |
| Downloads | DownloadCard ×N, ProgressBar, SpeedGraph | `DownloadsController` | task list model, pause/resume/cancel/retry/reorder, pause/resume all |
| History | list + search field + filter chips + Toast | `HistoryController` | DAO queries, open file/folder (`QDesktopServices`), redownload, clear |
| Settings | category sections, toggles, spin boxes, folder picker | `SettingsController` | Config read/write, pairing token, reset, tray/autostart toggles |

### 10.3 Theming, branding, responsiveness

- `Theme.qml` singleton: palette (deep dark base, glass surfaces, one restrained accent), spacing/radius scale, typography scale, animation-intensity multiplier, blur/overlay factors. **No scattered magic colors/sizes.**
- Branding (name/version/org) flows from `core/branding.py` into QML `rootContext` properties — rename the product in one file.
- Layouts (`ColumnLayout`, `RowLayout`, `GridLayout`) + `anchors`; no absolute-pixel positioning. Content column centers with a max width on 4K. Minimum window 1000×640; designed targets 1280×720 → 3840×2160; DPI-aware via Qt scaling.

### 10.4 Animation inventory (subtle, GPU-cheap)

Page transitions (StackView), card entrance (fade+slide, staggered), button hover glow/press scale, progress fill behavior + shimmer for indeterminate, loading spinner during analysis, completion pulse on cards, toast slide/fade, sidebar selection indicator slide. All `Behavior`/`NumberAnimation`-based; animation-intensity setting scales durations/opacities.

### 10.5 Speed graph

Python side keeps a ring buffer (120 samples @ 500 ms → 60 s) of aggregate speed; computes current/avg/peak/ETA. `SpeedGraph.qml` repaints its Canvas ≤ 8 Hz. CPU stays negligible.

### 10.6 Platform services

- **Clipboard monitor** (`QClipboard.dataChanged`, debounced ~800 ms): URL heuristic → toast "Video URL detected" with `[Analyze] [Ignore]`. Never auto-downloads. Toggle in Settings.
- **System tray** (`QSystemTrayIcon`): Open / Pause All / Resume All / Downloads / Settings / Exit; minimize-to-tray option.
- **Notifications** via tray `showMessage`: started/completed/failed only, throttled per task (no spam).
- **Start with Windows**: HKCU `...\CurrentVersion\Run` write from Settings (opt-in).

---

## 11. Database schema (SQLite, WAL)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS downloads (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  url              TEXT    NOT NULL,
  title            TEXT,
  uploader         TEXT,
  thumbnail_url    TEXT,
  thumbnail_path   TEXT,      -- cached, downscaled local copy
  duration_s       REAL,
  quality          TEXT,      -- 'best' | '4k' | '1080p' | … | 'audio'
  container        TEXT,      -- 'mp4' | 'mkv' | 'webm' | 'mp3'
  audio_language   TEXT,      -- 'original' | ISO 639 code
  subtitle_mode    TEXT,      -- 'none' | 'external' | 'embedded'
  subtitle_lang    TEXT,      -- ISO code or NULL
  status           TEXT    NOT NULL DEFAULT 'queued',
                               -- queued|analyzing|downloading|processing|paused|completed|failed|cancelled
  progress         REAL    NOT NULL DEFAULT 0,     -- 0..1
  total_bytes      INTEGER,
  downloaded_bytes INTEGER NOT NULL DEFAULT 0,
  file_path        TEXT,
  error_code       TEXT,
  error_message    TEXT,
  created_at       TEXT    NOT NULL,               -- ISO 8601 UTC
  updated_at       TEXT    NOT NULL,
  started_at       TEXT,
  completed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads (status);
CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                             -- JSON-encoded
);
```

- Migrations: `PRAGMA user_version` increment + ordered migration list in `core/database.py`.
- Queue persistence = non-terminal rows reloaded at startup; History page = terminal-status rows.
- Speed samples are **not** persisted (memory-only ring buffer).

---

## 12. Configuration & branding

- **Location:** `%APPDATA%\NovaDownloader\config.json` (created with defaults on first run). DB, logs, thumbnail cache beside it; default download folder `~/Downloads/NovaDownloader`.
- **Defaults:**

| Key | Default | Range / notes |
|---|---|---|
| `download_folder` | `~/Downloads/NovaDownloader` | browsable |
| `max_concurrent_downloads` | 3 | 1–6 |
| `connections` (fragments) | 8 | 1–16 |
| `retries` | 3 | 0–10 |
| `speed_limit_kbps` | 0 (off) | maps to `ratelimit` |
| `api_port` | 8765 | 1024–65535, localhost only |
| `api_token_enabled` | true | pairing code in Settings |
| `clipboard_monitor` | false | opt-in |
| `minimize_to_tray` | true | |
| `start_with_windows` | false | |
| `notifications` | true | |
| `animated_background` | true | auto-fallback to gradient |
| `background_opacity` | 0.35 | 0–1 overlay strength |
| `blur_intensity` | 0.5 | 0–1 |
| `animation_intensity` | 1.0 | 0–1.5 scales durations |
| `ffmpeg_path` | auto | empty = discovery order §7 |
| `log_level` | info | debug/info/warning/error |

- Invalid values fall back to defaults with a warning log (config is never trusted blindly).
- **Branding:** `core/branding.py` → `APP_NAME = "NovaDownloader"`, `APP_VERSION`, `ORG_NAME`; injected into QML context, tray, API `/api/status`, installer name. Rename = one file.

---

## 13. Logging

- `logs/app.log`, `logs/downloader.log`, `logs/api.log` — `RotatingFileHandler` each (5 MB × 5 backups).
- Format: `2026-08-23 12:00:00 | INFO     | downloader.engine | message`.
- Qt/warnings routed to `app.log`; yt-dlp verbosity to `downloader.log`; uvicorn/ASGI to `api.log`.
- Users never see tracebacks in the UI — full details (with traceback) go to the matching log file.

---

## 14. Error handling matrix (user-facing, never raw tracebacks)

| Condition | User message (title → body) | Action |
|---|---|---|
| Invalid/empty URL | "Invalid URL" → "Please paste a valid video link." | inline input hint |
| Unsupported page | "Unsupported page" → "This page doesn't expose a downloadable video." | — |
| Private / sign-in required | "Unavailable video" → "This video is private or requires sign-in." | — |
| DRM / protected stream | "Protected content" → "This content is protected and cannot be downloaded." | — |
| Network interrupted | "Download failed" → "The connection was interrupted." + `[Retry]` | keep `.part` |
| Server/extractor error | "Download failed" → mapped engine message + `[Retry]` | log code |
| FFmpeg missing | "FFmpeg not found" → how-to + Settings link | task fails only if needed |
| Disk full (pre-flight) | "Not enough space" → needs X, available Y | block start |
| Permission denied (folder) | "Cannot write to folder" → choose another in Settings | — |
| Cancelled | "Cancelled" | `.part` kept, `[Retry]` |
| API bad token | — (extension UI) "Pairing required — enter the code from Settings" | — |

---

## 15. Performance budget

- UI idle with background video ≤ ~2% CPU on mid-range hardware; gradient mode ≈ 0.
- SpeedGraph ≤ 8 Hz canvas repaint; 60 s / 120-sample window.
- DB writes throttled to ~1 Hz per active task (in-memory store is authoritative).
- Thumbnails: async fetch, local cache, downscaled decode.
- QML: reusable components, no per-frame JS `Timer` chains; animations on the scene graph.
- Logging rotated/capped; debug level opt-in.

---

## 16. Development roadmap (Phases 2–10)

| Phase | Scope | Key files | Verify with |
|---|---|---|---|
| 1 ✅ | Architecture, skeleton, docs | `docs/ARCHITECTURE.md`, folders, `.gitignore` | `find . -type d` |
| 2 | core: branding, paths, config, logger, database (schema+migrations+DAO), utils + unit tests | `core/*`, `tests/test_core*.py` | `pytest` |
| 3 | backend engine: models, ytdlp_engine, ffmpeg, analyzer, format_manager, subtitle_manager + CLI smoke script | `backend/*`, `scripts/smoke_engine.py` | `python scripts/smoke_engine.py analyze <url>` |
| 4 | FastAPI server: routes, schemas, CORS, token, uvicorn thread | `backend/api.py` | `curl http://127.0.0.1:8765/api/status` |
| 5 | QML shell: Main, Theme, TitleBar, Sidebar, BackgroundLayer, Home + analysis card, UrlInput | `qml/*`, `ui/application.py`, `ui/controllers/analyze_controller.py` | `python app.py` |
| 6 | DownloadManager + Downloads & History pages, queue persistence, tray, notifications, clipboard | `backend/download_manager.py`, `ui/controllers/*`, `qml/pages/*` | UI end-to-end |
| 7 | Chrome extension standalone | `extension/*` | load unpacked, popup states |
| 8 | Extension ↔ desktop integration (pairing, analyze, download, progress) | `extension/*`, `backend/api.py` | full E2E |
| 9 | Hardening: error matrix wiring, perf tuning, log polish, regression tests, ruff + import-rule check | across | `pytest`, manual matrix |
| 10 | Packaging: PyInstaller onedir, ffmpeg bundling, README, install docs | `scripts/*`, `README.md` | run built exe |

Each phase follows the working rule: explain → list files → complete code → run/test commands → wait for "NEXT".

---

## 17. Phase 1 verification

```bash
# skeleton
find . -type d | sort
# docs present
ls docs/ARCHITECTURE.md
# toolchain expectations for Phase 2+
python --version          # 3.12+
```

Nothing is executable yet — Phase 1 is design + structure by definition. Phase 2 introduces the first runnable code (`core/` + tests).
