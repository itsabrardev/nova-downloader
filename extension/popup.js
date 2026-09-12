// NovaDownloader Bridge — popup: connection state, per-page analysis,
// quality/format/audio/subtitle selection, one-click send, one-time pairing.

const el = (id) => document.getElementById(id);
const send = (message) =>
  new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));

let pageUrl = "";
let analyzed = null;

function setStatus(connected, text) {
  el("status-dot").className = "dot " + (connected ? "ok" : "bad");
  el("status-text").textContent = text;
}

function feedback(text, kind = "") {
  el("feedback").textContent = text;
  el("feedback").className = kind;
}

// yt-dlp's raw output, collapsed under the translated message. Cleared on every
// new attempt so a stale block can't be read as belonging to the current link.
function showDetails(text) {
  const toggle = el("details-toggle");
  const pre = el("details");
  pre.textContent = text || "";
  pre.classList.add("hidden");
  toggle.textContent = "Show yt-dlp output";
  toggle.classList.toggle("hidden", !text);
}

el("details-toggle").addEventListener("click", () => {
  const hidden = el("details").classList.toggle("hidden");
  el("details-toggle").textContent = hidden ? "Show yt-dlp output" : "Hide yt-dlp output";
});

// ---------- background clip, streamed from the desktop app ----------
// Whatever background is selected in the app plays here too. When the app is
// closed (or has no clip) the animated gradient stays visible instead.
function loadBackground(port) {
  const video = el("bgVideo");
  const bg = el("bg");
  const reveal = () => {
    video.classList.add("show");
    bg.classList.add("video-ready");
  };
  const fail = () => {
    video.classList.remove("show");
    bg.classList.remove("video-ready");
  };
  const targetPort = port || 8765;
  const url = `http://127.0.0.1:${targetPort}/api/background`;

  video.onloadeddata = reveal;
  video.oncanplay = reveal;
  video.onplaying = reveal;
  video.onerror = () => {
    viaBlob(url, video, reveal, fail);
  };

  play(video, url);
}

// Some Chrome builds refuse an http:// media subresource inside an extension
// page. Fetching it (host_permissions cover 127.0.0.1) and handing the element
// a blob: URL sidesteps that entirely.
async function viaBlob(url, video, reveal, fail) {
  try {
    const response = await fetch(url);
    if (!response.ok) return fail();
    const blob = await response.blob();
    video.onloadeddata = reveal;
    video.oncanplay = reveal;
    video.onplaying = reveal;
    play(video, URL.createObjectURL(blob));
  } catch (_) {
    fail();
  }
}

function play(video, src) {
  video.src = src;
  video.load();
  const started = video.play();
  if (started && started.catch) started.catch(() => {}); // autoplay policy; muted loops are fine
}

async function loadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return { url: null };

  const showPage = (url) => {
    pageUrl = url;
    el("page-title").textContent = tab.title || url;
    el("page-host").textContent = new URL(url).host;
    return { url };
  };

  // The address bar already points at one post (including TikTok's overlay
  // player, which pushes the post URL into history) — so decide that here rather
  // than asking the page. This is also what keeps the popup working in a tab that
  // was open before the extension was loaded or reloaded: Chrome does not
  // re-inject content scripts into existing tabs, so the tab may have no
  // listener, or an older one.
  if (NovaPage.isDirectPost(tab.url)) return showPage(NovaPage.clean(tab.url, tab.url));

  // A feed: only the page itself knows which item is on screen.
  const page = await askContentScript(tab.id);
  if (page && page.url) return showPage(page.url);

  el("page-title").textContent = tab.title || tab.url;
  el("page-host").textContent = new URL(tab.url).host;

  // `resolved === false` means the content script looked and genuinely couldn't
  // tell. A missing field means no content script answered at all — a different
  // problem with a different fix, so don't send the user off to open the post.
  if (page && page.resolved === false) return { url: null, unresolved: true };
  if (!page && NovaPage.siteOf(tab.url) !== "other") return { url: null, noScript: true };

  // Anywhere else the tab URL is the best guess; the app decides if it's usable.
  return showPage(tab.url);
}

