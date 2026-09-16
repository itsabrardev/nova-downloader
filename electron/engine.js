// Nova Downloader — download engine + queue manager.
// Single source of truth for task state; both the desktop UI and the
// local API (browser extension) go through this one instance.
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const https = require("https");
const http  = require("http");
const { EventEmitter } = require("events");
const {
  detectSite, siteLabel, isLoginSite, outputTemplate,
  videoFilter, skipWatermark, isWatermarked, commonArgs, fallbackRoutes, routeLabel,
} = require("./sites");

// The site changed its pages and this yt-dlp build can no longer read them —
// nothing is wrong with the link. Kept separate from a network failure, which
// carries an HTTP status or a urlopen error and is handled elsewhere. Used both
// to translate the message and to decide whether a second extraction route is
// worth trying.
const EXTRACTOR_BREAKAGE = /Unexpected response from webpage request|Unable to extract webpage video data|Unable to extract (?:video|initial|sigi|player|yt initial) data|Cannot parse data|please report this issue on/i;

const STATUS = {
  QUEUED: "queued",
  DOWNLOADING: "downloading",
  PROCESSING: "processing",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};
const TERMINAL = [STATUS.COMPLETED, STATUS.FAILED, STATUS.CANCELLED];

// ---------- binary discovery ----------
// Three roots, because the layout differs between running from source, running
// installed, and updating in place:
//   userData/  the only one writable without admin once the app is installed
//              per-machine, so an in-app yt-dlp update lands here and wins
//   resources/ where bin/ and ffmpeg/ ship (packaged, `__dirname` is inside
//              app.asar — read-only, and spawn() cannot execute from it)
//   ../        the repo layout, where bin/ sits next to electron/
function userDataRoot() {
  try {
    // Required lazily: engine.js is also loadable outside a running Electron app.
    const { app } = require("electron");
    return app && app.getPath ? app.getPath("userData") : null;
  } catch (_) {
    return null;
  }
}

function bundleRoots() {
  const roots = [];
  const userData = userDataRoot();
  if (userData) roots.push(userData);
  if (process.resourcesPath) roots.push(process.resourcesPath);
  roots.push(path.join(__dirname, ".."));
  return roots;
}

