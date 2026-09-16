# Nova Downloader — Development Notes

Nova Downloader is an **Electron** app: the `electron/` main process drives a `yt-dlp`
engine, and `renderer/` is the UI. This document covers the parts that are not obvious
from the code alone.

## Structure
    electron/main.js        Main process: frameless window, settings, IPC, dialogs
    electron/engine.js      yt-dlp queue — analyze, download, progress, pause/resume, dep probe
    electron/store.js       JSON settings in userData (validated/clamped on read)
    electron/backgrounds.js Background-video library (bundled assets/ + uploaded clips)
    electron/sites.js       Per-site quirks (TikTok watermark, Facebook cookies, filenames)
    electron/updater.js     Installs the latest official yt-dlp into bin/ (SHA-256 verified)
    electron/localApi.js    HTTP API on 127.0.0.1 for the browser extension
    electron/preload.js     Safe contextBridge API exposed to the page
    renderer/index.html     Home / Queue / History / Settings pages
    renderer/styles.css     Neon-glass violet theme
    renderer/renderer.js    UI logic wired to the main process over IPC
    assets/background.mp4   <- optional bundled clip (gradient fallback if missing)
    bin/yt-dlp[.exe]        <- optional; else yt-dlp is taken from PATH (see bin/README.md)
    ffmpeg/ffmpeg[.exe]     <- optional; else ffmpeg is taken from PATH

## Run
    npm install
    npm start          # or: npm run dev  (opens DevTools)

yt-dlp and ffmpeg are external programs. They are probed at boot: the Home page shows a
banner if either is missing, and Settings → Advanced shows each tool's version or
"not found" plus a Browse button to point at a custom path.

The banner also appears when yt-dlp is installed but **more than 45 days old**, because
that is the usual cause of a single site breaking while everything else keeps working.
yt-dlp tracks sites that change their pages constantly, so an old build fails per-site —
TikTok and Facebook first — with messages like `Unexpected response from webpage request`.
Those are translated into "update yt-dlp / try cookies" instead of yt-dlp's own
"please report this issue on github" text, which points at a bug that already exists
upstream.

The banner (and **Settings → Advanced → Update**) can install yt-dlp itself: it fetches
the newest official release asset for this platform, checks it against the SHA-256 yt-dlp
publishes alongside it, and only then writes it into `bin/`. `resolveBinary` prefers
`bin/` over PATH, so the app keeps using that copy afterwards. This exists because package
managers lag: `winget upgrade yt-dlp.yt-dlp` reported "no available upgrade" on a build
that was already 52 days old.

**Settings → Advanced → yt-dlp release channel** picks which release the Update button
installs. **Nightly is the default**, on yt-dlp's own advice: its docs describe the latest
stable release as "often 'stale' and prone to external breakage (i.e. sites changing things
on their end)" and call nightly "the recommended channel for regular users of yt-dlp".
Stable is still there for anyone who prefers monthly releases. The asset names and published
checksums are identical either way, so the verification does not change.

    winget install yt-dlp.yt-dlp
    winget install Gyan.FFmpeg
    winget upgrade yt-dlp.yt-dlp     # often behind; the in-app Update button is not

winget's PATH change only applies to *new* terminals — reopen the terminal before
`npm start`, or Electron inherits the stale PATH.

## Background video
Settings → Appearance → **Background library** lists every available clip: anything in
`assets/` (tagged `bundled`, not deletable) plus clips uploaded through the **Upload
video** button. Uploads are copied into `userData/backgrounds`, so the app keeps working
if the original file is moved or deleted. Click a row to use it; the trash icon removes
an uploaded one. The "Animated background" switch turns video off entirely and the
animated gradient takes over. MP4/H.264 is the safe choice — Chromium cannot decode HEVC.

## TikTok, Facebook and other socials
Downloading goes through yt-dlp, so anything it supports works by pasting the link on the
Home page. A few site-specific behaviours are built in (`electron/sites.js`):