function askContentScript(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "nova-target-url" }, (response) => {
        if (chrome.runtime.lastError) return resolve(null); // no listener on this page
        resolve(response && typeof response === "object" ? response : null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

async function refresh() {
  showDetails(""); // nothing from a previous run should survive a reopen
  const status = await send({ type: "nova-status" });
  const { token } = await chrome.storage.local.get(["token"]);

  if (!status.connected) {
    setStatus(false, "Desktop app: ○ Not running");
    el("download").disabled = true;
    feedback("Start NovaDownloader on this computer, then reopen this popup.");
    return;
  }
  setStatus(true, "Desktop app: ● Connected");
  loadBackground(status.port || 8765);
  if (status.tokenRequired && !token) {
    el("pairing").classList.remove("hidden");
  } else {
    el("pairing").classList.add("hidden");
  }

  const page = await loadActiveTab();
  if (!page.url) {
    if (page.noScript) {
      feedback("Reload this tab, then reopen the popup — the extension was loaded after the page was, so it can't read it yet.");
    } else if (page.unresolved) {
      feedback("Couldn't tell which post is on screen. Open the video's own page — so the address bar points at the post rather than the feed — then reopen this popup.");
    } else {
      feedback("This page isn’t a downloadable http(s) page.");
    }
    el("download").disabled = true;
    return;
  }
  const url = page.url;

  feedback("Analyzing…");
  showDetails("");
  const result = await send({ type: "nova-analyze", url });
  if (!result.ok) {
    if (result.status === 401) {
      el("pairing").classList.remove("hidden");
      feedback("Pairing required — enter the token below.", "bad");
    } else {
      const error = (result.data && result.data.error) || {};
      feedback(error.message || "Analysis failed.", "bad");
      showDetails(error.details || "");
    }
    el("download").disabled = true;
    return;
  }

  analyzed = result.data;
  // The extractor knows the real title — on a feed the tab title is just the site.
  if (analyzed.title) el("page-title").textContent = analyzed.title;
  if (analyzed.site_label) el("page-host").textContent = `${analyzed.site_label} · ${new URL(pageUrl).host}`;
  populateChoices(analyzed);
  el("download").disabled = false;
  feedback("");
}

function fillSelect(select, options, selectedValue) {
  select.innerHTML = "";
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
  if (selectedValue !== undefined) select.value = selectedValue;
}

function populateChoices(media) {
  const qualities = (media.qualities || []).map((value) => ({ value, label: value }));
  fillSelect(el("quality"), qualities.length ? qualities : [{ value: "best", label: "best" }],
    (media.prefs && media.prefs.quality) || "best");

  const tracks = (media.audio_tracks || []).map((track) => ({ value: track.language, label: track.label }));
  if (!tracks.length) tracks.push({ value: "original", label: "Original" });
  fillSelect(el("audio"), tracks, "original");

  const subs = (media.subtitles || []).map((track) => ({
    value: track.language,
    label: track.auto ? `${track.name} (auto)` : track.name,
  }));
  el("subs-row").style.display = subs.length ? "" : "none";
  fillSelect(el("subs-lang"), subs.length ? subs : [{ value: "", label: "—" }]);
}

el("download").addEventListener("click", async () => {
  if (!analyzed || !pageUrl) return;
  el("download").disabled = true;
  feedback("Sending…");
  const result = await send({
    type: "nova-download",
    payload: {
      url: pageUrl,
      quality: el("quality").value,
      format: el("format").value,
      audio_language: el("audio").value || "original",
      subtitle_mode: el("subs-mode").value,
      subtitle_lang: el("subs-mode").value === "none" ? null : el("subs-lang").value,
    },
  });
  el("download").disabled = false;
  if (result.ok) {
    feedback("Queued in NovaDownloader ✓", "ok");
  } else if (result.status === 401) {
    el("pairing").classList.remove("hidden");
    feedback("Pairing required — enter the token below.", "bad");
  } else {
    const message = result.data && result.data.error ? result.data.error.message : "Rejected.";
    feedback(message, "bad");
  }
});

el("save-token").addEventListener("click", async () => {
  const token = el("token").value.trim();
  if (!token) return;
  await chrome.storage.local.set({ token });
  feedback("Token saved — reconnecting…");
  refresh();
});

refresh();
