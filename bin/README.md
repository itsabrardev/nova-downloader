# bin/ — yt-dlp goes here

Nova Downloader does not bundle the downloader itself. It looks for `yt-dlp` in this order:

1. the explicit path set in **Settings → Advanced → yt-dlp path**
2. `bin/yt-dlp.exe` (Windows) or `bin/yt-dlp` (macOS/Linux) — this folder
3. whatever `yt-dlp` resolves to on `PATH`

## Install (pick one)

**Drop the binary in here** — download `yt-dlp.exe` from
<https://github.com/yt-dlp/yt-dlp/releases/latest> and save it as `bin/yt-dlp.exe`.
Nothing else to configure.

**Or install it system-wide:**

```powershell
winget install yt-dlp
```

Then restart Nova Downloader so it re-probes `PATH`.

## FFmpeg

FFmpeg is separate and lives in `../ffmpeg/`. It is required for anything above
about 720p (YouTube ships video and audio as separate streams that must be merged)
and for MP3 output. Same resolution order: Settings path → `ffmpeg/ffmpeg.exe` → `PATH`.

```powershell
winget install Gyan.FFmpeg
```

The Home page shows a warning while either tool is missing, and
**Settings → Advanced** reports the detected version of each.

Binaries are git-ignored — keep them out of commits.
