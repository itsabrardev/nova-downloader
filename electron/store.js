// Nova Downloader — persisted settings store (userData/config.json)
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  downloadFolder: "",          // "" = use the OS Downloads folder
  maxConcurrent: 3,            // 1–6
  connections: 8,              // yt-dlp concurrent fragments, 1–16
  retries: 3,                  // 0–10
  speedLimitKbps: 0,           // 0 = unlimited
  defaultFormat: "mp4",        // mp4 | webm | mkv | mp3
  defaultQuality: "best",
  defaultAudioLanguage: "original",
  defaultSubtitleMode: "none", // none | external | embedded
  defaultSubtitleLang: "",
  apiPort: 8765,
  apiToken: "",                // 32-char hex pairing token for browser extension
  animatedBackground: true,
  backgroundVideo: "",         // "" = auto-pick; else a name from the background library
  backgroundOpacity: 0.55,     // dark overlay strength, 0–1
  ytdlpPath: "",               // "" = ./bin then PATH
  // Which release the Update button installs. Nightly by default on yt-dlp's own
  // advice — its docs call the latest stable release "often stale and prone to
  // external breakage (i.e. sites changing things on their end)" and name nightly
  // "the recommended channel for regular users of yt-dlp".
  ytdlpChannel: "nightly",
  ffmpegPath: "",              // "" = ./ffmpeg then PATH
  cookiesFromBrowser: "",      // "" = no cookies; else a browser yt-dlp can read
  tiktokNoWatermark: true,     // prefer TikTok's clean copy over the stamped one
  notifications: true,
  compressAfterDownload: false, // re-encode with H.265 after download to reduce size ~50%
  compressPreset: "medium",    // ffmpeg preset: ultrafast | fast | medium | slow
};

const CLAMPS = {
  maxConcurrent: [1, 6],
  connections: [1, 16],
  retries: [0, 10],
  speedLimitKbps: [0, 1000000],
  apiPort: [1024, 65535],
  backgroundOpacity: [0, 1],
};

const ENUMS = {
  defaultFormat: ["mp4", "webm", "mkv", "mp3"],
  defaultSubtitleMode: ["none", "external", "embedded"],
  // Passed straight to `yt-dlp --cookies-from-browser`, so it must be one of
  // the names yt-dlp accepts — never free text from the renderer. Kept in step
  // with the <option> list in renderer/index.html: a value with no matching
  // option leaves the select rendering blank.
  cookiesFromBrowser: ["", "firefox", "chrome", "edge", "brave", "chromium", "opera", "vivaldi"],
  // Selects which GitHub repo updater.js pulls from. Nightly is the default and
  // what yt-dlp itself recommends for regular users; stable is kept for anyone who
  // would rather have monthly releases.
  ytdlpChannel: ["stable", "nightly"],
  compressPreset: ["ultrafast", "fast", "medium", "slow"],
};

const crypto = require("crypto");

class Store {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.file = path.join(userDataDir, "config.json");
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
        this.data = sanitize({ ...DEFAULTS, ...raw });
      }
    } catch (err) {
      console.warn("[Nova] config.json unreadable, using defaults:", err.message);
      this.data = { ...DEFAULTS };
    }

    // Ensure pairing token exists
    if (!this.data.apiToken) {
      this.data.apiToken = crypto.randomBytes(16).toString("hex");
      this.save();
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("[Nova] could not save config:", err.message);
    }
  }

  all() {
    return { ...this.data };
  }

  get(key) {
    return this.data[key];
  }

  // Merge a partial patch, validate, persist. Returns the full settings object.
  update(patch) {
    this.data = sanitize({ ...this.data, ...(patch || {}) });
    this.save();
    return this.all();
  }

  reset() {
    this.data = { ...DEFAULTS };
    this.save();
    return this.all();
  }
}

// Never trust stored config blindly — clamp numbers, check enums, drop unknown keys.
function sanitize(input) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    let value = input[key];
    const fallback = DEFAULTS[key];

    if (typeof fallback === "number") {
      value = Number(value);
      if (!Number.isFinite(value)) value = fallback;
      const clamp = CLAMPS[key];
      if (clamp) value = Math.min(clamp[1], Math.max(clamp[0], value));
      if (Number.isInteger(fallback)) value = Math.round(value);
    } else if (typeof fallback === "boolean") {
      value = typeof value === "boolean" ? value : fallback;
    } else {
      value = typeof value === "string" ? value : fallback;
      if (ENUMS[key] && !ENUMS[key].includes(value)) value = fallback;
    }
    out[key] = value;
  }
  return out;
}

module.exports = { Store, DEFAULTS };