// Where a fresh download of a sidecar binary should go. Installed per-machine,
// resources/bin belongs to Administrators, so replacing yt-dlp there fails with
// EPERM — hence the actual write probe rather than fs.accessSync, which on
// Windows only reports the read-only attribute and ignores ACLs. First writable
// candidate wins; failing that, userData, which resolveBinary checks first.
function writableDir(dir) {
  const probe = path.join(dir, `.nova-write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

function bundledDir(localDir) {
  const roots = bundleRoots();
  for (const root of roots) {
    const dir = path.join(root, localDir);
    if (fs.existsSync(dir) && writableDir(dir)) return dir;
  }
  return path.join(roots[0], localDir);
}

function resolveBinary(explicitPath, name, localDir) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  for (const root of bundleRoots()) {
    const bundled = path.join(root, localDir, exe);
    if (fs.existsSync(bundled)) return bundled;
  }
  return exe; // fall back to PATH
}

// ---------- yt-dlp argument construction ----------
// preferVp9Av1: when true, VP9/AV1 streams are tried first — YouTube already
// has these encodes at ~30-50% smaller size with identical visual quality.
// No re-encoding happens; yt-dlp just picks a different stream from the CDN.
// Falls back seamlessly to H.264 for sites that don't publish VP9/AV1.
function selector(heightCap, ext, audioLang, vf = "", preferVp9Av1 = false) {
  const cap = heightCap ? `[height<=${heightCap}]` : "";
  const audios = audioLang && audioLang !== "original"
    ? [`ba[language^=${audioLang}]`, "ba"]
    : ["ba"];

  const branches = [];

  if (preferVp9Av1) {
    // VP9 and AV1 branches first — same visual quality as H.264 but smaller.
    // YouTube publishes both; most other sites only have H.264, so these will
    // simply fall through to the standard branches below.
    for (const ba of audios) {
      branches.push(
        `bv*${cap}[vcodec^=vp09]${vf}+${ba}`,
        `bv*${cap}[vcodec^=av01]${vf}+${ba}`,
      );
    }
  }

  for (const ba of audios) {
    branches.push(`bv*${cap}[ext=${ext}]${vf}+${ba}`, `bv*${cap}${vf}+${ba}`);
  }
  branches.push(`b${cap}${vf}`);
  return branches.join("/");
}

// The quality list the UI offers is built from the *real* heights a site
// publishes (see normalize), and TikTok/Facebook happily serve 540p, 576p or
// 1024p. A fixed lookup table silently returned undefined for those and the
// user's choice was ignored, so parse the number out instead.
function heightOf(quality) {
  const m = /^(\d{2,5})p$/.exec(String(quality || "").trim());
  return m ? Number(m[1]) : 0; // "best" and anything unexpected → no cap
}

function buildArgs(req, outDir, settings, extra = []) {
  const site = detectSite(req.url);
  const args = [
    "--newline",
    "--no-playlist",
    // A profile/feed URL (tiktok.com/@user, a Facebook page) would otherwise
    // enqueue that account's whole back catalogue as one task.
    "--playlist-items", "1",
    "--continue",
    "--no-warnings",
    "-o", path.join(outDir, outputTemplate(site)),
    // TikTok/Facebook captions become the filename; without a cap the full path
    // can exceed what Windows accepts and the download fails at the last step.
    // yt-dlp applies the trim to the whole rendered path, outDir included, so
    // budget against the folder — a flat 180 would cut mid-directory for anyone
    // downloading into a deeply nested folder.
    "--trim-filenames", String(Math.max(60, 240 - outDir.length)),
    "--concurrent-fragments", String(settings.connections || 8),
    "--retries", String(settings.retries || 3),
    "--fragment-retries", String(settings.retries || 3),
  ];
  args.push(...commonArgs(site, settings));

  const ffmpeg = resolveBinary(settings.ffmpegPath, "ffmpeg", "ffmpeg");
  if (path.isAbsolute(ffmpeg)) args.push("--ffmpeg-location", ffmpeg);

  if (settings.speedLimitKbps > 0) args.push("--limit-rate", `${settings.speedLimitKbps}K`);

  const fmt = String(req.format || "mp4").toLowerCase();
  const quality = String(req.quality || "best").toLowerCase();
  const heightCap = heightOf(quality);
  const audioLang = req.audioLanguage || req.audio_language || "original";

  if (fmt === "mp3" || fmt === "audio") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    if (audioLang && audioLang !== "original") args.push("-f", `ba[language^=${audioLang}]/ba`);
  } else {
    const container = ["mp4", "webm", "mkv"].includes(fmt) ? fmt : "mp4";
    args.push("--merge-output-format", container);
    args.push("-f", selector(heightCap, container === "mkv" ? "mp4" : container, audioLang,
      videoFilter(site, settings), !!settings.preferVp9Av1));
  }

  // Subtitles
  const subMode = req.subtitleMode || req.subtitle_mode || "none";
  const subLang = req.subtitleLang || req.subtitle_lang || "";
  if (subMode !== "none" && subLang) {
    args.push("--sub-langs", subLang);
    args.push(subMode === "embedded" ? "--embed-subs" : "--write-subs");
  }

  // Thumbnail: embed into the file so media players show artwork.
  // For video → --embed-thumbnail (adds cover art to MP4/MKV container).
  // For audio → --embed-thumbnail (ID3 tag art for MP3/M4A).
  // Only enabled when settings.embedThumbnail is true (default on).
  if (settings.embedThumbnail !== false) {
    args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }

  // `extra` is appended last but still before the URL — a retry's
  // --extractor-args has to sit with the other options, not after the target.
  args.push(...extra);
  args.push(req.url);
  return args;
}

// ---------- Task / Manager ----------
let nextId = 1;

class Engine extends EventEmitter {
  constructor(getSettings, getDownloadDir) {
    super();
    this.getSettings = getSettings;
    this.getDownloadDir = getDownloadDir;
    this.tasks = new Map(); // id -> task
  }

  // ----- public API -----
  enqueue(req) {
    const settings = this.getSettings();
    const folder = req.folder && fs.existsSync(req.folder) ? req.folder : this.getDownloadDir();
    const url = String(req.url || "").trim();
    // Direct tasks (OmniSave movies) carry a ready-made file URL — no yt-dlp
    // extraction, just an HTTP GET. They still live in the same queue so the
    // UI, concurrency limit and pause/cancel all behave identically.
    const direct = !!req.direct;
    const site = direct ? "omnisave" : detectSite(url);
    const task = {
      id: nextId++,
      url,
      direct,
      filename: req.filename || "",   // direct only; the on-disk name
      downloadHeaders: req.downloadHeaders || req.headers || null, // direct only; Referer/UA etc.
      site,                       // used for site-aware args and error messages
      siteLabel: direct ? "Movies" : siteLabel(site), // shown in the queue row
      title: req.title || req.url,
      thumbnail: req.thumbnail || "",
      uploader: req.uploader || "",
      format: req.format || settings.defaultFormat,
      quality: req.quality || settings.defaultQuality,
      audioLanguage: req.audioLanguage || req.audio_language || settings.defaultAudioLanguage,
      subtitleMode: req.subtitleMode || req.subtitle_mode || settings.defaultSubtitleMode,
      subtitleLang: req.subtitleLang || req.subtitle_lang || settings.defaultSubtitleLang,
      folder,
      status: STATUS.QUEUED,
      percent: 0,
      speed: null,
      eta: null,
      size: null,
      filePath: null,
      error: null,
      source: req.source || "app",
      createdAt: Date.now(),
      _child: null,
      // Optional async callback () => Promise<string> that mints a fresh download
      // URL. OmniSave links carry sign+t params that expire within minutes, so
      // the retry loop calls this before each new attempt instead of reusing a
      // link that is already stale.
      _refreshUrl: req.refreshUrl || null,
    };
    if (!/^https?:\/\//i.test(task.url)) {
      task.status = STATUS.FAILED;
      task.error = "Invalid URL — must start with http:// or https://";
      this.tasks.set(task.id, task);
      this.emit("task", this.dto(task));
      return this.dto(task);
    }
    this.tasks.set(task.id, task);
    this.emit("task", this.dto(task));
    this.pump();
    return this.dto(task);
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt).map((t) => this.dto(t));
  }

  counts() {
    const all = [...this.tasks.values()];
    return {
      active: all.filter((t) => t.status === STATUS.DOWNLOADING || t.status === STATUS.PROCESSING).length,
      queued: all.filter((t) => t.status === STATUS.QUEUED).length,
    };
  }

  pause(id) {
    const t = this.tasks.get(id);
    if (!t || TERMINAL.includes(t.status)) return false;
    t._userPaused = true;
    if (t._child) {
      t._child.kill(); // partial .part file is kept; --continue resumes it
    } else {
      this.setStatus(t, STATUS.PAUSED);
    }
    return true;
  }

  resume(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== STATUS.PAUSED) return false;
    t._userPaused = false;
    this.setStatus(t, STATUS.QUEUED);
    this.pump();
    return true;
  }

  cancel(id) {
    const t = this.tasks.get(id);
    if (!t || TERMINAL.includes(t.status)) return false;
    t._cancelled = true;
    if (t._child) t._child.kill();
    else this.setStatus(t, STATUS.CANCELLED);
    return true;
  }

  retry(id) {
    const t = this.tasks.get(id);
    if (!t || !TERMINAL.includes(t.status)) return false;
    t._cancelled = false;
    t._userPaused = false;
    t.error = null;
    t.errorDetails = null;
    // A manual retry starts from the normal extraction route again: yt-dlp may
    // have been updated since, and the web route returns better metadata.
    t._fallbackStep = 0;
    t._extraArgs = null;
    t._errLog = null;
    t.usedFallback = false;
    t.percent = 0;
    // _refreshUrl is intentionally preserved: OmniSave direct tasks need it to
    // mint a fresh (non-expired) URL on every new attempt. Clearing it would
    // make user retries fail on the same stale link.
    this.setStatus(t, STATUS.QUEUED);
    this.pump();
    return true;
  }

  remove(id) {
    const t = this.tasks.get(id);
    if (!t) return false;
    if (!TERMINAL.includes(t.status)) this.cancel(id);
    this.tasks.delete(id);
    this.emit("removed", { id });
    return true;
  }

  pauseAll() {
    [...this.tasks.keys()].forEach((id) => this.pause(id));
  }

  resumeAll() {
    [...this.tasks.keys()].forEach((id) => this.resume(id));
  }

  clearFinished() {
    for (const [id, t] of this.tasks) {
      if (TERMINAL.includes(t.status)) this.tasks.delete(id);
    }
    this.emit("cleared", {});
  }

  // ----- internals -----
  setStatus(task, status) {
    task.status = status;
    this.emit("task", this.dto(task));
  }

  dto(t) {
    const { _child, _cancelled, _userPaused, _fallbackStep, _extraArgs, _errLog, _refreshUrl, ...rest } = t;
    return rest;
  }

  // Start queued tasks while under the concurrency limit.
  pump() {
    const max = Math.max(1, this.getSettings().maxConcurrent || 3);
    while (this.counts().active < max) {
      const next = [...this.tasks.values()]
        .filter((t) => t.status === STATUS.QUEUED)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!next) break;
      this.run(next);
    }
  }

  run(task) {
    if (task.direct) return this.runDirect(task);
    const settings = this.getSettings();
    const bin = resolveBinary(settings.ytdlpPath, "yt-dlp", "bin");
    // `_extraArgs` is set by the retry below, so a second attempt reuses every
    // other decision (format selector, output template, cookies) unchanged.
    const args = buildArgs(task, task.folder, settings, task._extraArgs || []);

    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (_) {
      task.error = "Could not launch yt-dlp. Put yt-dlp in ./bin or install it on PATH.";
      this.setStatus(task, STATUS.FAILED);
      return;
    }
    task._child = child;
    this.setStatus(task, STATUS.DOWNLOADING);

    const progressRe = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([^\s]+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([\d:]+))?/;
    const simpleRe = /\[download\]\s+([\d.]+)%/;
    let stderrTail = "";

    const handle = (buf) => {
      if (!this.tasks.has(task.id)) return; // removed mid-download
      const text = buf.toString();
      for (const line of text.split(/\r|\n/)) {
        if (!line.trim()) continue;

        const m = progressRe.exec(line) || simpleRe.exec(line);
        if (m) {
          task.percent = parseFloat(m[1]);
          if (m[2]) task.size = m[2];
          if (m[3]) task.speed = m[3];
          if (m[4]) task.eta = m[4];
          if (task.status !== STATUS.DOWNLOADING) task.status = STATUS.DOWNLOADING;
          this.emit("task", this.dto(task));
          continue;
        }
        // Post-processing (merge / extract / embed)
        if (/\[Merger\]|\[ExtractAudio\]|\[EmbedSubtitle\]|\[VideoRemuxer\]/.test(line)) {
          task.speed = null;
          task.eta = null;
          this.setStatus(task, STATUS.PROCESSING);
          continue;
        }
        // Final file path. An HD download arrives as two streams, and the
        // merger announces the result as `Merging formats into "…"` — not with a
        // `Destination:` line. Matching only the latter left filePath pointing
        // at the intermediate `Title.f137.mp4`, which yt-dlp then deletes, so
        // "Open file" and "Show in folder" quietly did nothing. Merger wins.
        const dest = /\[Merger\]\s+Merging formats into\s+"(.+)"\s*$/.exec(line)
          || /\[(?:Merger|ExtractAudio|VideoRemuxer)\].*?Destination:\s*(.+)$/.exec(line)
          || /\[download\]\s+Destination:\s*(.+)$/.exec(line);
        if (dest) task.filePath = dest[1].trim();

        // Title, when we enqueued with only a URL
        const titleMatch = /\[info\]\s+(.+?):\s+Downloading/.exec(line);
        if (titleMatch && task.title === task.url) {
          task.title = titleMatch[1];
          this.emit("task", this.dto(task));
        }
      }
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", (buf) => {
      stderrTail = (stderrTail + buf.toString()).slice(-2000);
      handle(buf);
    });

    child.on("error", () => {
      task._child = null;
      if (!this.tasks.has(task.id)) return this.pump();
      task.error = "yt-dlp not found. Put yt-dlp(.exe) in ./bin or install it on PATH.";
      this.setStatus(task, STATUS.FAILED);
      this.pump();
    });

    child.on("close", (code) => {
      task._child = null;
      task.speed = null;
      task.eta = null;

      // The task may have been removed while yt-dlp was still shutting down;
      // emitting here would resurrect a deleted row in the UI.
      if (!this.tasks.has(task.id)) return this.pump();

      if (task._cancelled) {
        this.setStatus(task, STATUS.CANCELLED);
      } else if (task._userPaused) {
        this.setStatus(task, STATUS.PAUSED);
      } else if (code === 0) {
        task.percent = 100;
        if (this.getSettings().compressAfterDownload && task.filePath && /\.(mp4|mkv|webm)$/i.test(task.filePath)) {
          this.setStatus(task, STATUS.PROCESSING);
          this.compressVideo(task).then(() => {
            this.setStatus(task, STATUS.COMPLETED);
            this.pump();
          }).catch((err) => {
            // Compression failed — keep the original file, just warn in the title
            console.warn("[Nova] compression failed:", err && err.message);
            task.note = "Compression failed — original kept.";
            this.setStatus(task, STATUS.COMPLETED);
            this.pump();
          });
          return; // pump() will be called inside compressVideo chain
        }
        this.setStatus(task, STATUS.COMPLETED);
      } else {
        // The site's normal extraction route broke. Some sites have others
        // (TikTok's mobile API, one entry per regional host), so work through
        // them before giving up — this is the difference between "TikTok is down
        // for a month" and "it works". Each stderr is kept: the last route's
        // output alone doesn't say whether the earlier ones failed the same way.
        const routes = fallbackRoutes(task.site);
        const step = task._fallbackStep || 0;
        task._errLog = task._errLog || [];
        task._errLog.push({ label: step ? routeLabel(routes[step - 1]) : "default route", err: stderrTail });
        if (step < routes.length && EXTRACTOR_BREAKAGE.test(stderrTail)) {
          task._fallbackStep = step + 1;
          task._extraArgs = routes[step];
          // Visible in the queue row: the bar jumping back to 0% is otherwise
          // unexplained.
          task.usedFallback = true;
          task.percent = 0;
          task.size = null;
          this.run(task); // keeps the same concurrency slot, so no pump() here
          return;
        }
        task.error = friendlyError(stderrTail, code, task.site);
        task.errorDetails = detailsFromLog(task._errLog);
        this.setStatus(task, STATUS.FAILED);
      }
      this.pump();
    });
  }


  // Re-encode a downloaded video to H.265 (HEVC) with CRF 28 to cut file size
  // ~50% without any perceptible quality loss. Runs after yt-dlp exits with code 0
  // when compressAfterDownload is on. The original file is replaced on success.
  compressVideo(task) {
    return new Promise((resolve, reject) => {
      const settings  = this.getSettings();
      const ffmpeg    = resolveBinary(settings.ffmpegPath, "ffmpeg", "ffmpeg");
      const inPath    = task.filePath;
      const outPath   = inPath.replace(/(\.[^.]+)$/, "_nova_compressed$1");
      const preset    = settings.compressPreset || "medium";

      // Get video duration so we can compute percent from the `time=` field.
      // `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1`
      const ffprobe   = resolveBinary(settings.ffmpegPath, "ffprobe", "ffmpeg");
      const getDuration = () => new Promise((res) => {
        let out = "";
        let child;
        try {
          child = spawn(ffprobe, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inPath,
          ], { windowsHide: true });
        } catch (_) { return res(0); }
        child.stdout.on("data", (b) => (out += b.toString()));
        child.on("error", () => res(0));
        child.on("close", () => res(parseFloat(out) || 0));
      });

      const doEncode = (duration) => {
        task.compressing = true;
        task.note = "Compressing…";
        task.percent = 0;
        this.emit("task", this.dto(task));

        let child;
        try {
          child = spawn(ffmpeg, [
            "-y",
            "-i",  inPath,
            "-c:v", "libx265",
            "-crf", "28",
            "-preset", preset,
            "-c:a", "copy",
            // hvc1 tag makes H.265 playable on macOS/iOS QuickTime
            "-tag:v", "hvc1",
            outPath,
          ], { windowsHide: true });
        } catch (err) {
          task.compressing = false;
          task.note = null;
          return reject(err);
        }

        // ffmpeg writes progress to stderr: `frame=… fps=… time=HH:MM:SS.ss …`
        const timeRe = /time=(\d+):(\d+):([\d.]+)/;
        child.stderr.on("data", (buf) => {
          if (!duration) return;
          const m = timeRe.exec(buf.toString());
          if (!m) return;
          const elapsed = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
          task.percent  = Math.min(99, (elapsed / duration) * 100);
          this.emit("task", this.dto(task));
        });

        child.on("error", (err) => {
          task.compressing = false;
          task.note = null;
          reject(err);
        });

        child.on("close", (code) => {
          task.compressing = false;
          task.note = null;
          task.percent = 100;

          if (code !== 0) {
            // Clean up failed output and reject so the caller keeps the original
            try { fs.unlinkSync(outPath); } catch (_) {}
            return reject(new Error(`ffmpeg exited with code ${code}`));
          }

          // Replace original with compressed file atomically
          try {
            fs.renameSync(outPath, inPath);
            // Update filePath in case the caller reads it
            task.filePath = inPath;
          } catch (e) {
            // If rename fails (cross-device), try copy + delete
            try {
              fs.copyFileSync(outPath, inPath);
              fs.unlinkSync(outPath);
              task.filePath = inPath;
            } catch (e2) {
              return reject(e2);
            }
          }
          resolve();
        });
      };

      getDuration().then(doEncode);
    });
  }

  // IDM-style parallel range downloader for direct MP4 URLs (OmniSave movies).
  //
  // Instead of a single HTTP stream (which CDNs rate-limit), this opens N
  // simultaneous connections each downloading a different byte range — exactly
  // how IDM works. Benefits:
  //   • One connection getting a 429 doesn't stall the others; it backs off and
  //     retries while the rest continue at full speed.
  //   • Each range request is small, so the CDN treats them like a normal browser
  //     fetching the file progressively.
  //   • Part files are preserved on pause so the download resumes from each
  //     chunk's exact offset.
  //   • 403 (expired sign+t URL) triggers _refreshUrl() once, then retries all
  //     pending chunks with the fresh URL.
  runDirect(task) {
    const settings   = this.getSettings();
    const CONNS      = Math.min(Number(settings.connections) || 8, 16);
    const dlHeaders  = { ...(task.downloadHeaders || {}) };

    const safe    = sanitizeFilename(task.filename || task.title || "download.mp4");
    const outPath = path.join(task.folder, safe);


    // ---------- low-level helpers ----------

    // Promisified single HTTP(S) request. Returns the IncomingMessage.
    // agent:false bypasses Node.js's global HTTPS agent which has maxSockets=5
    // — without this, connections 6-8 queue up and the download appears stuck.
    // A 30-second socket timeout prevents silent hangs.
    const request = (url, opts) => new Promise((resolve, reject) => {
      const u   = new URL(url);
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.request(
        Object.assign({
          hostname: u.hostname,
          port:     u.port || undefined,
          path:     u.pathname + u.search,
          agent:    false,     // one fresh connection per request, no limit
        }, opts),
        resolve,
      );
      req.setTimeout(30000, () => { req.destroy(new Error("socket timeout")); });
      req.on("error", reject);
      req.end();
    });

    // HEAD request → Content-Length (0 if not provided or on error).
    const getFileSize = async (url) => {
      try {
        const res = await request(url, { method: "HEAD", headers: dlHeaders });
        res.resume();
        if (res.statusCode === 200 || res.statusCode === 206)
          return parseInt(res.headers["content-length"] || "0", 10) || 0;
        return 0;
      } catch (_) { return 0; }
    };



    // Download bytes [rangeStart+offset … rangeEnd] to partPath (append mode
    // when offset > 0). Calls onBytes(n) with each received chunk.
    // Rejects with {status} on HTTP errors so the caller can classify them.
    const fetchRange = (url, rangeStart, rangeEnd, partPath, offset, onBytes) =>
      new Promise((resolve, reject) => {
        request(url, {
          method: "GET",
          headers: { ...dlHeaders, Range: `bytes=${rangeStart + offset}-${rangeEnd}` },
        }).then((res) => {
          if (res.statusCode === 429 || res.statusCode >= 500) {
            res.resume();
            const e = Object.assign(new Error(`HTTP ${res.statusCode}`), {
              status: res.statusCode,
              retryAfter: parseInt(res.headers["retry-after"] || "0", 10) || 0,
            });
            return reject(e);
          }
          if (res.statusCode === 403 || res.statusCode === 404 || res.statusCode === 410) {
            res.resume();
            return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
          }
          if (res.statusCode !== 206 && res.statusCode !== 200) {
            res.resume();
            return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
          }
          const out = fs.createWriteStream(partPath, { flags: offset > 0 ? "a" : "w" });
          res.on("data", (chunk) => { onBytes(chunk.length); });
          res.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
          res.on("error", reject);
        }).catch(reject);
      });

    // ---------- state ----------
    let stopped     = false;   // set when paused or cancelled
    let urlRefreshed = false;  // only refresh once across all chunks
    let currentUrl  = task.url;

    // Cooperative sleep that resolves false immediately if stopped.
    const sleep = (ms) => new Promise((ok) => {
      if (stopped) return ok(false);
      const t = setTimeout(() => ok(true), ms);
      // Let pause/cancel cut the wait short.
      const check = setInterval(() => { if (stopped) { clearTimeout(t); clearInterval(check); ok(false); } }, 200);
      setTimeout(() => clearInterval(check), ms + 500);
    });

    task._child = { kill: () => { stopped = true; } };
    this.setStatus(task, STATUS.DOWNLOADING);

    // ---------- progress ----------
    const bytesPerChunk = [];  // bytes received so far per chunk index
    let totalSize   = 0;
    let lastEmitAt  = 0;
    let lastBytes   = 0;
    let lastTime    = Date.now();

    const setNote = (txt) => { task.note = txt || null; this.emit("task", this.dto(task)); };

    const onBytes = (chunkIndex, n) => {
      bytesPerChunk[chunkIndex] = (bytesPerChunk[chunkIndex] || 0) + n;
      const now   = Date.now();
      if (now - lastEmitAt < 300) return;
      lastEmitAt  = now;
      const total = bytesPerChunk.reduce((a, b) => a + b, 0);
      if (totalSize > 0) task.percent = Math.min(99.9, (total / totalSize) * 100);
      const dt  = (now - lastTime) / 1000;
      if (dt > 0) {
        const bps = (total - lastBytes) / dt;
        task.speed = bps > 0 ? `${formatBytes(bps)}/s` : null;
        if (totalSize > 0 && bps > 0)
          task.eta = fmtEta((totalSize - total) / bps);
      }
      lastBytes = total;
      lastTime  = now;
      this.emit("task", this.dto(task));
    };

    // ---------- per-chunk download loop ----------
    const downloadChunk = async (i, chunkStart, chunkEnd, partPath, initOffset) => {
      let offset  = initOffset;
      let attempt = 0;

      while (offset < chunkEnd - chunkStart + 1) {
        if (stopped) return;
        try {
          await fetchRange(currentUrl, chunkStart, chunkEnd, partPath, offset,
            (n) => { offset += n; onBytes(i, n); });
          return; // chunk complete
        } catch (e) {
          if (stopped) return;
          const status = e.status || 0;

          if (status === 429 || status >= 500) {
            attempt++;
            const wait = e.retryAfter > 0
              ? Math.min(e.retryAfter * 1000, 60000)
              : Math.min(attempt * 8000, 60000);           // 8s, 16s, 24s…
            setNote(`CDN busy (${status}) — chunk ${i + 1} retries in ${Math.round(wait / 1000)}s…`);
            const ok = await sleep(wait);
            setNote(null);
            if (!ok || stopped) return;
            continue; // retry same chunk, same URL
          }

          if (status === 403 || status === 404 || status === 410) {
            // Signed URL expired — refresh once, then retry all chunks.
            if (!urlRefreshed && typeof task._refreshUrl === "function") {
              urlRefreshed = true;
              try {
                const fresh = await task._refreshUrl();
                if (fresh) { currentUrl = fresh; task.url = fresh; }
              } catch (_) { /* keep original */ }
              attempt = 0;
              continue; // retry with (possibly new) URL
            }
            // Already refreshed or no callback — give up this chunk.
            throw e;
          }

          throw e; // network error, disk error, etc.
        }
      }
    };

    // ---------- main flow ----------
    const run = async () => {
      // 1. Get file size for chunk planning.
      setNote("connecting…");
      let size = await getFileSize(currentUrl);

      // If HEAD fails or server doesn't send Content-Length, fall back to
      // single-connection download (still handles 429 with backoff).
      if (!size || size <= 0) {
        setNote(null);
        // Single stream fallback — chunk 0 covers the whole file.
        bytesPerChunk[0] = 0;
        let offset = 0;
        try { offset = fs.statSync(outPath + ".part0").size; } catch (_) {}
        bytesPerChunk[0] = offset;
        await downloadChunk(0, 0, Number.MAX_SAFE_INTEGER, outPath + ".part0", offset);
        if (!stopped) fs.renameSync(outPath + ".part0", outPath);
        return;
      }

      totalSize  = size;
      task.size  = formatBytes(size);
      setNote(null);

      // 2. Plan chunks, restore existing offsets for resume.
      const chunkSize = Math.ceil(size / CONNS);
      const chunks    = Array.from({ length: CONNS }, (_, i) => {
        const start   = i * chunkSize;
        const end     = Math.min(start + chunkSize - 1, size - 1);
        const part    = `${outPath}.part${i}`;
        let   initOff = 0;
        try { initOff = Math.min(fs.statSync(part).size, end - start + 1); } catch (_) {}
        bytesPerChunk[i] = initOff;
        return { i, start, end, part, initOff };
      });

      // 3. Download all chunks in parallel.
      await Promise.all(
        chunks.map(({ i, start, end, part, initOff }) =>
          downloadChunk(i, start, end, part, initOff)),
      );

      if (stopped) return;

      // 4. Assemble part files into the final output file.
      setNote("assembling…");
      const out = fs.createWriteStream(outPath);
      for (const { part } of chunks) {
        await new Promise((ok, fail) => {
          if (!fs.existsSync(part)) return ok();
          const inp = fs.createReadStream(part);
          inp.pipe(out, { end: false });
          inp.on("end",   () => { try { fs.unlinkSync(part); } catch (_) {} ok(); });
          inp.on("error", fail);
        });
      }
      await new Promise((ok, fail) => { out.end(); out.on("finish", ok); out.on("error", fail); });
      setNote(null);
    };

    run().then(() => {
      task._child = null;
      task.speed  = null;
      task.eta    = null;
      task.note   = null;
      if (!this.tasks.has(task.id)) return this.pump();
      if (task._cancelled) {
        // Delete all part files.
        const base = outPath;
        for (let i = 0; i < CONNS; i++)
          try { fs.unlinkSync(`${base}.part${i}`); } catch (_) {}
        try { fs.unlinkSync(base + ".part0"); } catch (_) {}
        this.setStatus(task, STATUS.CANCELLED);
        this.pump();
        return;
      }
      if (stopped) { // paused
        this.setStatus(task, STATUS.PAUSED);
        this.pump();
        return;
      }
      task.percent  = 100;
      task.filePath = outPath;
      this.setStatus(task, STATUS.COMPLETED);
      this.pump();
    }).catch((e) => {
      task._child = null;
      task.speed  = null;
      task.eta    = null;
      task.note   = null;
      if (!this.tasks.has(task.id)) return this.pump();
      if (stopped) {
        if (task._cancelled) this.setStatus(task, STATUS.CANCELLED);
        else                  this.setStatus(task, STATUS.PAUSED);
        this.pump();
        return;
      }
      const status = e && e.status;
      task.error = status === 403 || status === 404
        ? "The download link expired. Open the title in Movies and download again."
        : status === 429
        ? "CDN is rate-limiting. Wait a minute and tap Retry."
        : e && e.message
        ? e.message
        : "Download failed.";
      this.setStatus(task, STATUS.FAILED);
      this.pump();
    });
  }



  // Analyze a URL: real formats / audio languages / subtitles, no invented data.
  analyze(url) {
    return new Promise((resolve, reject) => {
      if (!/^https?:\/\//i.test(String(url || "").trim())) {
        reject({ code: "INVALID_URL", message: "Please provide a valid http(s) URL." });
        return;
      }
      const settings = this.getSettings();
      const site = detectSite(url);
      const bin = resolveBinary(settings.ytdlpPath, "yt-dlp", "bin");
      // Same cookies/referer as the download, otherwise a Facebook post can
      // analyze fine and then fail, or vice versa. `-I 1` keeps a profile URL
      // from walking an entire account before answering.
      const base = ["-J", "--no-playlist", "--playlist-items", "1", "--no-warnings",
        ...commonArgs(site, settings)];

      // One extraction attempt. `step` is 0 for the normal route; when that route
      // turns out to be broken upstream, the same call runs again with the site's
      // next alternative route (TikTok's mobile API hosts) appended. `log` keeps
      // every stderr so the details panel can show how *each* route failed — the
      // last failure alone is misleading.
      const routes = fallbackRoutes(site);
      const attempt = (step, log) => {
        const extra = step ? routes[step - 1] : [];
        const label = step ? routeLabel(routes[step - 1]) : "default route";
        let out = "";
        let err = "";
        let child;
        try {
          child = spawn(bin, [...base, ...extra, url], { windowsHide: true });
        } catch (_) {
          reject({ code: "ENGINE_ERROR", message: "Could not launch yt-dlp." });
          return;
        }
        child.stdout.on("data", (b) => (out += b.toString()));
        child.stderr.on("data", (b) => (err += b.toString()));
        child.on("error", () =>
          reject({ code: "ENGINE_ERROR", message: "yt-dlp not found. Put it in ./bin or on PATH." }));
        child.on("close", (code) => {
          if (code !== 0 || !out.trim()) {
            const tried = [...log, { label, err }];
            if (step < routes.length && EXTRACTOR_BREAKAGE.test(err)) return attempt(step + 1, tried);
            // `details` carries the untranslated yt-dlp output. friendlyError()
            // deliberately hides it, but when a site breaks upstream that raw text
            // is the only thing that says *which* extractor path failed.
            reject({
              code: "UNSUPPORTED_URL",
              message: friendlyError(err, code, site),
              details: detailsFromLog(tried),
            });
            return;
          }
          try {
            const info = JSON.parse(out);
            // A profile/feed URL comes back as a playlist; describe its first
            // item, which is also the one a download would fetch.
            const first = info && info._type === "playlist" && Array.isArray(info.entries)
              ? info.entries.find(Boolean)
              : null;
            // The quality list has to describe what a download will actually
            // fetch: with "skip watermark" on, offering a height that only the
            // stamped copy has would just produce a failed task later.
            resolve(normalize(first || info, url, site, skipWatermark(site, settings)));
          } catch (_) {
            reject({ code: "ENGINE_ERROR", message: "Could not parse media info." });
          }
        });
      };

      attempt(0, []);
    });
  }

  // Fetch all video entries from a YouTube playlist (or any playlist URL).
  // Uses --flat-playlist so yt-dlp doesn't download anything — it just reads
  // the playlist manifest from YouTube's API.
  analyzePlaylist(url) {
    return new Promise((resolve, reject) => {
      if (!/^https?:\/\//i.test(String(url || "").trim())) {
        reject({ code: "INVALID_URL", message: "Please provide a valid playlist URL." });
        return;
      }
      const settings = this.getSettings();
      const bin = resolveBinary(settings.ytdlpPath, "yt-dlp", "bin");
      const args = [
        "-J",
        "--flat-playlist",
        "--no-warnings",
        ...commonArgs(detectSite(url), settings),
        url,
      ];
      let out = "";
      let err = "";
      let child;
      try {
        child = spawn(bin, args, { windowsHide: true });
      } catch (_) {
        reject({ code: "ENGINE_ERROR", message: "Could not launch yt-dlp." });
        return;
      }
      child.stdout.on("data", (b) => (out += b.toString()));
      child.stderr.on("data", (b) => (err += b.toString()));
      child.on("error", () => reject({ code: "ENGINE_ERROR", message: "yt-dlp not found." }));
      child.on("close", (code) => {
        if (code !== 0 || !out.trim()) {
          reject({ code: "UNSUPPORTED_URL", message: friendlyError(err, code, "youtube") });
          return;
        }
        try {
          const info = JSON.parse(out);
          // Normalise: a direct playlist URL gives _type=playlist; a single
          // video URL treated as a playlist gives _type=video — wrap it.
          const entries = info._type === "playlist"
            ? (info.entries || []).filter(Boolean)
            : [info];
          resolve({
            id:         info.id || "",
            title:      info.title || info.webpage_url_basename || "Playlist",
            uploader:   info.uploader || info.channel || "",
            thumbnail:  info.thumbnail || (entries[0] && entries[0].thumbnail) || "",
            count:      entries.length,
            url:        url,
            entries: entries.map((e, i) => ({
              index:     i + 1,
              id:        e.id || "",
              title:     e.title || `Video ${i + 1}`,
              duration:  e.duration || 0,
              thumbnail: e.thumbnail || e.thumbnails?.[0]?.url || "",
              url:       e.url || e.webpage_url || `https://www.youtube.com/watch?v=${e.id}`,
            })),
          });
        } catch (_) {
          reject({ code: "ENGINE_ERROR", message: "Could not parse playlist info." });
        }
      });
    });
  }

  // Search YouTube for playlists by keyword.
  // Uses YouTube's built-in playlist filter (&sp=EgIQAw%3D%3D) so only
  // playlist results come back, not individual videos.
  searchPlaylists(query) {
    return new Promise((resolve, reject) => {
      if (!query || !query.trim()) {
        reject({ code: "INVALID_QUERY", message: "Please enter a search term." });
        return;
      }
      const settings = this.getSettings();
      const bin = resolveBinary(settings.ytdlpPath, "yt-dlp", "bin");
      const q = encodeURIComponent(query.trim());
      // sp=EgIQAw%3D%3D → YouTube playlist filter
      const searchUrl = `https://www.youtube.com/results?search_query=${q}&sp=EgIQAw%3D%3D`;
      const args = [
        "--flat-playlist",
        "--no-warnings",
        "-j",               // one JSON object per line (each playlist result)
        "--playlist-items", "1:15",  // up to 15 results
        ...commonArgs("youtube", settings),
        searchUrl,
      ];
      let out = "";
      let err = "";
      let child;
      try {
        child = spawn(bin, args, { windowsHide: true });
      } catch (_) {
        reject({ code: "ENGINE_ERROR", message: "Could not launch yt-dlp." });
        return;
      }
      child.stdout.on("data", (b) => (out += b.toString()));
      child.stderr.on("data", (b) => (err += b.toString()));
      child.on("error", () => reject({ code: "ENGINE_ERROR", message: "yt-dlp not found." }));
      child.on("close", (code) => {
        if ((code !== 0 && !out.trim())) {
          reject({ code: "SEARCH_FAILED", message: "No playlists found. Try a different keyword." });
          return;
        }
        try {
          const results = out.trim().split("\n")
            .filter(Boolean)
            .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
            .filter(Boolean)
            .map(p => ({
              id:        p.id || p.playlist_id || "",
              title:     p.title || p.playlist_title || "Untitled Playlist",
              channel:   p.uploader || p.channel || p.playlist_uploader || "",
              thumbnail: p.thumbnail || p.thumbnails?.[0]?.url || "",
              count:     p.playlist_count || p.n_entries || 0,
              url:       p.url || p.webpage_url || (p.id ? `https://www.youtube.com/playlist?list=${p.id}` : ""),
            }))
            .filter(p => p.url);
          if (!results.length) {
            reject({ code: "SEARCH_FAILED", message: "No playlists found. Try a different keyword." });
            return;
          }
          resolve(results);
        } catch (_) {
          reject({ code: "ENGINE_ERROR", message: "Could not parse search results." });
        }
      });
    });
  }

  // Are the external tools actually runnable? Checked at boot so the UI can
  // say so up front instead of failing on the first download.
  deps() {
    const s = this.getSettings();
    const ytdlp = resolveBinary(s.ytdlpPath, "yt-dlp", "bin");
    const ffmpeg = resolveBinary(s.ffmpegPath, "ffmpeg", "ffmpeg");
    return Promise.all([probe(ytdlp, ["--version"]), probe(ffmpeg, ["-version"])]).then(([a, b]) => ({
      ytdlp: { path: ytdlp, ok: a[0], version: a[1], ageDays: ytdlpAgeDays(a[1]), stale: isStale(a[1]) },
      ffmpeg: { path: ffmpeg, ok: b[0], version: b[1] },
    }));
  }
}

