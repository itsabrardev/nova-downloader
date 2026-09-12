# Background video

Two ways to get a clip on screen:

1. **In the app** — Settings → Appearance → Background library → **Upload video**.
   The file is *copied* into the app's own data folder (`%APPDATA%/nova-downloader/backgrounds`),
   so moving or deleting the original afterwards is harmless. Uploaded clips can be
   selected or removed from that same list.
2. **Bundled with the app** — drop a video in this folder. Anything here shows in the
   library tagged `bundled` and cannot be deleted from the UI. The default pick is:

       assets/background.mp4

(`.mp4`, `.webm`, `.mov`, `.mkv`, `.m4v` are all picked up automatically.)

- The app loads it automatically (muted, looping, cover-scaled), and the browser
  extension popup streams the *same* clip from the app, so both always match.
- If the file is missing **or the codec can't be decoded**, the UI falls back to an
  animated purple gradient — it never crashes.
- Recommended: 1080p, **H.264 video + AAC audio** in MP4, a few MB, seamless loop.
  Electron/Chromium cannot decode **H.265/HEVC** or most `.mkv` codec combos — if your
  clip doesn't show, re-encode it:

      ffmpeg -i input.mp4 -c:v libx264 -pix_fmt yuv420p -an assets/background.mp4

- Run `npm run dev` to open DevTools; the console prints `[Nova] background video: …`
  or the exact media error code if decoding failed.

You can also drop `bin/yt-dlp.exe` (Windows) or `bin/yt-dlp` (macOS/Linux)
so downloads work without a global install.
