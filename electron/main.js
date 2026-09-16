// Nova Downloader — Electron main process.
// Owns: window, persisted settings, the download engine/queue, and the
// local API the browser extension talks to.
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, session, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { Store } = require("./store");
const { Engine, bundledDir } = require("./engine");
const { Backgrounds, VIDEO_EXT } = require("./backgrounds");
const { createApiServer } = require("./localApi");
const { updateYtdlp } = require("./updater");
const { initUpdater } = require("./app-updater");
const { OmniSave, BROWSER_UA, SITE_ORIGIN } = require("./omnisave");
const musicApi   = require("./music-api");
const musicStore = require("./music-store");
const spotify    = require("./spotify");
const localMusic = require("./local-music");
const crx = require("./crx");

// Register local-audio scheme (music) and local-file scheme (video player)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-audio",
    privileges: {
      standard: true, secure: true, supportFetchAPI: true,
      stream: true, bypassCSP: true, corsEnabled: true,
    },
  },
  {
    scheme: "local-file",
    privileges: {
      standard: true, secure: true, supportFetchAPI: true,
      stream: true, bypassCSP: true, corsEnabled: true,
    },
  },
]);

let mainWindow  = null;
let playerWindow = null;   // dedicated Nova Player window
let apiServer   = null;
let store       = null;
let engine      = null;
let backgrounds = null;
let omnisave    = null;

// Register nova-downloader:// custom URI scheme for Spotify OAuth callback
if (process.defaultApp) {
  app.setAsDefaultProtocolClient("nova-downloader", process.execPath, [path.resolve(process.argv[1] || ".")]);
} else {
  app.setAsDefaultProtocolClient("nova-downloader");
}

// macOS: protocol URL arrives via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url.startsWith("nova-downloader://")) spotify.handleCallback(url);
});

// Only one instance may own port 8765 / the queue.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, commandLine) => {
    // On Windows, Spotify redirects via a new process launch with the URL as argv
    const rawArg = commandLine.find(arg => typeof arg === "string" && arg.includes("nova-downloader://"));
    if (rawArg) {
      const match = rawArg.match(/nova-downloader:\/\/[^\s"']+/);
      if (match) spotify.handleCallback(match[0]);
    }
    focusWindow();
  });
}

function downloadDir() {
  const configured = store.get("downloadFolder");
  if (configured) {
    // Auto-create the folder on first use (e.g. D:\Nova Downloader\downloads)
    try { fs.mkdirSync(configured, { recursive: true }); } catch (_) {}
    if (fs.existsSync(configured)) return configured;
  }
  return app.getPath("downloads");
}

function focusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// The clip that should be on screen, or null when the animated background is off.
function currentBackground() {
  if (!store.get("animatedBackground")) return null;
  return backgrounds.current(store.get("backgroundVideo"));
}

// Which library entry is effectively selected, ignoring the on/off toggle —
// used to tick the right row in Settings.
function currentBackgroundId() {
  const entry = backgrounds.current(store.get("backgroundVideo"));
  return entry ? entry.id : "";
}