// How old the installed yt-dlp is, in days — null when the string can't be read.
//
// This matters more than it looks: yt-dlp's whole job is tracking sites that keep
// changing, so a build a few months old doesn't fail loudly, it fails *per site*
// with messages like "Unexpected response from webpage request". Surfacing the age
// turns that into something the user can act on. `--version` prints `2025.08.11`
// for a release and `2025.08.11.232703` for a nightly, so only the date is parsed.
const YTDLP_STALE_DAYS = 45;

function ytdlpAgeDays(version) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(String(version || "").trim());
  if (!m) return null;
  const released = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.floor((Date.now() - released) / 86400000);
  // A clock skewed into the past would otherwise report a negative age.
  return days < 0 ? 0 : days;
}

// Unknown age is treated as fine: a custom build with a non-date version string
// shouldn't be nagged about, and a false "outdated" warning trains users to
// ignore the banner that matters.
function isStale(version) {
  const days = ytdlpAgeDays(version);
  return days != null && days > YTDLP_STALE_DAYS;
}

// Run `<bin> <versionArg>` and report whether it launched.
// Resolves [ok, firstLineOfOutput] — never rejects, never hangs.
function probe(bin, args) {
  return new Promise((resolve) => {
    let child;
    let out = "";
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (_) {
      return resolve([false, ""]);
    }
    const done = (ok) => resolve([ok, out.split(/\r|\n/)[0].trim().slice(0, 60)]);
    const timer = setTimeout(() => {
      child.kill();
      done(false);
    }, 5000);
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (out += b.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      done(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0);
    });
  });
}

