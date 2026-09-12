// NovaDownloader Bridge — service worker (the ONLY HTTP client).
// Talks to the desktop app's local API on 127.0.0.1. No remote code,
// no external hosts, token-paired with the desktop app.

const DEFAULTS = {
  port: 8765,
  token: "",
  prefs: { quality: "best", format: "mp4", audio: "original", subtitleMode: "none", subtitleLang: "" },
};

async function settings() {
  const data = await chrome.storage.local.get(["port", "token", "prefs"]);
  return {
    port: data.port || DEFAULTS.port,
    token: data.token || "",
    prefs: { ...DEFAULTS.prefs, ...(data.prefs || {}) },
  };
}

// The app's API port is a setting (Settings → Advanced), and the extension has no
// way to be told when it changes: every request then fails and the popup says
// "Not running" for ever, with nothing the user can do here. So a network failure
// triggers one sweep of the ports the app is likely to be on. `/api/status`
// reports `app: "NovaDownloader"`, which is what makes this safe — some unrelated
// local server answering on 8766 is not adopted as the app.
const PORT_CANDIDATES = [8765, 8766, 8767, 8768, 8769, 8770];
const APP_NAME = "NovaDownloader";

async function request(port, path, { method = "GET", body = null, token = "" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Nova-Token"] = token;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_parseError) {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function discoverPort(skip) {
  for (const port of PORT_CANDIDATES) {
    if (port === skip) continue;
    try {
      const probe = await request(port, "/api/status");
      if (probe.ok && probe.data && probe.data.app === APP_NAME) {
        await chrome.storage.local.set({ port });
        return port;
      }
    } catch (_) {
      // nothing listening there; try the next one
    }
  }
  return null;
}

const OFFLINE = { ok: false, status: 0, data: { error: { code: "NOT_RUNNING", message: "App not running" } } };

async function apiFetch(path, { method = "GET", body = null } = {}) {
  const { port, token } = await settings();
  try {
    return await request(port, path, { method, body, token });
  } catch (_networkError) {
    // Nothing answered on the remembered port. Either the app is closed, or its
    // port setting changed — look for it before reporting it closed.
    const found = await discoverPort(port);
    if (found === null) return OFFLINE;
    try {
      return await request(found, path, { method, body, token });
    } catch (_stillFailing) {
      return OFFLINE;
    }
  }
}

async function analyze(url) {
  return apiFetch("/api/analyze", { method: "POST", body: { url } });
}

async function startDownload(payload) {
  return apiFetch("/api/download", { method: "POST", body: payload });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      sendResponse({ ok: false, message: "bad message" });
      return;
    }
    switch (message.type) {
      case "nova-status": {
        const result = await apiFetch("/api/status");
        const { port } = await settings();
        sendResponse({
          ok: result.ok,
          connected: result.ok,
          port, // the popup needs it to stream the background clip
          tokenRequired: result.ok ? !!result.data.token_required : true,
          queue: result.ok ? result.data.queue : null,
        });
        break;
      }
      case "nova-analyze": {
        const result = await analyze(message.url);
        sendResponse({ ok: result.ok, status: result.status, data: result.data });
        break;
      }
      case "nova-download": {
        const result = await startDownload(message.payload);
        sendResponse({ ok: result.ok, status: result.status, data: result.data });
        break;
      }
      case "nova-button-click": {
        // quick action from the injected page button: use saved defaults.
        // No /api/status pre-check — it was a second round trip that could flake
        // on its own (reporting "not running" while the popup showed Connected),
        // and POST /api/download already fails the same way if the app is closed.
        const { prefs } = await settings();
        const result = await startDownload({
          url: message.url,
          quality: prefs.quality,
          format: prefs.format,
          audio_language: prefs.audio,
          subtitle_mode: prefs.subtitleMode,
          subtitle_lang: prefs.subtitleLang || null,
        });
        if (result.ok) {
          sendResponse({ ok: true, message: "Sent to NovaDownloader ✓" });
        } else if (result.status === 0) {
          sendResponse({ ok: false, message: "NovaDownloader is not running" });
        } else if (result.status === 401) {
          sendResponse({ ok: false, message: "Pairing required — open the extension popup" });
        } else {
          sendResponse({
            ok: false,
            message: (result.data && result.data.error && result.data.error.message) || "Rejected",
          });
        }
        break;
      }
      default:
        sendResponse({ ok: false, message: "unknown message type" });
    }
  })();
  return true; // keep the channel open for the async sendResponse
});