function startApi() {
  return createApiServer({
    port: store.get("apiPort"),
    engine,
    onFocus: focusWindow,
    onIncoming: (task) => toRenderer("task:incoming", task),
    getBackground: currentBackground,
    getApiToken: () => store.get("apiToken"),
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: "#0b0710",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));

  if (process.argv.includes("--dev")) mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.webContents.on("console-message", (_e, _l, message) => {
    if (message.includes("[Nova]")) console.log("[renderer]", message);
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  backgrounds = new Backgrounds(app.getPath("userData"));
  engine = new Engine(() => store.all(), downloadDir);
  omnisave = new OmniSave(app.getPath("userData"));

  // High performance local audio streaming protocol handler
  protocol.handle("local-audio", (request) => {
    try {
      const raw = request.url.replace(/^local-audio:\/\//, "");
      let decoded = decodeURIComponent(raw);
      if (process.platform === "win32" && decoded.startsWith("/") && /^[a-zA-Z]:/.test(decoded.slice(1))) {
        decoded = decoded.slice(1);
      }
      return net.fetch(pathToFileURL(decoded).href);
    } catch (err) {
      console.error("[local-audio] stream error:", err);
      return new Response("Not found", { status: 404 });
    }
  });

  // local-file:// — serves local video files to the Nova Player <video> element
  protocol.handle("local-file", (request) => {
    try {
      const raw = request.url.replace(/^local-file:\/\//, "");
      let decoded = decodeURIComponent(raw);
      if (process.platform === "win32" && decoded.startsWith("/") && /^[a-zA-Z]:/.test(decoded.slice(1))) {
        decoded = decoded.slice(1);
      }
      return net.fetch(pathToFileURL(decoded).href);
    } catch (err) {
      console.error("[local-file] stream error:", err);
      return new Response("Not found", { status: 404 });
    }
  });

  // Dedicated Nova Player window — opened from mini player "⧉ Open in window"
  ipcMain.handle("player:open", (_e, { filePath, title }) => {
    if (playerWindow && !playerWindow.isDestroyed()) {
      playerWindow.webContents.send("player:load", { filePath, title });
      playerWindow.focus();
      return;
    }
    playerWindow = new BrowserWindow({
      width: 1280,
      height: 760,
      minWidth: 640,
      minHeight: 400,
      title: title || "Nova Player",
      backgroundColor: "#000",
      webPreferences: {
        preload: path.join(__dirname, "preload-player.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    playerWindow.loadFile(path.join(__dirname, "..", "renderer", "player.html"));
    playerWindow.webContents.once("did-finish-load", () => {
      playerWindow.webContents.send("player:load", { filePath, title });
    });
    playerWindow.on("closed", () => { playerWindow = null; });
  });

  // Check if launched with a file path argument ("Open with Nova Player")
  const fileArg = process.argv.find(a => /\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i.test(a) && fs.existsSync(a));
  if (fileArg) {
    app.once("browser-window-focus", () => {
      if (mainWindow) mainWindow.webContents.send("player:open-file", fileArg);
    });
  }


  // Engine → UI
  engine.on("task", (task) => {
    toRenderer("task:update", task);
    if (task.status === "completed" && store.get("notifications") && Notification.isSupported()) {
      new Notification({ title: "Download complete", body: task.title || task.url }).show();
    }
  });
  engine.on("removed", (d) => toRenderer("task:removed", d));
  engine.on("cleared", () => toRenderer("task:cleared", {}));

  // Ensure video streaming Range requests to movie CDNs have valid headers (prevents 429 errors)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const u = details.url || "";
    if (
      u.includes("hakunaymatata.com") ||
      u.includes("aoneroom.com") ||
      u.includes("videodownloader.site") ||
      u.includes("staticjs.org") ||
      u.includes("/resource/")
    ) {
      details.requestHeaders["User-Agent"] = BROWSER_UA;
      details.requestHeaders["Origin"] = SITE_ORIGIN;
      details.requestHeaders["Referer"] = SITE_ORIGIN + "/";
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  // Enable CORS for media & subtitles
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders["access-control-allow-origin"] = ["*"];
    responseHeaders["access-control-allow-methods"] = ["GET, POST, OPTIONS, HEAD"];
    responseHeaders["access-control-allow-headers"] = ["*"];
    callback({ responseHeaders });
  });

  createWindow();

  apiServer = startApi();

  // Initialize GitHub Releases auto-updater (silent background check every 4h)
  initUpdater(toRenderer);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  if (apiServer) apiServer.close();
  if (engine) engine.pauseAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------- IPC: window ----------------
ipcMain.on("win:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("win:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("win:close", () => mainWindow && mainWindow.close());

// ---------------- IPC: background video ----------------
// Returns a proper file:/// URL — string concat yields file://D:/… on Windows,
// where the drive letter is parsed as a hostname and the video silently fails.
ipcMain.handle("bg:getVideo", () => {
  const entry = currentBackground();
  return entry ? pathToFileURL(entry.path).href : null;
});

// The library the Settings page shows: bundled clips plus uploaded ones.
ipcMain.handle("bg:list", () => {
  const selected = currentBackgroundId();
  return backgrounds.list().map(({ id, name, source }) => ({ id, name, source, selected: id === selected }));
});

ipcMain.handle("bg:add", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Video", extensions: VIDEO_EXT.map((e) => e.slice(1)) }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    const id = backgrounds.add(res.filePaths[0]);
    store.update({ backgroundVideo: id, animatedBackground: true }); // use it right away
    return id;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("bg:select", (_e, id) => {
  const entry = backgrounds.resolve(id);
  if (!entry) return false;
  store.update({ backgroundVideo: entry.id, animatedBackground: true });
  return true;
});

ipcMain.handle("bg:remove", (_e, id) => {
  const wasSelected = currentBackgroundId() === id;
  const ok = backgrounds.remove(id);
  // Dropping the clip that was playing falls back to whatever is left.
  if (ok && (wasSelected || store.get("backgroundVideo") === id)) store.update({ backgroundVideo: "" });
  return ok;
});

// ---------------- IPC: settings ----------------
ipcMain.handle("settings:get", () => ({ ...store.all(), resolvedDownloadFolder: downloadDir() }));
ipcMain.handle("settings:update", (_e, patch) => {
  const before = store.get("apiPort");
  const data = store.update(patch);
  if (data.apiPort !== before && apiServer) {
    apiServer.close();
    apiServer = startApi();
  }
  engine.pump(); // concurrency may have increased
  return { ...data, resolvedDownloadFolder: downloadDir() };
});
ipcMain.handle("settings:reset", () => ({ ...store.reset(), resolvedDownloadFolder: downloadDir() }));

ipcMain.handle("settings:chooseFolder", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: downloadDir(),
  });
  if (res.canceled || !res.filePaths.length) return null;
  store.update({ downloadFolder: res.filePaths[0] });
  return res.filePaths[0];
});

ipcMain.handle("settings:chooseFile", async (_e, kind) => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"] });
  if (res.canceled || !res.filePaths.length) return null;
  const key = kind === "ffmpeg" ? "ffmpegPath" : "ytdlpPath";
  store.update({ [key]: res.filePaths[0] });
  return res.filePaths[0];
});

// ---------------- IPC: analyze & queue ----------------
ipcMain.handle("deps:check", () => engine.deps());

// Install the newest yt-dlp into ./bin, which resolveBinary() prefers over PATH.
// That also sidesteps the package-manager problem for good: winget's copy can be
// weeks behind the release that actually fixes a site.
//
// One update at a time, and never while yt-dlp is running — on Windows the file
// cannot be replaced while a download holds it open.
let updating = false;
ipcMain.handle("deps:updateYtdlp", async () => {
  if (updating) return { ok: false, message: "An update is already running." };
  const busy = engine.list().some((t) => t.status === "downloading" || t.status === "processing");
  if (busy) return { ok: false, message: "Pause or finish the active downloads first, then update." };

  updating = true;
  try {
    const res = await updateYtdlp(
      // Not `../bin`: installed, that path is inside app.asar, and resources/bin
      // needs admin rights. bundledDir() picks the first folder this process can
      // actually write to, and resolveBinary() looks there first.
      bundledDir("bin"),
      (p) => toRenderer("deps:updateProgress", p),
      store.get("ytdlpChannel")
    );
    // A previously chosen custom path would keep overriding the fresh binary.
    if (store.get("ytdlpPath")) store.update({ ytdlpPath: "" });
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, message: err.message || "Update failed." };
  } finally {
    updating = false;
  }
});

ipcMain.handle("media:analyze", async (_e, url) => {
  try {
    return { ok: true, data: await engine.analyze(url) };
  } catch (e) {
    // `details` is yt-dlp's own output. It stays out of the message shown by
    // default, but the renderer can reveal it — without it there is no way to
    // tell an upstream extractor break from a problem in this app.
    return { ok: false, message: e.message, code: e.code, details: e.details };
  }
});

ipcMain.handle("queue:enqueue", (_e, req) => engine.enqueue({ ...req, source: "app" }));
ipcMain.handle("queue:list", () => engine.list());

// Whitelisted — never dispatch an arbitrary method name off the engine.
const TASK_ACTIONS = ["pause", "resume", "cancel", "retry", "remove"];
ipcMain.handle("queue:action", (_e, { action, id }) => {
  if (!TASK_ACTIONS.includes(action)) return false;
  return engine[action](Number(id));
});
ipcMain.on("queue:pauseAll", () => engine.pauseAll());
ipcMain.on("queue:resumeAll", () => engine.resumeAll());
ipcMain.on("queue:clearFinished", () => engine.clearFinished());

// ---------------- IPC: files ----------------
ipcMain.on("file:openFolder", (_e, target) => {
  if (!target) return;
  if (fs.existsSync(target)) {
    fs.statSync(target).isDirectory() ? shell.openPath(target) : shell.showItemInFolder(target);
  }
});
ipcMain.on("file:open", (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.openPath(filePath);
});

// ---------------- IPC: movies (OmniSave) ----------------
// Search/detail go straight to the API client. The download handler is where
// the freshness rule lives: OmniSave's file links expire within minutes, so
// they are minted *here*, right before the task starts — never in the renderer.
function pickDownload(links, wanted) {
  if (!links.length) return null;
  const exact = links.find((d) => d.resolution === wanted);
  if (exact) return exact;
  const below = links.filter((d) => d.resolution < wanted).sort((a, b) => b.resolution - a.resolution);
  return below[0] || links[0]; // highest available when nothing smaller exists
}

ipcMain.handle("movies:search", async (_e, { keyword, page, subjectType }) => {
  try {
    return { ok: true, data: await omnisave.search(String(keyword || ""), { page: page || 1, perPage: 24, subjectType }) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle("movies:detail", async (_e, detailPath) => {
  try {
    return { ok: true, data: await omnisave.detail(String(detailPath || "")) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// Quality/subtitle choices for the detail dialog come from a link preview.
// These URLs are for *display only* — enqueuing always re-mints them.
ipcMain.handle("movies:links", async (_e, args) => {
  try {
    return { ok: true, data: await omnisave.downloadLinks(args || {}) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle("movies:subtitleVtt", async (_e, url) => {
  try {
    if (!url) throw new Error("No subtitle URL provided");
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: SITE_ORIGIN + "/",
        Origin: SITE_ORIGIN,
      },
    });
    if (!res.ok) throw new Error(`Could not fetch subtitle: HTTP ${res.status}`);
    const text = await res.text();
    // Convert SRT format to WebVTT format for browser <track> support
    const vtt = "WEBVTT\n\n" + text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    return { ok: true, vtt };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

// req: { title, thumbnail?, subjectId, detailPath, se?, ep?,
//        resolution?, subtitleLan? } — one call = one video (+ one subtitle).
ipcMain.handle("movies:download", async (_e, req) => {
  try {
    const links = await omnisave.downloadLinks({
      subjectId: req.subjectId,
      detailPath: req.detailPath,
      se: req.se || 0,
      ep: req.ep || 0,
    });
    const picked = pickDownload(links.downloads, Number(req.resolution) || Infinity);
    if (!picked) throw new Error("No free download was offered for this title.");

    const title = String(req.title || "download").trim();
    // Season/episode marks keep batch downloads from colliding on one name.
    const mark = req.ep ? ` S${String(req.se || 1).padStart(2, "0")}E${String(req.ep).padStart(2, "0")}` : "";
    const headers = {
      "User-Agent": BROWSER_UA,
      Referer: SITE_ORIGIN + "/",
      Origin: SITE_ORIGIN,
    };

    const tasks = [];
    tasks.push(engine.enqueue({
      source: "app",
      direct: true,
      url: picked.url,
      filename: `${title}${mark} (${picked.resolution}p).mp4`,
      title: `${title}${mark} (${picked.resolution}p)`,
      thumbnail: req.thumbnail || "",
      downloadHeaders: headers,
      format: "mp4",
      quality: `${picked.resolution}p`,
      // If yt-dlp hits a 403 (the signed URL expired), re-mint a fresh one
      // instead of failing — OmniSave sign+t params last only a few minutes.
      refreshUrl: async () => {
        const fresh = await omnisave.downloadLinks({
          subjectId: req.subjectId,
          detailPath: req.detailPath,
          se: req.se || 0,
          ep: req.ep || 0,
        });
        const freshPicked = pickDownload(fresh.downloads, Number(req.resolution) || Infinity);
        return freshPicked ? freshPicked.url : null;
      },
    }));

    if (req.subtitleLan) {
      const lan = String(req.subtitleLan);
      const cap = links.captions.find((c) => c.lan === lan)
        || links.captions.find((c) => c.lan.split("-")[0] === lan.split("-")[0]);
      if (cap && cap.url) {
        tasks.push(engine.enqueue({
          source: "app",
          direct: true,
          url: cap.url,
          filename: `${title}${mark}.${cap.lan}.srt`,
          title: `${title}${mark} subtitle (${cap.lanName})`,
          thumbnail: req.thumbnail || "",
          downloadHeaders: headers,
          format: "srt",
        }));
      }
    }
    return { ok: true, ids: tasks.map((t) => t.id) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// ---------------- IPC: browser extension ----------------
// The installer registers the packed extension with Chrome and Edge, but Chrome
// never enables an off-store extension on its own, so the app has to be able to
// hand the user the folder and the page. Everything here is derived from the
// app's own install layout — the renderer sends no paths.
ipcMain.handle("ext:info", () => {
  const meta = crx.info();
  const port = store.get("apiPort");
  return {
    id: meta ? meta.id : null,
    version: meta ? meta.version : null,
    crxPath: crx.crxPath(),
    folder: crx.unpackedDir(),
    port,
    // The policy entry written at install time points at 8765. Changing the port
    // afterwards leaves Chrome polling a dead URL, which is worth saying out loud.
    portMismatch: port !== 8765,
  };
});

// chrome://extensions can't be opened with shell.openExternal — it isn't a
// registered protocol — so the browser is launched with the URL as an argument.
const BROWSERS = [
  ["chrome.exe", "chrome://extensions", ["Google\\Chrome\\Application\\chrome.exe"]],
  ["msedge.exe", "edge://extensions", ["Microsoft\\Edge\\Application\\msedge.exe"]],
];

function findBrowser() {
  if (process.platform !== "win32") return null;
  const roots = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    process.env["LOCALAPPDATA"],
  ].filter(Boolean);
  for (const [, url, relatives] of BROWSERS) {
    for (const root of roots) {
      for (const rel of relatives) {
        const exe = path.join(root, rel);
        if (fs.existsSync(exe)) return { exe, url };
      }
    }
  }
  return null;
}

ipcMain.handle("ext:openBrowserPage", () => {
  const found = findBrowser();
  if (!found) return { ok: false, message: "Couldn't find Chrome or Edge — open the extensions page yourself." };
  try {
    // Argument array, never a shell string; the URL is a constant from BROWSERS.
    spawn(found.exe, [found.url], { detached: true, stdio: "ignore" }).unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Couldn't start the browser." };
  }
});

// ============================================================
// IPC: Nova Music
// ============================================================
ipcMain.handle("music:trending",  async () => musicApi.getTrending());
ipcMain.handle("music:search",    async (_e, query) => musicApi.search(query));
ipcMain.handle("music:album",     async (_e, id)    => musicApi.getAlbum(id));
ipcMain.handle("music:playlist",  async (_e, id)    => musicApi.getPlaylist(id));
ipcMain.handle("music:lyrics",    async (_e, opts)  => musicApi.getLyrics(opts));

// Library — liked songs
ipcMain.handle("music:liked:get",    ()           => musicStore.getLiked());
ipcMain.handle("music:liked:toggle", (_e, song)   => musicStore.toggleLike(song));
ipcMain.handle("music:liked:is",     (_e, songId) => musicStore.isLiked(songId));

// Library — playlists
ipcMain.handle("music:pl:list",   ()                       => musicStore.getPlaylists());
ipcMain.handle("music:pl:get",    (_e, id)                 => musicStore.getPlaylist(id));
ipcMain.handle("music:pl:create", (_e, name)               => musicStore.createPlaylist(name));
ipcMain.handle("music:pl:rename", (_e, id, name)           => musicStore.renamePlaylist(id, name));
ipcMain.handle("music:pl:delete", (_e, id)                 => musicStore.deletePlaylist(id));
ipcMain.handle("music:pl:add",    (_e, playlistId, song)   => musicStore.addToPlaylist(playlistId, song));
ipcMain.handle("music:pl:remove", (_e, playlistId, songId) => musicStore.removeFromPlaylist(playlistId, songId));

// Library — recently played
ipcMain.handle("music:recent:get", ()       => musicStore.getRecent());
ipcMain.handle("music:recent:add", (_e, s)  => { musicStore.addRecent(s); });

// ============================================================
// IPC: Music & Spotify Resolution
// ============================================================

// Resolve 100% working stream URL for ANY song (Spotify / YouTube / JioSaavn)
ipcMain.handle("music:resolve", async (_e, song, forceFresh = false) => {
  try {
    const url = await musicApi.resolveStream(song, forceFresh);
    return { ok: !!url, url };
  } catch (e) {
    return { ok: false, url: null, message: e.message };
  }
});

// Download any song as MP3 directly into download queue
ipcMain.handle("music:download", async (_e, song) => {
  try {
    if (!song) throw new Error("No song provided");

    const cleanTitle = String(song.name || "Song").replace(/[/\\?%*:|"<>]/g, "").trim();
    const cleanArtist = String(song.artist || "").replace(/[/\\?%*:|"<>]/g, "").trim();
    const filename = `${cleanTitle}${cleanArtist ? " - " + cleanArtist : ""}.mp3`;

    let targetUrl = song.youtubeUrl;
    let isDirect = false;

    if (!targetUrl && song.id && song.id.startsWith("yt_")) {
      targetUrl = `https://www.youtube.com/watch?v=${song.id.replace(/^yt_/, "")}`;
    }

    if (!targetUrl) {
      const streamUrl = await musicApi.resolveStream(song);
      if (!streamUrl) throw new Error("Could not get stream URL for this song");
      
      if (streamUrl.includes("googlevideo.com") || streamUrl.includes("youtube.com")) {
        targetUrl = `ytsearch1:${cleanTitle} ${cleanArtist}`;
        isDirect = false;
      } else {
        targetUrl = streamUrl;
        isDirect = true;
      }
    }

    const task = engine.enqueue({
      source: "app",
      url: targetUrl,
      direct: isDirect,
      filename,
      title: `${song.name} - ${song.artist || "Music"}`,
      thumbnail: song.image || "",
      format: "mp3",
      quality: "320k",
    });

    return { ok: true, taskId: task.id };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("spotify:status",   () => ({ connected: spotify.isConnected(), user: spotify.getUserInfo() }));
ipcMain.handle("spotify:login",    async (_e, clientId) => {
  try   { const t = await spotify.login(clientId); return { ok: true, user: { displayName: t.displayName, email: t.email } }; }
  catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle("spotify:logout",   () => { spotify.logout(); return { ok: true }; });

ipcMain.handle("spotify:liked",    async () => {
  try   { return { ok: true, songs: await spotify.getAllLikedSongs() }; }
  catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle("spotify:playlists", async () => {
  try   { return { ok: true, playlists: await spotify.getPlaylists() }; }
  catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle("spotify:playlist:tracks", async (_e, id) => {
  try {
    const all = [];
    let offset = 0;
    while (true) {
      const page = await spotify.getPlaylistTracks(id, 100, offset);
      all.push(...page.items);
      if (!page.next || all.length >= 500) break;
      offset += 100;
    }
    return { ok: true, songs: all };
  } catch (e) { return { ok: false, message: e.message }; }
});

// Resolve stream URL for a Spotify song (called per-song before play)
ipcMain.handle("spotify:resolve", async (_e, song) => {
  try {
    const url = await musicApi.resolveStream(song);
    return { ok: !!url, url };
  } catch (e) { return { ok: false, url: null }; }
});

// ---------- Offline / Local Music APIs ----------
ipcMain.handle("music:offline:list", async () => {
  try {
    const history = engine ? engine.getHistory() : [];
    const songs = await localMusic.getOfflineAudio(downloadDir(), history);
    return { ok: true, songs };
  } catch (err) {
    return { ok: false, songs: [], message: err.message };
  }
});

ipcMain.handle("music:offline:pickFolder", async () => {
  try {
    const folder = await localMusic.pickFolder(mainWindow);
    return { ok: !!folder, folder };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("music:offline:pickFiles", async () => {
  try {
    const songs = await localMusic.pickAudioFiles(mainWindow);
    return { ok: true, songs };
  } catch (err) {
    return { ok: false, songs: [], message: err.message };
  }
});

ipcMain.handle("music:offline:getFolders", () => {
  try {
    return { ok: true, folders: musicStore.getLocalFolders() };
  } catch (err) {
    return { ok: false, folders: [] };
  }
});

ipcMain.handle("music:offline:removeFolder", (_e, folderPath) => {
  try {
    const removed = musicStore.removeLocalFolder(folderPath);
    return { ok: removed };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("music:offline:delete", async (_e, filePath) => {
  try {
    return await localMusic.deleteAudioFile(filePath);
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("music:offline:show", (_e, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { ok: true };
    }
    return { ok: false, message: "File does not exist" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});



