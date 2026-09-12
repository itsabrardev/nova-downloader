// Nova Downloader — App Auto-Update (electron-updater + GitHub Releases)
//
// How it works:
//   1. App launches → after 5 seconds, silently checks GitHub Releases for a newer version.
//   2. If an update is available: a non-intrusive notification appears in the UI.
//   3. User clicks "Download Update" → installer downloads in the background with progress.
//   4. When download completes: "Restart & Install" button appears.
//   5. User clicks → app restarts and installs the new version automatically.
//
// Channels:
//   - "latest"  → stable  (latest.yml / latest-mac.yml / latest-linux.yml)
//   - "beta"    → pre-releases
//
// The publish config in package.json must point to:
//   { "provider": "github", "owner": "itsabrardev", "repo": "nova-downloader" }

const { autoUpdater } = require("electron-updater");
const { app, ipcMain } = require("electron");
const log = require("electron-log");

let _toRenderer = null;   // set by initUpdater()
let _checkInterval = null;

// Route electron-updater logs to electron-log file (~/Library/Logs or %APPDATA%/Logs)
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

// Don't auto-download — let the user decide
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ── Events ────────────────────────────────────────────────────────────────────

autoUpdater.on("checking-for-update", () => {
  send("update:checking");
});

autoUpdater.on("update-available", (info) => {
  send("update:available", {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: stripHtml(info.releaseNotes || ""),
  });
});

autoUpdater.on("update-not-available", (info) => {
  send("update:not-available", { version: info.version });
});

autoUpdater.on("download-progress", (progress) => {
  send("update:progress", {
    percent: Math.round(progress.percent),
    transferred: fmt(progress.transferred),
    total: fmt(progress.total),
    bytesPerSecond: fmt(progress.bytesPerSecond) + "/s",
  });
});

autoUpdater.on("update-downloaded", (info) => {
  send("update:downloaded", {
    version: info.version,
    releaseDate: info.releaseDate,
  });
});

autoUpdater.on("error", (err) => {
  // Ignore benign "no update file" errors in dev mode
  const msg = err ? err.message || String(err) : "Unknown error";
  if (!msg.includes("ENOENT") && !msg.includes("dev-app-update")) {
    send("update:error", { message: msg });
    log.error("[updater] error:", err);
  }
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle("update:check", async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("update:download", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("update:install", () => {
  // Quits and installs — fires on next event loop tick so IPC can reply
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
});

ipcMain.handle("update:getVersion", () => {
  return { version: app.getVersion() };
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call this once from main.js after the window is created.
 * @param {function} toRendererFn  function(channel, payload) that sends IPC to renderer
 */
function initUpdater(toRendererFn) {
  _toRenderer = toRendererFn;

  // First check after 8 seconds (let the app fully load)
  setTimeout(() => silentCheck(), 8000);

  // Then check every 4 hours
  _checkInterval = setInterval(() => silentCheck(), 4 * 60 * 60 * 1000);
}

async function silentCheck() {
  try {
    // In dev/unpacked mode electron-updater throws — that's fine, just ignore
    if (!app.isPackaged) return;
    await autoUpdater.checkForUpdates();
  } catch (_) {
    // Silently ignore in dev mode
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(channel, payload = {}) {
  if (_toRenderer) _toRenderer(channel, payload);
}

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripHtml(str) {
  return String(str || "").replace(/<[^>]*>/g, "").trim();
}

module.exports = { initUpdater };
