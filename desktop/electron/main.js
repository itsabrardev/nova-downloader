/* NovaDownloader Electron shell.
 *
 * Responsibilities:
 *  - spawn the headless Python backend (`python -m backend.server`) unless
 *    one is already listening on the configured port
 *  - show the frameless main window loading the backend-served React UI
 *  - tray icon, window controls, folder picker, clipboard monitor (IPC)
 *  - tear the backend down on quit
 */
"use strict";

const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, clipboard, nativeImage } = require("electron");
const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.NOVA_PORT || 8765);
const BASE = `http://127.0.0.1:${PORT}`;
const UI_URL = process.env.NOVA_UI_URL || BASE;
const ICON = path.join(REPO_ROOT, "assets", "icons", "icon.ico");

let win = null;
let tray = null;
let backend = null;
let backendDead = false;
let minimizeToTray = false;
let clipboardMonitor = false;
let clipboardTimer = null;
let lastClipboard = "";
let quitting = false;

function findPython() {
  const candidates = [];
  if (process.env.NOVA_PYTHON) candidates.push(process.env.NOVA_PYTHON);
  candidates.push(path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"));
  candidates.push(path.join(REPO_ROOT, ".venv", "bin", "python"));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "python";
}

async function probe() {
  try {
    const res = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBackend() {
  if (await probe()) return true; // already running (dev server / second launch)
  const python = findPython();
  console.log(`[electron] spawning backend: ${python} -m backend.server`);
  backend = spawn(python, ["-m", "backend.server"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    windowsHide: true,
  });
  backendDead = false;
  backend.stdout.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
  backend.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
  backend.on("error", (err) => {
    backendDead = true;
    console.error("[electron] failed to start backend:", err.message);
  });
  backend.on("exit", (code) => {
    if (!quitting && win && !win.isDestroyed()) {
      dialog.showErrorBox(
        "NovaDownloader backend stopped",
        `The Python backend exited unexpectedly (code ${code}).\n\n` +
          `Make sure the virtualenv exists (.venv) and dependencies are installed:\n` +
          `  .venv\\Scripts\\python -m pip install -r requirements-dev.txt`
      );
    }
  });

  const deadline = Date.now() + 45000; // first import of yt-dlp can be slow
  while (Date.now() < deadline) {
    if (await probe()) return true;
    if (backendDead || backend === null || backend.exitCode !== null) return false;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return probe();
}

function killBackend() {
  if (backend && backend.pid) {
    if (process.platform === "win32") {
      // kill the tree: the backend spawns ffmpeg children
      execFile("taskkill", ["/pid", String(backend.pid), "/T", "/F"], () => {});
    } else {
      backend.kill("SIGTERM");
    }
    backend = null;
  }
}

async function fetchToken() {
  try {
    const res = await fetch(`${BASE}/api/pairing`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.token || "";
  } catch {
    return "";
  }
}

async function trayAction(action) {
  try {
    await fetch(`${BASE}/api/downloads/${action}`, {
      method: "POST",
      headers: { "X-Nova-Token": await fetchToken() },
    });
  } catch {
    /* backend gone — tray actions are best-effort */
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: "#070b14",
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (minimizeToTray && !quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.loadURL(UI_URL);
}

function showMainWindow() {
  if (!win) return;
  win.show();
  win.showNormal();
  win.focus();
}

function createTray() {
  if (!fs.existsSync(ICON)) return;
  const image = nativeImage.createFromPath(ICON);
  if (image.isEmpty()) return;
  tray = new Tray(image);
  tray.setToolTip("NovaDownloader");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open NovaDownloader", click: showMainWindow },
      { type: "separator" },
      { label: "Pause all", click: () => trayAction("pause_all") },
      { label: "Resume all", click: () => trayAction("resume_all") },
      { type: "separator" },
      { label: "Exit", click: () => app.quit() },
    ])
  );
  tray.on("double-click", showMainWindow);
}

function startClipboardMonitor() {
  if (clipboardTimer) return;
  clipboardTimer = setInterval(() => {
    if (!clipboardMonitor || !win || win.isDestroyed()) return;
    const text = (clipboard.readText() || "").trim();
    if (
      text &&
      text !== lastClipboard &&
      /^https?:\/\/\S+$/i.test(text) &&
      !/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/i.test(text)
    ) {
      lastClipboard = text;
      win.webContents.send("clipboard-url", text);
    }
  }, 2000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(async () => {
    app.setAppUserModelId("novadownloader");
    const ok = await ensureBackend();
    if (!ok) {
      dialog.showErrorBox(
        "NovaDownloader backend unavailable",
        `Could not reach the backend at ${BASE}.\n` +
          `Start it manually to see the error:\n\n` +
          `  cd "${REPO_ROOT}"\n  .venv\\Scripts\\python -m backend.server`
      );
      app.quit();
      return;
    }
    createWindow();
    createTray();
    startClipboardMonitor();
  });

  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    if (clipboardTimer) clearInterval(clipboardTimer);
    killBackend();
  });
  app.on("window-all-closed", () => app.quit());
}

// -- IPC from the renderer -----------------------------------------------------
ipcMain.on("window-minimize", () => win && win.minimize());
ipcMain.on("window-maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("window-close", () => win && win.close());
ipcMain.on("set-minimize-to-tray", (_event, value) => {
  minimizeToTray = !!value;
});
ipcMain.on("set-clipboard-monitor", (_event, value) => {
  clipboardMonitor = !!value;
});
ipcMain.handle("pick-folder", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0] || null;
});
ipcMain.handle("open-path", (_event, target) => shell.openPath(String(target || "")));
ipcMain.handle("reveal-path", (_event, target) => {
  shell.showItemInFolder(String(target || ""));
  return true;
});
