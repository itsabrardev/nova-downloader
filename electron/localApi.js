// Nova Downloader — local HTTP API for the browser extension.
// Binds to 127.0.0.1 only; CORS restricted to browser-extension origins.
// SECURITY: no auth token. Any local process can reach it. Localhost-only +
// enum-constrained inputs + server-side output paths keep the blast radius small.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Backgrounds } = require("./backgrounds");
const crx = require("./crx");

const APP = "NovaDownloader";
const VERSION = "0.1.0";

function createApiServer({ port, engine, onFocus, onIncoming, getBackground, getApiToken }) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || "";
    if (/^(chrome|moz|safari-web)-extension:\/\//.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Nova-Token");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url.split("?")[0];
    const taskAction = /^\/api\/download\/(\d+)\/(pause|resume|cancel|retry)$/.exec(url);

    // ---- status ----
    if (req.method === "GET" && url === "/api/status") {
      return json(res, 200, {
        ok: true,
        app: APP,
        version: VERSION,
        queue: engine.counts(),
        token_required: false,
        token: getApiToken ? getApiToken() : "",
      });
    }

    // ---- analyze ----
    if (req.method === "POST" && url === "/api/analyze") {
      return readBody(req, (body) => {
        engine
          .analyze(body.url)
          .then((media) => json(res, 200, toExtensionShape(media)))
          // `details` is yt-dlp's own output. It stays collapsed in the popup, but
          // without it a site breaking upstream is indistinguishable from a bug in
          // this app — and the popup is where most links are tried from.
          .catch((e) =>
            json(res, 400, {
              error: { code: e.code || "ENGINE_ERROR", message: e.message, details: e.details || null },
            }));
      });
    }

    // ---- enqueue a download (this is what the extension's Download button hits) ----
    if (req.method === "POST" && url === "/api/download") {
      return readBody(req, (body) => {
        // Rejected before enqueueing, so a bad URL from the browser can't steal
        // window focus or leave a failed row behind.
        if (!/^https?:\/\//i.test(String(body.url || "").trim())) {
          return json(res, 400, {
            error: { code: "INVALID_URL", message: "Invalid URL — must start with http:// or https://" },
          });
        }
        const task = engine.enqueue({
          url: body.url,
          quality: body.quality,
          format: body.format,
          audioLanguage: body.audio_language,
          subtitleMode: body.subtitle_mode,
          subtitleLang: body.subtitle_lang,
          title: body.title,
          source: "extension",
        });
        // Bring the desktop app forward so the user lands on the queue.
        if (onFocus) onFocus();
        if (onIncoming) onIncoming(task);
        if (task.status === "failed") {
          return json(res, 400, { error: { code: "INVALID_URL", message: task.error } });
        }
        return json(res, 202, { id: task.id, status: task.status });
      });
    }

    // ---- task list / actions ----
    if (req.method === "GET" && url === "/api/downloads") {
      return json(res, 200, { tasks: engine.list(), total: engine.list().length });
    }
    if (req.method === "POST" && taskAction) {
      const id = Number(taskAction[1]);
      const ok = engine[taskAction[2]](id);
      return json(res, ok ? 200 : 404, ok ? { ok: true } : { error: { code: "NOT_FOUND", message: "No such task." } });
    }
    if (req.method === "POST" && url === "/api/downloads/pause_all") {
      engine.pauseAll();
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url === "/api/downloads/resume_all") {
      engine.resumeAll();
      return json(res, 200, { ok: true });
    }

    // ---- the background clip, so the extension popup can match the app ----
    // The path comes from the app's own settings, never from the request, so
    // there is no traversal surface here.
    if (req.method === "GET" && url === "/api/background") {
      const entry = getBackground ? getBackground() : null;
      if (!entry) {
        res.writeHead(404);
        return res.end();
      }
      return sendVideo(req, res, entry.path);
    }

    // ---- just raise the window ----
    if (req.method === "POST" && url === "/api/focus") {
      if (onFocus) onFocus();
      return json(res, 200, { ok: true });
    }

    // ---- the extension package, for Chrome rather than for the extension ----
    // Chrome polls this update manifest and pulls the .crx from the same origin,
    // so a policy entry can point at the local app instead of a hosted URL. Both
    // paths are fixed strings: nothing from the request picks a file.
    if (req.method === "GET" && url === "/ext/updates.xml") {
      const xml = crx.updatesXml(port);
      if (!xml) return json(res, 404, { error: { code: "NO_CRX", message: "Extension package not built." } });
      res.writeHead(200, { "Content-Type": "application/xml", "Cache-Control": "no-cache" });
      return res.end(xml);
    }
    if (req.method === "GET" && /^\/ext\/[A-Za-z0-9._-]+\.crx$/.test(url)) {
      const file = crx.crxPath();
      // The name in the URL has to match the package we actually have; otherwise
      // this would be a way to ask for "some other .crx" and get ours back.
      if (!file || path.basename(file) !== url.slice("/ext/".length)) {
        return json(res, 404, { error: { code: "NO_CRX", message: "Extension package not built." } });
      }
      let size;
      try {
        size = fs.statSync(file).size;
      } catch (_) {
        return json(res, 404, { error: { code: "NO_CRX", message: "Extension package missing." } });
      }
      res.writeHead(200, {
        "Content-Type": "application/x-chrome-extension",
        "Content-Length": size,
        "Cache-Control": "no-cache",
      });
      return fs.createReadStream(file).pipe(res);
    }

    json(res, 404, { error: { code: "NOT_FOUND", message: "Unknown endpoint." } });
  });

  server.on("error", (err) => {
    console.error(`[Nova API] ${err.code === "EADDRINUSE" ? `port ${port} already in use` : err.message}`);
  });
  server.listen(port, "127.0.0.1", () => console.log(`[Nova API] http://127.0.0.1:${port}`));
  return server;
}

// The extension popup expects flat string arrays / {language,label} objects.
function toExtensionShape(m) {
  return {
    url: m.url,
    title: m.title,
    uploader: m.uploader,
    thumbnail: m.thumbnail,
    duration: m.duration,
    is_live: m.isLive,
    site: m.site || "generic",
    site_label: m.siteLabel || "",
    qualities: m.qualities.map((q) => q.value),
    audio_tracks: m.audioTracks.map((a) => ({ language: a.value, label: a.label })),
    subtitles: m.subtitles.map((s) => ({
      language: s.value,
      name: s.label.replace(/ — auto$/, ""),
      auto: / — auto$/.test(s.label),
      ext: "vtt",
    })),
  };
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

// Stream a video file, honouring Range so Chromium can loop and seek it.
function sendVideo(req, res, filePath) {
  let size;
  try {
    size = fs.statSync(filePath).size;
  } catch (_) {
    res.writeHead(404);
    return res.end();
  }
  const type = Backgrounds.mime(filePath);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");

  if (range) {
    let start = range[1] ? parseInt(range[1], 10) : 0;
    let end = range[2] ? parseInt(range[2], 10) : size - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req, done) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) req.destroy();
  });
  req.on("end", () => {
    try {
      done(raw ? JSON.parse(raw) : {});
    } catch (_) {
      done({});
    }
  });
}

module.exports = { createApiServer };