// ---------- helpers ----------

// Direct-download filename: strip path separators and characters Windows
// rejects in one pass.
function sanitizeFilename(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "download.mp4";
}

function formatBytes(n) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function fmtEta(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// The raw yt-dlp output behind a translated message. friendlyError() is written
// to be readable, which necessarily throws away the detail needed to work out
// *why* a site broke — so the original is kept alongside it and surfaced behind
// a "show details" toggle. Truncated from the end, because yt-dlp prints the
// useful part last.
function errorDetails(stderr) {
  const lines = String(stderr || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length);
  return lines.slice(-30).join("\n").slice(-4000);
}

// One "show yt-dlp output" panel covering every route that was tried. With three
// near-identical TikTok failures in a row, the labels are the only thing that
// says which host produced which — so a single attempt stays unlabelled and
// several get a header each.
function detailsFromLog(log) {
  const kept = log.filter((entry) => entry && String(entry.err || "").trim());
  if (!kept.length) return "";
  if (kept.length === 1) return errorDetails(kept[0].err);
  return kept.map((entry) => `[${entry.label}]\n${errorDetails(entry.err)}`).join("\n\n");
}

function friendlyError(stderr, code, site = "generic") {
  const text = String(stderr || "");
  const label = siteLabel(site) || "This site";

  // A broken cookie source fails every site, so check it before anything else —
  // and don't mistake it for "you need to log in".
  if (/could not copy|could not find .{0,40}cookie|failed to decrypt|unsupported .{0,20}keyring|DPAPI|browser is currently open/i.test(text)) {
    return 'Could not read cookies from the browser you picked. Close that browser and retry, or choose Firefox in Settings → Sites → "Cookies from browser".';
  }

  // Login/cookies next: on Facebook and Instagram this is the usual cause, and
  // yt-dlp's own wording ("Cannot parse data", "no video formats") hides it.
  // Matched on `--cookies` rather than the bare word, so an unrelated mention of
  // cookies in a stack trace isn't reported as "you need to sign in".
  if (/login required|requires? (a )?login|log in|sign in|not logged in|authentication|--cookies|not a bot|rate-limit reached/i.test(text)) {
    return isLoginSite(site)
      ? `${label} wants a logged-in session. Settings → Sites → "Cookies from browser" — pick the browser you're signed in to, then retry.`
      : "This video is private or requires sign-in.";
  }
  // Extractor breakage. yt-dlp is a moving target against sites that keep
  // changing their pages, so this class of failure means "this yt-dlp build can
  // no longer read this site" — nothing about the link is wrong. Its own wording
  // ("please report this issue on github…") sends the user off to file a bug that
  // usually already exists, so it is replaced with the two things that actually
  // help. Placed after the login check, whose patterns are all explicit login
  // words. Deliberately *not* matching "Unable to download JSON metadata" or
  // "Unable to download webpage": those carry an HTTP status or urlopen error
  // just as often as a parse failure, and the connection branch below reads them
  // correctly.
  if (EXTRACTOR_BREAKAGE.test(text)) {
    if (site === "tiktok") {
      // By the time this message is shown, the mobile-API route has already been
      // tried automatically, so don't send the user off to configure it.
      return "TikTok changed its site and this yt-dlp build can't read it — the link is fine. Both extraction routes failed, so: Settings → Advanced → Update (set the release channel to Nightly first — extractor fixes land there days before stable). If it still fails, Settings → Sites → \"Cookies from browser\", pointed at a browser you're logged into TikTok with.";
    }
    return `${label} changed something this yt-dlp build can't parse. Settings → Advanced → Update installs the newest build (try the Nightly channel if stable doesn't fix it).${isLoginSite(site) ? ' Cookies from browser (Settings → Sites) often gets past it too.' : ""}`;
  }
  // Split from the "no formats at all" case below: this one means formats exist
  // but none matched what we asked for — on TikTok that is almost always the
  // no-watermark filter, since the selector deliberately has no fallback.
  if (/Requested format is not available/i.test(text)) {
    if (site === "tiktok") {
      return 'TikTok only offered a watermarked copy at this quality. Try "Best available" first; if that still fails, turn off Settings → Sites → "TikTok: skip watermark" to accept the stamped video.';
    }
    return 'That quality isn\'t available for this video — try "Best available".';
  }
  if (/No video formats found|no formats found|There.s no video/i.test(text)) {
    if (site === "tiktok") return "Nothing to download — TikTok photo/slideshow posts have no video stream.";
    return `${label} didn't expose a downloadable video stream for this post.`;
  }
  if (/HTTP Error 429|Too Many Requests/i.test(text)) {
    return `${label} is rate-limiting this machine. Wait a few minutes, then retry.`;
  }
  if (/geo.?restrict|not available in your (country|region)|blocked it in your country/i.test(text)) {
    return "This video is blocked in your region.";
  }
  if (/is not a valid URL|Unsupported URL/i.test(text)) return "This page doesn't expose a downloadable video.";
  if (/Private video|members-only/i.test(text)) return "This video is private or requires sign-in.";
  if (/DRM|protected/i.test(text)) return "This content is protected and cannot be downloaded.";
  if (/ffmpeg is not installed|ffmpeg not found/i.test(text)) return "FFmpeg not found — needed to merge video and audio.";
  if (/No space left|ENOSPC/i.test(text)) return "Not enough disk space.";
  if (/Permission denied|EACCES/i.test(text)) return "Cannot write to the download folder.";
  if (/File name too long|path too long/i.test(text)) return "The file name was too long for this folder — try a shorter download path.";
  if (/Unable to download|urlopen error|timed out|Connection/i.test(text)) return "The connection was interrupted.";
  const line = text.split(/\r|\n/).find((l) => /ERROR/i.test(l));
  // Last resort: yt-dlp's own line, minus the "report this on github / confirm
  // you're on the latest version" tail it appends to a lot of errors. That tail is
  // longer than the message it decorates and pushed the real cause out of the
  // 200-char cut in the extension popup.
  if (line) {
    return line
      .replace(/^.*ERROR:\s*/i, "")
      .replace(/;?\s*please report this issue on[\s\S]*$/i, "")
      .replace(/\s*Confirm you are on the latest version[\s\S]*$/i, "")
      .trim()
      .slice(0, 200);
  }
  return `Download failed (exit code ${code}).`;
}

const LANG_NAMES = {
  en: "English", bn: "Bengali", hi: "Hindi", es: "Spanish", fr: "French", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", pt: "Portuguese", ru: "Russian",
  it: "Italian", tr: "Turkish", id: "Indonesian", ur: "Urdu", ta: "Tamil", te: "Telugu",
};
const langLabel = (code) => {
  const base = String(code).split("-")[0].toLowerCase();
  return LANG_NAMES[base] ? `${LANG_NAMES[base]} (${code})` : code;
};

function normalize(info, url, site = "generic", dropWatermarked = false) {
  const all = Array.isArray(info.formats) ? info.formats : [];
  // Mirrors the download's format filter, so the offered heights and the
  // deliverable heights are the same set.
  const formats = dropWatermarked ? all.filter((f) => !isWatermarked(f)) : all;

  const heights = [...new Set(
    formats.filter((f) => f.vcodec && f.vcodec !== "none" && f.height).map((f) => f.height)
  )].sort((a, b) => b - a);
  const qualities = [{ value: "best", label: "Best available" }]
    .concat(heights.map((h) => ({ value: `${h}p`, label: `${h}p${h >= 2160 ? " (4K)" : h >= 1440 ? " (2K)" : ""}` })));

  const langs = [...new Set(
    formats.filter((f) => f.acodec && f.acodec !== "none" && f.language).map((f) => f.language)
  )];
  const audioTracks = [{ value: "original", label: "Original" }]
    .concat(langs.map((l) => ({ value: l, label: langLabel(l) })));

  const manual = info.subtitles || {};
  const auto = info.automatic_captions || {};
  const subtitles = [];
  Object.keys(manual).forEach((l) => subtitles.push({ value: l, label: langLabel(l) }));
  Object.keys(auto).forEach((l) => {
    if (!manual[l]) subtitles.push({ value: l, label: `${langLabel(l)} — auto` });
  });

  return {
    url,
    site,
    siteLabel: siteLabel(site),
    // TikTok/Facebook "titles" are whole captions — collapse newlines and cap
    // them so one post can't take over the queue row.
    title: String(info.title || info.description || "Untitled").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled",

    uploader: info.uploader || info.channel || info.uploader_id || "",
    thumbnail: info.thumbnail || "",
    duration: info.duration || 0,
    isLive: !!info.is_live,
    qualities,
    audioTracks,
    subtitles: subtitles.slice(0, 80),
  };
}

module.exports = { Engine, STATUS, TERMINAL, resolveBinary, bundledDir, buildArgs };