- **TikTok** — the watermarked copy TikTok serves alongside the clean one is excluded from
  the format selector, in every branch, with no unfiltered fallback (Settings → Sites →
  "TikTok: skip watermark", on by default). So a download is either clean or it fails with
  an explanation — it never quietly returns the stamped video. The exclusion matches both
  labels the extractor uses: `format_note: watermarked` (mobile API) and the format id
  `download` (web path). The analyze step applies the same filter, so the quality list only
  offers heights a clean download can deliver. Caveat: TikTok occasionally burns the
  watermark into the only stream it has, and no downloader can remove that. Photo/slideshow
  posts have no video and say so plainly instead of failing with a yt-dlp trace.
  Note that TikTok extraction itself breaks upstream every few months — TikTok changes its
  web page and yt-dlp's scraper stops matching. When that happens the app automatically
  retries the post through TikTok's **mobile app API**, which is a separate code path in
  yt-dlp and usually still works. Per yt-dlp's docs that route is enabled by passing
  `device_id` (a random 19-digit value, which is what yt-dlp itself generates) — passing
  `api_hostname` alone does nothing. The retry is a fallback, not the default: the web route
  returns better metadata when it works. A row that fell back says `via mobile API`. If both
  routes fail the message says so, and the error's **Show yt-dlp output** panel contains the
  raw output of *both* attempts.
- **Facebook** — private, friends-only and age-gated videos need a logged-in session:
  Settings → Sites → "Cookies from browser". Reels, `/watch/?v=`, `/videos/` and
  `fb.watch` short links all work.
- **Filenames** — captions are used as titles on these sites, so files are named
  `uploader - first 80 bytes of caption [postid].mp4`. yt-dlp's `--trim-filenames` applies
  to the whole path, so the cap is computed from the download folder's length rather than
  fixed. Windows path limits and repeated captions were both breaking downloads.
- **Profile/feed URLs** — `--playlist-items 1` means a profile link fetches only its
  newest video instead of the whole account.
- **X / Twitter** — same treatment as the others: caption filenames, cookies for
  protected accounts, and the extension button resolves the post on screen.

In the browser, the extension's floating **↓ Download** button resolves the post that is
actually on screen, so it works while scrolling a TikTok, Facebook or X feed — not just on
a dedicated video page. The popup decides for itself when the address bar already points at
a single post (`extension/pageinfo.js` holds those predicates and is loaded by both the
popup and the content script, so they can't disagree) and only asks the page when it's a
feed. That also means the popup keeps working in a tab that was open before the extension
was loaded — Chrome does not re-inject content scripts into existing tabs, so on a feed such
a tab reports "reload this tab" rather than a wrong reason. On any other site the button
only appears when a `<video>` element is actually present.

Cookie access is per-browser: recent Chrome and Edge builds encrypt their cookie store and
may refuse, in which case use Firefox (or close the browser and retry).

## Browser extension
The `extension/` (NovaDownloader Bridge) talks to the local API the app serves:

    GET  /api/status        app alive? queue summary, whether a pairing token is required
    POST /api/analyze       formats/audio/subtitles for a page URL
    POST /api/download      enqueue in the desktop queue
    GET  /api/background    streams the selected background clip (Range-aware)

When the desktop app is running, the extension popup shows "● Connected". The popup uses
the app's theme and plays the same background clip via `/api/background`, so changing the
background in the app changes it in the popup too. Downloads started from the extension
show their progress in the desktop window.

The extension talks to port 8765 by default. If a request fails at the network level it
sweeps 8765–8770 once, and adopts the first port whose `/api/status` identifies itself as
`NovaDownloader` — so changing **Settings → Advanced → API port** to a nearby value needs
no change in the extension. A server that answers but isn't this app is ignored. For a port
outside that range, set the `port` value in the extension's storage yourself.

The page button posts straight to `/api/download` with no `/api/status` pre-check: the
extra round trip could fail on its own, which is how the page could report
"NovaDownloader is not running" while the popup showed "● Connected".

Security note: the local API binds to 127.0.0.1 only and CORS is limited to extension
origins, but it is currently unauthenticated (no pairing token). Fine for personal/local
use; token pairing can be re-enabled if you want stricter access control.

## Notes
- Downloads shell out to `yt-dlp` with argument arrays (never a shell string). Output
  paths are always derived from the configured download folder, never from the extension.
- Progress is parsed from yt-dlp's `[download] xx.x%` lines and streamed to the progress bar.
- The queue reuses one DOM node per task instead of rebuilding the list on every progress
  line. Rebuilding restarted the row's `fadeUp` animation several times a second, which made
  an active download visibly strobe; reuse also lets the progress bar's width transition
  animate and stops the thumbnail being re-fetched each tick.
- When a link fails, the message shown is a translated explanation, with yt-dlp's own output
  kept behind a **Show yt-dlp output** toggle (on the Home page and on the failed queue row).
  That raw text is what distinguishes an upstream extractor break from a bug here.
