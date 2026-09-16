// Nova Downloader — renderer logic
const $ = (id) => document.getElementById(id);

let settings = {};
let analyzed = null;
const tasks = new Map(); // id -> task dto

// ================= SVG Vector Icons =================
const SVG_ICONS = {
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  prev: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"/></svg>`,
  next: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/></svg>`,
  shuffle: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  repeat: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  heartOutline: `<svg class="ico-heart" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled: `<svg class="ico-heart filled" width="16" height="16" viewBox="0 0 24 24" fill="#ff4d6d" stroke="#ff4d6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  volume: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  mute: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  lyrics: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  dots: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/></svg>`,
  folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  folderPlus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
  fileMusic: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  cancel: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  external: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ================= window controls =================
$("min").onclick = () => window.api.minimize();
$("max").onclick = () => window.api.maximize();
$("close").onclick = () => window.api.close();

// ================= navigation =================
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.onclick = () => goto(btn.dataset.page);
});
function goto(page) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
}

// ================= background video =================
async function loadBackground() {
  const v = $("bgVideo");
  const src = await window.api.getBackgroundVideo();
  if (!src) {
    v.removeAttribute("src");
    v.load();
    $("bg").classList.remove("video-ready");
    return;
  }
  const reveal = () => {
    v.classList.add("show");
    $("bg").classList.add("video-ready");
  };
  v.addEventListener("loadeddata", reveal, { once: true });
  v.addEventListener("playing", reveal, { once: true });
  v.addEventListener("error", () => {
    const code = v.error ? v.error.code : "?";
    console.error(`[Nova] background video failed (code ${code}) — Chromium can't decode HEVC/H.265:`, src);
    v.classList.remove("show");
    $("bg").classList.remove("video-ready");
  });
  v.src = src;
  v.load();
  const p = v.play();
  if (p && p.catch) p.catch((e) => console.warn("[Nova] autoplay blocked:", e && e.message));
}

// ================= toast =================
let toastTimer = null;
function toast(msg, kind, elementId = "toast") {
  const t = $(elementId);
  t.textContent = msg;
  t.className = "toast" + (kind ? " " + kind : "");
  t.onclick = null;
  clearTimeout(toastTimer);
  if (kind !== "error") toastTimer = setTimeout(() => t.classList.add("hidden"), 6000);
}
const hideToast = (id = "toast") => $(id).classList.add("hidden");

// ================= dependency check =================
// yt-dlp and ffmpeg are external programs. Probe them at boot so the UI says
// what's missing up front, instead of every download failing at the last step.
let deps = null;
let updateBusy = false;

async function refreshDeps() {
  deps = await window.api.checkDeps();
  paintDeps();
}

// Shown in two places — Settings → Advanced and the Home banner — so the state
// lives here rather than on either button. The banner copy is rebuilt by
// paintDeps(), so its node may not exist yet.
function updateStatus(text, kind) {
  ["updateState", "bannerUpdateState"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.textContent = text ? ` ${text}` : "";
    el.className = "dep-state " + (kind || "");
  });
}

window.api.onYtdlpUpdateProgress((p) => {
  if (p.phase === "downloading") return updateStatus(`downloading… ${p.percent}%`);
  if (p.phase === "verifying") return updateStatus("verifying checksum…");
  updateStatus("checking for a newer build…");
});

async function runYtdlpUpdate() {
  if (updateBusy) return;
  updateBusy = true;
  const btns = ["updateYtdlp", "bannerUpdate"].map($).filter(Boolean);
  btns.forEach((b) => (b.disabled = true));
  updateStatus("checking for a newer build…");
  // The update can be started from Home's banner or from Settings, so put the
  // toast wherever the user is actually looking.
  const toastId = $("page-settings").classList.contains("active") ? "settingsToast" : "toast";
  try {
    const res = await window.api.updateYtdlp();
    if (res.ok) {
      const label = res.channel === "nightly" ? `${res.version} (nightly)` : res.version;
      updateStatus(`installed ${label}`, "ok");
      toast(`yt-dlp updated to ${label}.`, "success", toastId);
    } else {
      updateStatus(res.message || "update failed", "bad");
      toast(res.message || "Update failed.", "error", toastId);
    }
  } catch (_) {
    updateStatus("update failed", "bad");
    toast("Update failed — check your connection.", "error", toastId);
  } finally {
    updateBusy = false;
    btns.forEach((b) => (b.disabled = false));
    // Re-probe so the version line and the stale banner reflect the new binary.
    await refreshDeps();
  }
}

function paintDeps() {
  if (!deps) return;
  [["ytdlpState", deps.ytdlp], ["ffmpegState", deps.ffmpeg]].forEach(([id, d]) => {
    $(id).textContent = d.ok ? `found — ${d.version || "ok"}` : "not found";
    $(id).className = "dep-state " + (d.ok ? "ok" : "bad");
  });
  // An old yt-dlp works right up until a site changes, then fails only on that
  // site — so the version line says so instead of a plain green "found".
  if (deps.ytdlp.ok && deps.ytdlp.stale) {
    $("ytdlpState").textContent = `found — ${deps.ytdlp.version} (${deps.ytdlp.ageDays} days old)`;
    $("ytdlpState").className = "dep-state warn";
  }

  const box = $("depWarn");
  box.innerHTML = "";
  const missing = [];
  if (!deps.ytdlp.ok) missing.push("ytdlp");
  if (!deps.ffmpeg.ok) missing.push("ffmpeg");
  if (!missing.length && !deps.ytdlp.stale) {
    box.classList.add("hidden");
    return;
  }

  // Built with DOM nodes, never innerHTML — the paths come from settings.
  const para = (parts) => {
    const p = document.createElement("div");
    parts.forEach((part) => {
      if (typeof part === "string") return p.appendChild(document.createTextNode(part));
      const node = document.createElement(part.tag);
      node.textContent = part.text;
      p.appendChild(node);
    });
    box.appendChild(p);
    return p;
  };

  if (!deps.ytdlp.ok) {
    para([
      { tag: "b", text: "yt-dlp not found — no download can run." },
      " Use the button below to install the official build into the app's ",
      { tag: "code", text: "bin\\" },
      " folder, or install it yourself with ",
      { tag: "code", text: "winget install yt-dlp.yt-dlp" },
      " and reopen the app.",
    ]);
  }
  if (!deps.ffmpeg.ok) {
    para([
      { tag: "b", text: "FFmpeg not found." },
      " HD downloads (video and audio arrive as separate streams) and MP3 need it. Put ",
      { tag: "code", text: "ffmpeg.exe" },
      " in the ",
      { tag: "code", text: "ffmpeg\\" },
      " folder, or install it with ",
      { tag: "code", text: "winget install Gyan.FFmpeg" },
      ".",
    ]).style.marginTop = deps.ytdlp.ok ? "0" : "8px";
  }
  // Present but old. Worth its own line because the symptom is confusing: most
  // links keep working and one site suddenly errors out, which reads like a bug
  // in this app rather than an out-of-date extractor.
  if (deps.ytdlp.ok && deps.ytdlp.stale) {
    const first = box.childElementCount === 0;
    para([
      { tag: "b", text: `yt-dlp is ${deps.ytdlp.ageDays} days old (${deps.ytdlp.version}).` },
      " Sites change constantly, so an old build starts failing on individual sites — TikTok and Facebook first."
      + " Package managers lag behind the release that fixes them, so update from the source:",
    ]).style.marginTop = first ? "0" : "8px";
  }
  // One-click fix, right where the problem is reported. The install itself is
  // verified against yt-dlp's published SHA-256 in the main process.
  if (!deps.ytdlp.ok || deps.ytdlp.stale) {
    const btn = document.createElement("button");
    btn.id = "bannerUpdate";
    btn.className = "folder-btn";
    btn.textContent = deps.ytdlp.ok ? "Update yt-dlp now" : "Install yt-dlp";
    btn.style.marginTop = "10px";
    btn.disabled = updateBusy;
    btn.onclick = () => runYtdlpUpdate();
    box.appendChild(btn);

    const state = document.createElement("span");
    state.id = "bannerUpdateState";
    state.className = "dep-state";
    state.style.marginLeft = "10px";
    box.appendChild(state);
  }
  if (missing.length) para(["Already installed somewhere else? Settings → Advanced → Browse."]).style.marginTop = "8px";
  box.classList.remove("hidden");
}

// ================= HOME: analyze =================
$("paste").onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) $("url").value = text.trim();
  } catch (_) {
    toast("Clipboard blocked — paste with Ctrl+V.", "error");
  }
};

$("url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("analyze").click();
});

$("analyze").onclick = async () => {
  const url = $("url").value.trim();
  if (!/^https?:\/\//i.test(url)) {
    toast("Please paste a valid http(s) video URL.", "error");
    return;
  }
  hideToast();
  hideAnalyzeError();
  $("info").classList.add("hidden");
  $("spinner").classList.remove("hidden");
  $("analyze").disabled = true;

  const res = await window.api.analyze(url);

  $("spinner").classList.add("hidden");
  $("analyze").disabled = false;

  if (!res.ok) {
    showAnalyzeError(res.message || "Could not analyze this link.", res.details);
    return;
  }
  analyzed = res.data;
  fillInfo(analyzed);
  $("info").classList.remove("hidden");
};

// Failure copy is instructions ("update yt-dlp, then try cookies"), so it stays
// on screen instead of vanishing with a toast. `details` is yt-dlp's raw output,
// collapsed by default — it only matters when the app's own advice doesn't help.
function showAnalyzeError(message, details) {
  $("analyzeErrorMsg").textContent = message;
  const toggle = $("analyzeErrorToggle");
  const pre = $("analyzeErrorDetails");
  pre.textContent = details || "";
  pre.classList.add("hidden");
  toggle.textContent = "Show yt-dlp output";
  toggle.classList.toggle("hidden", !details);
  $("analyzeError").classList.remove("hidden");
}

function hideAnalyzeError() {
  $("analyzeError").classList.add("hidden");
  $("analyzeErrorDetails").classList.add("hidden");
}

$("analyzeErrorToggle").onclick = () => {
  const pre = $("analyzeErrorDetails");
  const shown = pre.classList.toggle("hidden");
  $("analyzeErrorToggle").textContent = shown ? "Show yt-dlp output" : "Hide yt-dlp output";
};

function fillSelect(select, options, selected) {
  select.innerHTML = "";
  options.forEach((o) => {
    const node = document.createElement("option");
    node.value = o.value;
    node.textContent = o.label;
    select.appendChild(node);
  });
  if (selected !== undefined && options.some((o) => o.value === selected)) select.value = selected;
}

function fillInfo(m) {
  $("thumb").src = m.thumbnail || "";
  $("thumb").style.visibility = m.thumbnail ? "visible" : "hidden";
  $("vTitle").textContent = m.title;
  const bits = [m.siteLabel, m.uploader, m.isLive ? "LIVE" : fmtDuration(m.duration)].filter(Boolean);
  $("vSub").textContent = bits.join("  •  ");

  fillSelect($("quality"), m.qualities, settings.defaultQuality);
  fillSelect($("audioLang"), m.audioTracks, settings.defaultAudioLanguage);
  $("format").value = settings.defaultFormat || "mp4";
  syncQualityEnabled(); // a default of mp3 must grey the quality picker out too

  // Subtitles only offered when the extractor actually publishes them.
  const hasSubs = m.subtitles.length > 0;
  $("subMode").disabled = !hasSubs;
  $("subMode").value = hasSubs ? settings.defaultSubtitleMode || "none" : "none";
  fillSelect($("subLang"), hasSubs ? m.subtitles : [{ value: "", label: "—" }], settings.defaultSubtitleLang);
  syncSubLangVisibility();
}

$("subMode").onchange = syncSubLangVisibility;
function syncSubLangVisibility() {
  $("subLangField").classList.toggle("hidden", $("subMode").value === "none");
}

// Audio-only formats have no video quality to pick.
function syncQualityEnabled() {
  const audioOnly = $("format").value === "mp3";
  $("quality").disabled = audioOnly;
  $("quality").style.opacity = audioOnly ? 0.5 : 1;
}
$("format").onchange = syncQualityEnabled;

$("folderBtn").onclick = async () => {
  const folder = await window.api.chooseFolder();
  if (folder) {
    settings.downloadFolder = folder;
    settings.resolvedDownloadFolder = folder;
    paintFolders();
  }
};

$("download").onclick = async () => {
  if (!analyzed) return;
  const task = await window.api.enqueue({
    url: analyzed.url,
    title: analyzed.title,
    thumbnail: analyzed.thumbnail,
    uploader: analyzed.uploader,
    quality: $("quality").value,
    format: $("format").value,
    audioLanguage: $("audioLang").value,
    subtitleMode: $("subMode").value,
    subtitleLang: $("subMode").value === "none" ? "" : $("subLang").value,
  });
  if (task.status === "failed") {
    toast(task.error, "error");
    return;
  }
  upsertTask(task);
  toast("Added to the queue.", "success");
  goto("queue");
};

// ================= task rendering =================
const TERMINAL_STATUS = ["completed", "failed", "cancelled"];

function upsertTask(task) {
  tasks.set(task.id, task);
  render();
}

function render() {
  const all = [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  const active = all.filter((t) => !TERMINAL_STATUS.includes(t.status));
  const finished = all.filter((t) => TERMINAL_STATUS.includes(t.status));

  const q = $("histSearch").value.trim().toLowerCase();
  const filteredHistory = q
    ? finished.filter((t) => (t.title || t.url).toLowerCase().includes(q))
    : finished;

  // Drop cached rows for tasks that no longer exist, or the map grows forever.
  for (const id of taskNodes.keys()) if (!tasks.has(id)) taskNodes.delete(id);

  paintList($("queueList"), active);
  paintList($("historyList"), filteredHistory);
  $("queueEmpty").classList.toggle("hidden", active.length > 0);
  $("historyEmpty").classList.toggle("hidden", filteredHistory.length > 0);

  const running = active.filter((t) => t.status === "downloading" || t.status === "processing").length;
  $("queueCount").textContent = active.length;
  $("queueCount").style.display = active.length ? "" : "none";
  document.title = running ? `Nova Downloader — ${running} downloading` : "Nova Downloader";
}

// One DOM node per task, reused across renders. render() runs on every yt-dlp
// progress line — several times a second — and the old code wiped the list with
// innerHTML="" and rebuilt every row. Each fresh .task node restarted the
// `fadeUp` CSS animation from opacity 0, so an active download made the whole
// row strobe. Reusing the node also lets .task-fill's width transition actually
// animate and stops the thumbnail from being re-fetched on every tick.
const taskNodes = new Map();

function paintList(container, list) {
  const wanted = list.map((t) => {
    let entry = taskNodes.get(t.id);
    if (!entry) {
      entry = createTaskNode();
      taskNodes.set(t.id, entry);
    }
    updateTaskNode(entry, t);
    return entry.el;
  });

  // Rows that vanished, or that moved to the other list (completed → history).
  const keep = new Set(wanted);
  Array.from(container.children).forEach((el) => {
    if (!keep.has(el)) el.remove();
  });
  // Only move nodes that are actually in the wrong place: re-inserting a node
  // restarts its animation, which is the flicker this whole function avoids.
  wanted.forEach((el, i) => {
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
  });
}

// The parts of a row that never change identity. Values are filled in by
// updateTaskNode() so the same nodes survive every re-render.
function createTaskNode() {
  const el = document.createElement("div");
  el.className = "task";

  const img = document.createElement("img");
  img.className = "task-thumb";
  el.appendChild(img);

  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("div");
  title.className = "task-title";
  body.appendChild(title);

  const bar = document.createElement("div");
  bar.className = "task-bar";
  const fill = document.createElement("div");
  fill.className = "task-fill";
  bar.appendChild(fill);
  body.appendChild(bar);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const pill = document.createElement("span");
  meta.appendChild(pill);
  body.appendChild(meta);

  const err = document.createElement("div");
  err.className = "task-error hidden";
  const errMsg = document.createElement("div");
  err.appendChild(errMsg);
  // Same collapsed raw-output panel as the Home analyze error. The handler is
  // bound once, here, because updateTaskNode() runs on every progress tick.
  const errToggle = document.createElement("button");
  errToggle.className = "link-btn hidden";
  errToggle.textContent = "Show yt-dlp output";
  const errPre = document.createElement("pre");
  errPre.className = "err-details hidden";
  errToggle.onclick = () => {
    const hidden = errPre.classList.toggle("hidden");
    errToggle.textContent = hidden ? "Show yt-dlp output" : "Hide yt-dlp output";
  };
  err.appendChild(errToggle);
  err.appendChild(errPre);
  body.appendChild(err);

  el.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  el.appendChild(actions);

  return {
    el, img, title, bar, fill, meta, pill,
    err, errMsg, errToggle, errPre,
    actions, thumb: "", status: null, id: null,
  };
}

function updateTaskNode(n, t) {
  n.id = t.id;
  const done = TERMINAL_STATUS.includes(t.status);

  const thumb = t.thumbnail || "";
  if (thumb !== n.thumb) {
    n.thumb = thumb;
    if (thumb) n.img.src = thumb;
    else n.img.removeAttribute("src");
  }

  const label = t.title || t.url;
  if (n.title.textContent !== label) n.title.textContent = label;
  if (n.title.title !== t.url) n.title.title = t.url;

  n.bar.classList.toggle("hidden", done && !t.compressing);
  const pct = (t.percent || 0) + "%";
  if (n.fill.style.width !== pct) n.fill.style.width = pct;

  // Cheap to rebuild — no animation hangs off these, unlike .task itself.
  const pillClass = "pill " + t.status;
  if (n.pill.className !== pillClass) n.pill.className = pillClass;
  if (n.pill.textContent !== t.status) n.pill.textContent = t.status;
  while (n.meta.children.length > 1) n.meta.lastChild.remove();

  const bits = [];
  if (t.compressing) {
    bits.push(`Compressing… ${(t.percent || 0).toFixed(0)}%`);
  } else {
    if (t.status === "downloading") bits.push(`${(t.percent || 0).toFixed(1)}%`);
    if (t.speed) bits.push(t.speed);
    if (t.eta) bits.push("ETA " + t.eta);
    if (t.size) bits.push(t.size);
  }
  if (t.note && !t.compressing) bits.push(t.note);
  bits.push([t.quality, t.format].filter(Boolean).join(" · "));
  if (t.siteLabel) bits.push(t.siteLabel);
  if (t.usedFallback) bits.push("via mobile API");
  if (t.audioLanguage && t.audioLanguage !== "original") bits.push("audio: " + t.audioLanguage);
  if (t.source === "extension") bits.push("from browser");
  bits.filter(Boolean).forEach((text) => {
    const s = document.createElement("span");
    s.textContent = text;
    n.meta.appendChild(s);
  });

  if (n.errMsg.textContent !== (t.error || "")) n.errMsg.textContent = t.error || "";
  n.err.classList.toggle("hidden", !t.error);
  const raw = t.errorDetails || "";
  if (n.errPre.textContent !== raw) n.errPre.textContent = raw;
  n.errToggle.classList.toggle("hidden", !raw);

  // Buttons only depend on status, so rebuild them only when it changes —
  // otherwise a click could land on a node that was just replaced under it.
  if (n.status !== t.status) {
    n.status = t.status;
    paintTaskActions(n, t);
  }
}

function paintTaskActions(n, t) {
  n.actions.textContent = "";
  const add = (svgHtml, title, fn) => {
    const b = document.createElement("button");
    b.className = "act";
    b.innerHTML = svgHtml;
    b.title = title;
    b.onclick = fn;
    n.actions.appendChild(b);
  };

  if (t.status === "downloading" || t.status === "processing" || t.status === "queued") {
    add(SVG_ICONS.pause, "Pause", () => act("pause", n.id));
    add(SVG_ICONS.cancel, "Cancel", () => act("cancel", n.id));
  } else if (t.status === "paused") {
    add(SVG_ICONS.play, "Resume", () => act("resume", n.id));
    add(SVG_ICONS.cancel, "Cancel", () => act("cancel", n.id));
  } else if (t.status === "completed") {
    const task = tasks.get(n.id) || t;
    const fp = task.filePath || "";
    const isAudio = task.format === "mp3" || task.format === "m4a" || /\.(mp3|m4a|flac|wav|aac|ogg|opus|wma)$/i.test(fp);
    const isVideo = /\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i.test(fp);
    if (isAudio && fp) {
      add(SVG_ICONS.play, "Play in Music Player", () => {
        const norm = fp.replace(/\\/g, "/");
        const song = {
          id: "task_" + t.id,
          name: task.title || fp.split(/[\\/]/).pop(),
          artist: "Downloaded Audio",
          image: task.thumbnail || "",
          filePath: fp,
          streamUrl: `local-audio://${encodeURIComponent(norm)}`,
          source: "offline",
          isOffline: true,
        };
        playSong(song, [song], 0);
      });
    } else if (isVideo && fp) {
      add(SVG_ICONS.play, "Play in Nova Player", () => {
        if (window.playNovaFile) window.playNovaFile(fp, task.title || fp.split(/[\\/]/).pop());
      });
    }
    add(SVG_ICONS.folder, "Show in folder", () => {
      window.api.openFolder(task.filePath || task.folder);
    });
    add(SVG_ICONS.external, "Open file", () => window.api.openFile((tasks.get(n.id) || t).filePath));
    add(SVG_ICONS.trash, "Remove from list", () => act("remove", n.id));
  } else {
    add(SVG_ICONS.refresh, "Retry", () => act("retry", n.id));
    add(SVG_ICONS.trash, "Remove from list", () => act("remove", n.id));
  }
}

async function act(action, id) {
  await window.api.taskAction(action, id);
  if (action === "remove") {
    tasks.delete(id);
    render();
  }
}

$("pauseAll").onclick = () => window.api.pauseAll();
$("resumeAll").onclick = () => window.api.resumeAll();
$("clearFinished").onclick = () => window.api.clearFinished();
$("histSearch").oninput = render;

// ================= SETTINGS =================
const NUM_FIELDS = {
  setMaxConcurrent: "maxConcurrent",
  setConnections: "connections",
  setRetries: "retries",
  setSpeedLimit: "speedLimitKbps",
  setApiPort: "apiPort",
};
const SELECT_FIELDS = {
  setFormat: "defaultFormat",
  setSubMode: "defaultSubtitleMode",
  setCookies: "cookiesFromBrowser",
  setYtdlpChannel: "ytdlpChannel",
  setCompressPreset: "compressPreset",
};
const CHECK_FIELDS = {
  setAnimatedBg: "animatedBackground",
  setNotifications: "notifications",
  setNoWatermark: "tiktokNoWatermark",
  setCompressAfterDownload: "compressAfterDownload",
  setPreferVp9Av1: "preferVp9Av1",
};

function paintSettings() {
  Object.entries(NUM_FIELDS).forEach(([id, key]) => ($(id).value = settings[key]));
  Object.entries(SELECT_FIELDS).forEach(([id, key]) => ($(id).value = settings[key]));
  Object.entries(CHECK_FIELDS).forEach(([id, key]) => ($(id).checked = !!settings[key]));
  $("setAudioLang").value = settings.defaultAudioLanguage || "original";
  $("setBgOpacity").value = settings.backgroundOpacity;
  $("dimValue").textContent = Math.round(settings.backgroundOpacity * 100) + "%";
  $("ytdlpPathText").textContent = settings.ytdlpPath || "auto";
  $("ffmpegPathText").textContent = settings.ffmpegPath || "auto";
  if ($("setPairingToken")) $("setPairingToken").textContent = settings.apiToken || "—";
  // Show compression speed preset only when compression is enabled
  const presetRow = $("compressPresetRow");
  if (presetRow) presetRow.style.display = settings.compressAfterDownload ? "" : "none";
  paintFolders();
  applyAppearance();
}

function paintFolders() {
  const folder = settings.resolvedDownloadFolder || settings.downloadFolder || "—";
  $("folderPath").textContent = folder;
  $("folderPath").title = folder;
  $("setFolderPath").textContent = folder;
  $("setFolderPath").title = folder;
}

function applyAppearance() {
  $("bgOverlay").style.background = `rgba(6, 3, 12, ${settings.backgroundOpacity})`;
}

async function patch(p) {
  settings = await window.api.updateSettings(p);
  paintSettings();
}

Object.entries(NUM_FIELDS).forEach(([id, key]) => {
  $(id).onchange = () => patch({ [key]: Number($(id).value) });
});
Object.entries(SELECT_FIELDS).forEach(([id, key]) => {
  $(id).onchange = () => patch({ [key]: $(id).value });
});
Object.entries(CHECK_FIELDS).forEach(([id, key]) => {
  $(id).onchange = async () => {
    await patch({ [key]: $(id).checked });
    if (key === "animatedBackground") loadBackground();
  };
});
$("setAudioLang").onchange = () => patch({ defaultAudioLanguage: $("setAudioLang").value.trim() || "original" });
$("setBgOpacity").oninput = () => {
  settings.backgroundOpacity = Number($("setBgOpacity").value);
  $("dimValue").textContent = Math.round(settings.backgroundOpacity * 100) + "%";
  applyAppearance();
};
$("setBgOpacity").onchange = () => patch({ backgroundOpacity: Number($("setBgOpacity").value) });

$("copyTokenBtn").onclick = () => {
  const token = settings.apiToken || $("setPairingToken").textContent;
  if (!token || token === "—") return;
  navigator.clipboard.writeText(token).then(() => {
    const originalText = $("copyTokenBtn").textContent;
    $("copyTokenBtn").textContent = "Copied!";
    setTimeout(() => {
      $("copyTokenBtn").textContent = originalText;
    }, 2000);
  });
};

$("regenTokenBtn").onclick = async () => {
  const randomChars = "0123456789abcdef";
  let newToken = "";
  for (let i = 0; i < 32; i++) {
    newToken += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  await patch({ apiToken: newToken });
};

$("setFolderBtn").onclick = $("folderBtn").onclick;
$("pickYtdlp").onclick = async () => {
  const p = await window.api.chooseBinary("ytdlp");
  if (p) { settings.ytdlpPath = p; paintSettings(); refreshDeps(); }
};
$("updateYtdlp").onclick = () => runYtdlpUpdate();
$("pickFfmpeg").onclick = async () => {
  const p = await window.api.chooseBinary("ffmpeg");
  if (p) { settings.ffmpegPath = p; paintSettings(); refreshDeps(); }
};
$("resetSettings").onclick = async () => {
  settings = await window.api.resetSettings();
  paintSettings();
  loadBackground();
  refreshDeps();
  paintBgList();
  toast("Settings restored to defaults.", "success", "settingsToast");
};

// ================= browser extension =================
// The id and the folder come from the app's install layout, not from settings —
// so this panel is the one honest answer to "is the extension actually there".
let extInfo = null;

async function paintExtension() {
  extInfo = await window.api.extensionInfo();
  const state = $("extState");
  const folder = $("extFolderText");

  folder.textContent = extInfo.folder || "not found";
  folder.title = extInfo.folder || "";

  if (!extInfo.id) {
    state.textContent = "not packed — run npm run pack:crx";
    state.className = "dep-state warn";
  } else if (extInfo.portMismatch) {
    // The install-time policy entry names port 8765; a different port means the
    // browser polls a URL nothing answers on.
    state.textContent = `${extInfo.id.slice(0, 8)}… — API port is ${extInfo.port}, the browser expects 8765`;
    state.className = "dep-state warn";
  } else {
    state.textContent = `${extInfo.id.slice(0, 8)}… v${extInfo.version}`;
    state.className = "dep-state ok";
  }
  $("showExtFolder").disabled = !extInfo.folder;
}

$("openExtPage").onclick = async () => {
  const res = await window.api.openExtensionsPage();
  if (!res.ok) toast(res.message, "error", "settingsToast");
};
$("showExtFolder").onclick = () => {
  if (extInfo && extInfo.folder) window.api.openFolder(extInfo.folder);
};

// ================= background library =================
async function paintBgList() {
  const items = await window.api.listBackgrounds();
  const list = $("bgList");
  list.innerHTML = "";
  $("bgEmpty").classList.toggle("hidden", items.length > 0);

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bg-item" + (item.selected ? " selected" : "");
    row.title = item.name;
    row.onclick = async () => {
      await window.api.selectBackground(item.id);
      await paintBgList();
      loadBackground();
    };

    const tick = document.createElement("span");
    tick.className = "bg-tick";
    row.appendChild(tick);

    const name = document.createElement("span");
    name.className = "bg-name";
    name.textContent = item.name;
    row.appendChild(name);

    if (item.source === "builtin") {
      const tag = document.createElement("span");
      tag.className = "bg-tag";
      tag.textContent = "bundled";
      row.appendChild(tag);
    } else {
      // Only uploaded clips can be deleted — bundled ones stay put.
      const del = document.createElement("button");
      del.className = "bg-del";
      del.innerHTML = "&#128465;";
      del.title = "Remove from library";
      del.onclick = async (e) => {
        e.stopPropagation(); // don't also select the row we're deleting
        await window.api.removeBackground(item.id);
        await paintBgList();
        loadBackground();
      };
      row.appendChild(del);
    }
    list.appendChild(row);
  });
}

$("addBg").onclick = async () => {
  const res = await window.api.addBackground();
  if (!res) return; // dialog cancelled
  if (res.error) {
    toast(res.error, "error", "settingsToast");
    return;
  }
  settings = await window.api.getSettings();
  paintSettings();
  await paintBgList();
  loadBackground();
  toast("Background added and applied.", "success", "settingsToast");
};

// ================= events from main =================
window.api.onTaskUpdate(upsertTask);
window.api.onTaskRemoved(({ id }) => { tasks.delete(id); render(); });
window.api.onTaskCleared(() => {
  [...tasks.values()].forEach((t) => {
    if (["completed", "failed", "cancelled"].includes(t.status)) tasks.delete(t.id);
  });
  render();
});
window.api.onIncoming((task) => {
  upsertTask(task);
  goto("queue");
});

// ================= helpers =================
function fmtDuration(sec) {
  if (!sec) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
           : `${m}:${String(r).padStart(2, "0")}`;
}

// ================= movies (OmniSave) =================
// Search OmniSave's catalogue, open a title, pick quality + episodes, and the
// main process mints fresh (time-limited) file links right before queueing.
const mv = { page: 1, pages: 1, detail: null };

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("mvGo").onclick = () => mvSearch(1);
$("mvSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") mvSearch(1); });
$("mvPrev").onclick = () => mvSearch(mv.page - 1);
$("mvNext").onclick = () => mvSearch(mv.page + 1);
$("mvClose").onclick = closeMovie;
$("mvModal").onclick = (e) => { if (e.target === $("mvModal")) closeMovie(); };
$("mvAllEps").onclick = () => checkAllEps(true);
$("mvNoEps").onclick = () => checkAllEps(false);
$("mvDownload").onclick = downloadSelected;

async function mvStatus(msg, isError) {
  const el = $("mvStatus");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
  el.style.color = isError ? "var(--bad)" : "";
}

async function mvSearch(page) {
  const q = $("mvSearch").value.trim();
  if (!q) return;
  page = Math.max(1, page || 1);
  mv.page = page;
  const grid = $("mvGrid");
  grid.innerHTML = "";
  $("mvPager").classList.add("hidden");
  await mvStatus("Searching…");

  const res = await window.api.searchMovies({
    keyword: q,
    page,
    subjectType: $("mvType").value,
  });
  if (!res.ok) return mvStatus(res.message || "Search failed.", true);

  const items = res.data.results.filter((r) => r.hasResource !== false && r.detailPath);
  if (!items.length) return mvStatus(`Nothing found for “${q}”.`, false);

  mvStatus("");
  grid.innerHTML = items.map((r, i) => `
    <div class="mv-card" data-i="${i}">
      <img class="mv-poster" src="${esc(r.cover)}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'" />
      <div class="mv-card-body">
        <div class="mv-name" title="${esc(r.title)}">${esc(r.title)}</div>
        <div class="mv-subline">
          <span class="mv-tag">${r.subjectType === 2 ? "Series" : "Movie"}</span>
          ${r.releaseDate ? `<span>${esc(r.releaseDate.slice(0, 4))}</span>` : ""}
          ${r.imdb ? `<span class="mv-rating">★ ${esc(r.imdb)}</span>` : ""}
        </div>
      </div>
    </div>`).join("");
  mv._items = items;

  grid.querySelectorAll(".mv-card").forEach((card) => {
    card.onclick = () => openMovie(items[Number(card.dataset.i)]);
  });

  mv.pages = page;
  $("mvPage").textContent = `page ${page}`;
  $("mvPrev").disabled = page <= 1;
  $("mvNext").disabled = !res.data.pager.hasMore;
  $("mvPager").classList.remove("hidden");
}

async function openMovie(item) {
  mv.detail = null;
  await mvStatus("Loading title…");
  const res = await window.api.movieDetail(item.detailPath);
  if (!res.ok) return mvStatus(res.message || "Could not load this title.", true);
  mv.detail = res.data;
  await mvStatus("");

  const s = mv.detail.subject;
  $("mvTitle").textContent = s.title;
  $("mvMeta").textContent =
    [s.releaseDate && s.releaseDate.slice(0, 4), s.genre, s.country, s.imdb && `★ ${s.imdb}`]
      .filter(Boolean).join(" · ") || "—";
  $("mvDesc").textContent = s.description || "";
  $("mvSubs").textContent = s.subtitles
    ? `Available subtitles: ${s.subtitles}` : "";
  $("mvCover").src = s.cover || item.cover || "";
  $("mvToast").classList.add("hidden");

  // Episodes (series only): one checkbox per episode.
  const eps = mv.detail.episodes;
  $("mvEpWrap").classList.toggle("hidden", !eps.length);
  if (eps.length) {
    $("mvEpList").innerHTML = eps.map((e, i) => `
      <label class="mv-ep">
        <input type="checkbox" data-i="${i}" checked />
        S${String(e.se).padStart(2, "0")}E${String(e.ep).padStart(2, "0")}
      </label>`).join("");
  }

  // Quality list from a link preview — first episode for series, whole subject
  // for a movie. Fresh links are minted again at download time (they expire).
  $("mvQuality").innerHTML = '<option>Loading qualities…</option>';
  const previewTarget = eps.length ? { ...eps[0] } : {};
  const lr = await window.api.movieLinks({
    subjectId: s.subjectId,
    detailPath: s.detailPath,
    se: previewTarget.se || 0,
    ep: previewTarget.ep || 0,
  });
  mv.links = lr.ok ? lr.data : null;
  const qualities = mv.links && mv.links.downloads.length
    ? [...new Set(mv.links.downloads.map((d) => d.resolution))].sort((a, b) => b - a)
    : [];
  $("mvQuality").innerHTML = qualities.length
    ? qualities.map((r) => {
        const d = mv.links.downloads.find((x) => x.resolution === r);
        return `<option value="${r}">${r}p · ${fmtSize(d.size)}</option>`;
      }).join("")
    : '<option value="">No free downloads</option>';

  // Subtitle choices, if any captions exist.
  const caps = mv.links ? mv.links.captions : [];
  $("mvSubLang").innerHTML =
    '<option value="">No subtitle</option>' +
    caps.map((c) => `<option value="${esc(c.lan)}">${esc(c.lanName)}</option>`).join("");

  $("mvModal").classList.remove("hidden");
}

function closeMovie() {
  $("mvModal").classList.add("hidden");
  mv.detail = null;
  mv.links = null;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "?";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

function checkAllEps(on) {
  document.querySelectorAll("#mvEpList input[type=checkbox]").forEach((c) => (c.checked = on));
}

async function downloadSelected() {
  if (!mv.detail) return;
  const s = mv.detail.subject;
  const resolution = Number($("mvQuality").value) || undefined;
  const subtitleLan = $("mvSubLang").value || null;
  const thumb = s.cover || "";

  let targets;
  const epBox = $("mvEpWrap");
  if (!epBox.classList.contains("hidden")) {
    targets = [...document.querySelectorAll("#mvEpList input:checked")]
      .map((c) => mv.detail.episodes[Number(c.dataset.i)])
      .filter(Boolean);
    if (!targets.length) return toastMovies("Pick at least one episode.", "error");
  } else {
    targets = [{}]; // a movie needs no se/ep
  }

  const btn = $("mvDownload");
  btn.disabled = true;
  let ok = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    toastMovies(`Queueing ${i + 1}/${targets.length}…`);
    const res = await window.api.downloadMovie({
      subjectId: s.subjectId,
      detailPath: s.detailPath,
      se: t.se || 0,
      ep: t.ep || 0,
      title: s.title,
      thumbnail: thumb,
      resolution,
      subtitleLan,
    });
    if (res.ok) ok += res.ids.length;
    // Each call mints fresh signed links; hammering the API/CDN in a tight
    // loop trips its rate limiter and every episode fails at once.
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  btn.disabled = false;
  render();
  if (ok) {
    toastMovies(`${ok} download${ok === 1 ? "" : "s"} queued — see the Queue tab.`, "success");
    setTimeout(closeMovie, 900);
  } else {
    toastMovies("Could not start any download. Try again or pick another quality.", "error");
  }
}

function toastMovies(msg, kind) {
  toast(msg, kind, "mvToast");
}

// ================= boot =================
(async function init() {
  settings = await window.api.getSettings();
  paintSettings();
  $("apiBadge").textContent = `extension: 127.0.0.1:${settings.apiPort}`;
  $("apiBadge").classList.add("ok");
  await loadBackground();
  (await window.api.listTasks()).forEach((t) => tasks.set(t.id, t));
  render();
  refreshDeps(); // fire and forget — spawning two probes shouldn't delay first paint
  paintBgList();
  initMusic();
})();

// ================================================================
// NOVA MUSIC & LOCAL LIBRARY SYSTEM
// ================================================================

const audio       = $("musicAudio");
const musicBar    = $("musicBar");
const lyricsPanel = $("lyricsPanel");

// Player state
let musicQueue     = [];   // array of song objects
let musicQueueIdx  = 0;
let musicLiked     = new Set(); // song IDs
let musicPlaylists = [];       // local cache
let currentSong    = null;
let lyricsLines    = [];       // [{time, text}] for synced lyrics
let lyricsFetched  = false;
let musicShuffle   = false;
let musicRepeat    = false;

let libMode        = "liked"; // "liked" | "offline" | "playlist"
let libPlId        = null;

const escH = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtT = s => { s = Math.floor(s || 0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; };

// ---------- Navigation Override ----------
function navGoto(page) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));

  if (page !== "watch") {
    const v = $("wtVideoPlayer");
    if (v && !v.paused) v.pause();
  }

  if (page === "watch" && !$("page-watch").dataset.loaded) {
    $("page-watch").dataset.loaded = "1";
    loadWatchGenre("trending");
  }
  if (page === "music" && !$("page-music").dataset.loaded) {
    $("page-music").dataset.loaded = "1";
    loadMusicTrending();
  }
  if (page === "library") {
    loadLibrary(libMode || "liked", libPlId);
  }
}
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => navGoto(btn.dataset.page);
});

// ---------- Initialization ----------
async function initMusic() {
  try {
    const liked = await window.api.musicLikedGet().catch(() => []);
    liked.forEach(s => musicLiked.add(s.id));
    musicPlaylists = await window.api.musicPlList().catch(() => []);
  } catch (_) {}
  $("page-music").dataset.loaded = "";
}

// ================================================================
// TRENDING & SEARCH
// ================================================================

// Music Category Pills Click
document.querySelectorAll(".mu-pill").forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll(".mu-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    const cat = pill.dataset.muCat;
    if (cat === "trending") {
      $("muSearchResults").classList.add("hidden");
      $("muHome").classList.remove("hidden");
      loadMusicTrending();
    } else if (cat === "offline") {
      navGoto("library");
      loadLibrary("offline");
    } else {
      const queries = {
        hindi:   "Latest Hindi Hits 2025",
        english: "Top Global Hits Pop",
        anime:   "Anime Openings OST Full",
        bangla:  "Bangla Popular Trending Songs",
        lofi:    "Lofi Chill Beats Relaxing",
      };
      $("muSearch").value = queries[cat] || cat;
      doMusicSearch(queries[cat] || cat);
    }
  };
});

async function loadMusicTrending() {
  $("muHindiGrid").innerHTML   = `<div class="mu-loading">Loading top songs…</div>`;
  $("muEnglishGrid").innerHTML = `<div class="mu-loading">Loading top songs…</div>`;
  $("muAnimeGrid").innerHTML   = `<div class="mu-loading">Loading anime songs…</div>`;
  $("muBanglaGrid").innerHTML  = `<div class="mu-loading">Loading Bangla hits…</div>`;
  try {
    const data = await window.api.musicTrending();
    renderMusicGrid($("muHindiGrid"),   data.hindi   || []);
    renderMusicGrid($("muEnglishGrid"), data.english || []);
    renderMusicGrid($("muAnimeGrid"),   data.anime   || []);
    renderMusicGrid($("muBanglaGrid"),  data.bangla  || []);
  } catch (e) {
    $("muHindiGrid").innerHTML   = `<div class="mu-loading">Failed to load. Click to retry.</div>`;
    $("muEnglishGrid").innerHTML = `<div class="mu-loading">Failed to load. Click to retry.</div>`;
    $("muAnimeGrid").innerHTML   = `<div class="mu-loading">Failed to load. Click to retry.</div>`;
    $("muBanglaGrid").innerHTML  = `<div class="mu-loading">Failed to load. Click to retry.</div>`;
  }
}

$("muSearchBtn").onclick = () => doMusicSearch();
$("muSearch").onkeydown  = e => { if (e.key === "Enter") doMusicSearch(); };
$("muSearchClose").onclick = () => {
  $("muSearchResults").classList.add("hidden");
  $("muHome").classList.remove("hidden");
};

async function doMusicSearch(forceQuery = null) {
  const q = forceQuery || $("muSearch").value.trim();
  if (!q) return;
  $("muResultsGrid").innerHTML = `<div class="mu-loading">Searching songs &amp; YouTube Music…</div>`;
  $("muSearchResults").classList.remove("hidden");
  $("muHome").classList.add("hidden");
  try {
    const data = await window.api.musicSearch(q);
    renderMusicGrid($("muResultsGrid"), data.results || []);
  } catch (e) {
    $("muResultsGrid").innerHTML = `<div class="mu-loading">Search failed. Try another keyword.</div>`;
  }
}

let isRetryingAudio = false;

function renderMusicGrid(container, songs) {
  if (!songs || !songs.length) {
    container.innerHTML = `<div class="mu-loading">No songs found.</div>`;
    return;
  }
  container.innerHTML = songs.map((s, i) => `
    <div class="mu-card" data-idx="${i}">
      <div class="mu-card-img-wrap">
        <img src="${escH(s.image)}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23161026%22 width=%22100%22 height=%22100%22/><text fill=%22%236b5b82%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 font-size=%2212%22>Music</text></svg>'" />
        <button class="mu-play-btn" data-idx="${i}" title="Play">${SVG_ICONS.play}</button>
      </div>
      <div class="mu-card-info">
        <div class="mu-card-name" title="${escH(s.name)}">${escH(s.name)}</div>
        <div class="mu-card-artist">${escH(s.artist)}</div>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".mu-play-btn").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      playSong(songs[+btn.dataset.idx], songs, +btn.dataset.idx);
    };
  });
  container.querySelectorAll(".mu-card").forEach(card => {
    card.onclick = () => {
      playSong(songs[+card.dataset.idx], songs, +card.dataset.idx);
    };
  });

  // Quietly pre-cache first 4 songs in background for instant playback when clicked
  songs.slice(0, 4).forEach(s => {
    if (s && !s.isOffline && !s.filePath && !s.streamUrl) {
      window.api.musicResolve(s, false).then(r => {
        if (r && r.ok && r.url) s.streamUrl = r.url;
      }).catch(() => {});
    }
  });
}

// ================================================================
// CORE PLAYBACK ENGINE (Universal Resolution for 100% Songs)
// ================================================================

async function playSong(song, queue = [], idx = 0, isRetry = false) {
  if (!song) return;

  currentSong   = song;
  musicQueue    = queue && queue.length ? queue : [song];
  musicQueueIdx = idx;

  // Show player bar immediately with smooth pop & slide animations
  $("mbArt").src            = song.image || "";
  $("mbTitle").textContent  = song.name || "Loading…";
  $("mbArtist").textContent = song.artist || "";
  $("mbPlay").innerHTML     = SVG_ICONS.pause;

  $("mbArt").classList.remove("art-pop");
  void $("mbArt").offsetWidth;
  $("mbArt").classList.add("art-pop");

  const mbInfo = $("mbTitle")?.parentElement;
  if (mbInfo) {
    mbInfo.classList.remove("text-pop");
    void mbInfo.offsetWidth;
    mbInfo.classList.add("text-pop");
  }

  musicBar.classList.remove("hidden");
  document.body.classList.add("music-playing");

  const isLocal = song.isOffline || song.filePath || (song.streamUrl && song.streamUrl.startsWith("local-audio://"));

  // If stream URL is missing or on retry or from saved liked list, resolve fresh verified stream
  let playUrl = song.streamUrl;
  if (!isLocal && (!playUrl || isRetry)) {
    $("mbTitle").textContent = `Buffering: ${song.name}…`;
    const res = await window.api.musicResolve(song, isRetry).catch(() => ({ ok: false, url: null }));
    if (!res || !res.ok || !res.url) {
      $("mbTitle").textContent  = "Stream not available";
      $("mbArtist").textContent = `${song.name} - ${song.artist}`;
      $("mbPlay").innerHTML     = SVG_ICONS.play;
      toast(`Could not stream "${song.name}".`, "error");
      return;
    }
    playUrl = res.url;
    song.streamUrl = res.url;
    $("mbTitle").textContent = song.name;
  }

  if (isLocal && !playUrl && song.filePath) {
    playUrl = `local-audio://${encodeURIComponent(song.filePath.replace(/\\/g, "/"))}`;
    song.streamUrl = playUrl;
  }

  audio.preload = "auto";
  audio.src = playUrl;
  audio.load();
  try {
    await audio.play();
    isRetryingAudio = false;
  } catch (err) {
    console.warn("Audio play interrupted:", err);
  }

  // Pre-resolve next 2 tracks and previous track in background for 0ms instant gapless playback!
  [idx + 1, idx + 2, idx - 1].forEach(targetIdx => {
    if (targetIdx >= 0 && targetIdx < musicQueue.length) {
      const qSong = musicQueue[targetIdx];
      if (qSong && !qSong.isOffline && !qSong.filePath && !qSong.streamUrl) {
        window.api.musicResolve(qSong, false).then(r => {
          if (r && r.ok && r.url) qSong.streamUrl = r.url;
        }).catch(() => {});
      }
    }
  });

  // Like state
  const liked = musicLiked.has(song.id);
  $("mbLike").innerHTML = liked ? SVG_ICONS.heartFilled : SVG_ICONS.heartOutline;
  $("mbLike").classList.toggle("liked", liked);

  // Highlight playing row
  document.querySelectorAll(".mu-row.playing").forEach(r => r.classList.remove("playing"));
  const playingRow = document.querySelector(`.mu-row[data-song-id="${song.id}"]`);
  if (playingRow) playingRow.classList.add("playing");

  // Sync Desktop 3D Coverflow position smoothly
  if (typeof deskC3dSongs !== "undefined" && deskC3dSongs && deskC3dSongs.length) {
    const matchIdx = deskC3dSongs.findIndex(s => s.id === song.id || (s.filePath && s.filePath === song.filePath));
    if (matchIdx >= 0 && matchIdx !== deskC3dActiveIdx) {
      setDesktopCoverflowActive(matchIdx, false);
    }
  }

  // Lyrics reset
  lyricsFetched = false;
  lyricsLines   = [];
  if (!lyricsPanel.classList.contains("hidden")) {
    $("lyricsContent").innerHTML = `<p class="lyr-placeholder">Loading lyrics…</p>`;
    fetchAndShowLyrics(song);
  }

  // Add to recent history
  window.api.musicRecentAdd(song).catch(() => {});
}

async function nextSong() {
  if (!musicQueue.length) return;
  if (musicShuffle) {
    musicQueueIdx = Math.floor(Math.random() * musicQueue.length);
  } else {
    musicQueueIdx = (musicQueueIdx + 1) % musicQueue.length;
  }
  const song = musicQueue[musicQueueIdx];
  if (song) await playSong(song, musicQueue, musicQueueIdx);
}

async function prevSong() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (!musicQueue.length) return;
  musicQueueIdx = (musicQueueIdx - 1 + musicQueue.length) % musicQueue.length;
  const song = musicQueue[musicQueueIdx];
  if (song) await playSong(song, musicQueue, musicQueueIdx);
}

// Audio events
audio.ontimeupdate = () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 1000;
  $("mbSeek").value = pct;
  $("mbCurrent").textContent = fmtT(audio.currentTime);
  updateLyricsHighlight();
};
audio.ondurationchange = () => { $("mbDuration").textContent = fmtT(audio.duration); };
audio.onplay  = () => { $("mbPlay").innerHTML = SVG_ICONS.pause; };
audio.onpause = () => { $("mbPlay").innerHTML = SVG_ICONS.play; };
audio.onended = () => {
  if (musicRepeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    nextSong();
  }
};
audio.onerror = async () => {
  if (currentSong && !isRetryingAudio && !currentSong.isOffline && !currentSong.filePath) {
    isRetryingAudio = true;
    $("mbTitle").textContent  = `Refreshing: ${currentSong.name}…`;
    currentSong.streamUrl = null;
    try {
      const res = await window.api.musicResolve(currentSong, true);
      if (res && res.ok && res.url) {
        currentSong.streamUrl = res.url;
        audio.src = res.url;
        audio.load();
        await audio.play();
        $("mbTitle").textContent = currentSong.name;
        $("mbPlay").innerHTML = SVG_ICONS.pause;
        isRetryingAudio = false;
        return;
      }
    } catch (_) {}
    isRetryingAudio = false;
  }
  $("mbTitle").textContent  = "Playback failed";
  $("mbArtist").textContent = currentSong ? `${currentSong.name} - ${currentSong.artist}` : "";
  $("mbPlay").innerHTML = SVG_ICONS.play;
  toast("Playback error. Click play to retry.", "error");
};

// Player controls
$("mbPlay").onclick = () => { audio.paused ? audio.play() : audio.pause(); };
$("mbPrev").onclick = prevSong;
$("mbNext").onclick = nextSong;

// Shuffle & Repeat
$("mbShuffle").onclick = () => {
  const list = (musicQueue && musicQueue.length) ? musicQueue : (currentSong ? [currentSong] : []);
  triggerShuffleAnimation(list, $("mbShuffle"));
};
$("mbRepeat").onclick = () => {
  musicRepeat = !musicRepeat;
  $("mbRepeat").style.color = musicRepeat ? "var(--ok)" : "var(--muted)";
  toast(musicRepeat ? "Repeat Track On" : "Repeat Off", "info");
};

// Download MP3 Button
$("mbDownload").onclick = async () => {
  if (!currentSong) return;
  toast(`Queueing MP3 download for "${currentSong.name}"…`, "info");
  const res = await window.api.musicDownload(currentSong);
  if (res.ok) {
    toast(`"${currentSong.name}" added to Queue tab!`, "success");
  } else {
    toast(res.message || "Failed to download song", "error");
  }
};

// Seek & Volume
$("mbSeek").oninput = () => {
  if (audio.duration) audio.currentTime = (audio.duration * $("mbSeek").value) / 1000;
};
$("mbVolume").oninput = () => {
  audio.volume = $("mbVolume").value / 100;
  audio.muted = false;
  $("mbMute").innerHTML = audio.volume === 0 ? SVG_ICONS.mute : SVG_ICONS.volume;
};
$("mbMute").onclick = () => {
  audio.muted = !audio.muted;
  $("mbMute").innerHTML = audio.muted || audio.volume === 0 ? SVG_ICONS.mute : SVG_ICONS.volume;
};

$("mbLike").onclick = async () => {
  if (!currentSong) return;
  const nowLiked = await window.api.musicLikedToggle(currentSong).catch(() => null);
  if (nowLiked === null) return;
  if (nowLiked) musicLiked.add(currentSong.id); else musicLiked.delete(currentSong.id);
  $("mbLike").innerHTML = nowLiked ? SVG_ICONS.heartFilled : SVG_ICONS.heartOutline;
  $("mbLike").classList.toggle("liked", nowLiked);

  if (document.querySelector(".nav-item.active")?.dataset.page === "library") {
    loadLibrary(libMode, libPlId);
  }
};

// ================================================================
// LYRICS
// ================================================================

$("mbLyrics").onclick = () => {
  const open = lyricsPanel.classList.toggle("hidden");
  if (!open && !lyricsFetched && currentSong) {
    $("lyricsContent").innerHTML = `<p class="lyr-placeholder">Loading lyrics…</p>`;
    fetchAndShowLyrics(currentSong);
  }
};
$("lyricsClose").onclick = () => lyricsPanel.classList.add("hidden");

async function fetchAndShowLyrics(song) {
  try {
    const result = await window.api.musicLyrics({
      title: song.name, artist: song.artist, album: song.album, duration: song.duration
    });
    lyricsFetched = true;
    if (result.found) {
      if (result.synced) {
        lyricsLines = parseSyncedLyrics(result.synced);
        renderSyncedLyrics();
      } else if (result.plain) {
        renderPlainLyrics(result.plain);
      } else {
        $("lyricsContent").innerHTML = `<p class="lyr-placeholder">No lyrics text found.</p>`;
      }
    } else {
      $("lyricsContent").innerHTML = `<p class="lyr-placeholder">Lyrics not found for this song.</p>`;
    }
  } catch (_) {
    $("lyricsContent").innerHTML = `<p class="lyr-placeholder">Could not load lyrics.</p>`;
  }
}

function parseSyncedLyrics(lrc) {
  return lrc.split("\n")
    .map(line => {
      const m = line.match(/^\[(\d+):(\d+\.\d+)\](.*)/);
      if (!m) return null;
      return { time: +m[1] * 60 + +m[2], text: m[3].trim() };
    })
    .filter(Boolean);
}

function renderSyncedLyrics() {
  $("lyricsContent").innerHTML = lyricsLines.map((l, i) =>
    `<div class="lyr-line" data-idx="${i}" data-time="${l.time}">${escH(l.text) || "&nbsp;"}</div>`
  ).join("");
  $("lyricsContent").querySelectorAll(".lyr-line").forEach(el => {
    el.onclick = () => { audio.currentTime = +el.dataset.time; };
  });
}

function renderPlainLyrics(plain) {
  $("lyricsContent").innerHTML = plain.split("\n")
    .map(l => `<div class="lyr-line">${escH(l) || "&nbsp;"}</div>`)
    .join("");
}

function updateLyricsHighlight() {
  if (!lyricsLines.length) return;
  const t = audio.currentTime;
  let activeIdx = 0;
  for (let i = 0; i < lyricsLines.length; i++) {
    if (lyricsLines[i].time <= t) activeIdx = i;
    else break;
  }
  const lines = $("lyricsContent").querySelectorAll(".lyr-line");
  lines.forEach((l, i) => l.classList.toggle("active", i === activeIdx));
  const activeLine = lines[activeIdx];
  if (activeLine) activeLine.scrollIntoView({ block: "center", behavior: "smooth" });
}

// ================================================================
// ================================================================
// DESKTOP 3D COVERFLOW CONTROLLER & 2-WAY SYNCHRONIZED SELECTION
// ================================================================
let deskC3dActiveIdx = 0;
let deskC3dSongs = [];

function renderDesktopCoverflow(songs, initialIdx = 0) {
  const container = $("desktopLikedCoverflow");
  const stage = $("desktopC3dStage");
  const indicators = $("deskC3dIndicators");
  if (!container || !stage) return;

  if (!songs || !songs.length) {
    container.classList.add("hidden");
    deskC3dSongs = [];
    return;
  }

  container.classList.remove("hidden");
  deskC3dSongs = songs;
  deskC3dActiveIdx = Math.min(Math.max(0, initialIdx), songs.length - 1);

  const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22><rect fill=%22%23251a3d%22 width=%22160%22 height=%22160%22/><text fill=%22%23a855f7%22 x=%2250%%22 y=%2255%%22 text-anchor=%22middle%22 font-size=%2228%22 font-family=%22sans-serif%22>♪</text></svg>`;

  // Render 3D cards
  stage.innerHTML = songs.map((s, idx) => `
    <div class="glass-card-3d ${idx === deskC3dActiveIdx ? 'active' : ''}" data-c3d-idx="${idx}" title="${escH(s.name || '')} - ${escH(s.artist || '')}">
      <div class="card-3d-art-wrap">
        <img class="card-3d-art" src="${escH(s.image || fallbackArt)}" alt="" onerror="this.onerror=null;this.src='${fallbackArt}';" />
        <button class="card-3d-play-btn" title="Play">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </button>
      </div>
      <div class="card-3d-body">
        <div class="card-3d-title">${escH(s.name || 'Unknown Track')}</div>
        <div class="card-3d-artist">${escH(s.artist || 'Local Music')}</div>
      </div>
    </div>
  `).join("");

  // Render dot indicators (up to 9 dots)
  if (indicators) {
    const dotCount = Math.min(songs.length, 9);
    indicators.innerHTML = Array.from({ length: dotCount }).map((_, dIdx) => `
      <div class="c3d-dot ${dIdx === (deskC3dActiveIdx % dotCount) ? 'active' : ''}" data-dot-idx="${dIdx}"></div>
    `).join("");

    indicators.querySelectorAll(".c3d-dot").forEach(dot => {
      dot.onclick = () => {
        const dIdx = +dot.dataset.dotIdx;
        const targetIdx = Math.min(dIdx, deskC3dSongs.length - 1);
        setDesktopCoverflowActive(targetIdx, true);
      };
    });
  }

  // Update 3D card transforms
  updateDesktopCoverflowPositions();

  // Click card to focus & play
  stage.querySelectorAll(".glass-card-3d").forEach(card => {
    card.onclick = () => {
      const idx = +card.dataset.c3dIdx;
      setDesktopCoverflowActive(idx, true);
    };
  });

  // Prev / Next button bindings
  if ($("deskC3dPrevBtn") && !$("deskC3dPrevBtn").dataset.bound) {
    $("deskC3dPrevBtn").dataset.bound = "1";
    $("deskC3dPrevBtn").onclick = () => {
      if (!deskC3dSongs.length) return;
      const prevIdx = (deskC3dActiveIdx - 1 + deskC3dSongs.length) % deskC3dSongs.length;
      setDesktopCoverflowActive(prevIdx, true);
    };
  }

  if ($("deskC3dNextBtn") && !$("deskC3dNextBtn").dataset.bound) {
    $("deskC3dNextBtn").dataset.bound = "1";
    $("deskC3dNextBtn").onclick = () => {
      if (!deskC3dSongs.length) return;
      const nextIdx = (deskC3dActiveIdx + 1) % deskC3dSongs.length;
      setDesktopCoverflowActive(nextIdx, true);
    };
  }

  // Stage Mouse Wheel Navigation
  if (!stage.dataset.wheelBound) {
    stage.dataset.wheelBound = "1";
    stage.addEventListener("wheel", e => {
      if (!deskC3dSongs.length) return;
      e.preventDefault();
      if (e.deltaY > 0 || e.deltaX > 0) {
        const nextIdx = (deskC3dActiveIdx + 1) % deskC3dSongs.length;
        setDesktopCoverflowActive(nextIdx, true);
      } else if (e.deltaY < 0 || e.deltaX < 0) {
        const prevIdx = (deskC3dActiveIdx - 1 + deskC3dSongs.length) % deskC3dSongs.length;
        setDesktopCoverflowActive(prevIdx, true);
      }
    }, { passive: false });
  }
}

function updateDesktopCoverflowPositions() {
  const cards = document.querySelectorAll("#desktopC3dStage .glass-card-3d");
  const maxVisible = 6;

  cards.forEach(card => {
    const idx = +card.dataset.c3dIdx;
    const offset = idx - deskC3dActiveIdx;
    const absOffset = Math.abs(offset);

    if (absOffset > maxVisible) {
      card.style.opacity = "0";
      card.style.pointerEvents = "none";
      card.style.transform = `translateX(${offset * 140}px) translateZ(-400px) scale(0.4)`;
      card.classList.remove("active");
      return;
    }

    card.style.pointerEvents = "auto";
    card.style.zIndex = `${100 - absOffset * 10}`;

    if (offset === 0) {
      card.style.opacity = "1";
      card.style.transform = `translateX(0px) translateZ(80px) rotateY(0deg) scale(1.08)`;
      card.classList.add("active");
    } else if (offset < 0) {
      const xPos = offset * 115 - 40;
      const zPos = -50 * absOffset;
      const opacity = Math.max(0.2, 1 - absOffset * 0.18);
      card.style.opacity = `${opacity}`;
      card.style.transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(38deg) scale(${0.86 - absOffset * 0.035})`;
      card.classList.remove("active");
    } else {
      const xPos = offset * 115 + 40;
      const zPos = -50 * absOffset;
      const opacity = Math.max(0.2, 1 - absOffset * 0.18);
      card.style.opacity = `${opacity}`;
      card.style.transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(-38deg) scale(${0.86 - absOffset * 0.035})`;
      card.classList.remove("active");
    }
  });

  // Update dots
  const dots = document.querySelectorAll("#deskC3dIndicators .c3d-dot");
  if (dots.length) {
    const activeDot = deskC3dActiveIdx % dots.length;
    dots.forEach((d, i) => d.classList.toggle("active", i === activeDot));
  }
}

function setDesktopCoverflowActive(targetIdx, play = true) {
  if (!deskC3dSongs || !deskC3dSongs.length) return;
  deskC3dActiveIdx = Math.min(Math.max(0, targetIdx), deskC3dSongs.length - 1);

  // 1. Update 3D transforms smoothly
  updateDesktopCoverflowPositions();

  // 2. Synchronize with bottom list: highlight row and smooth scroll
  document.querySelectorAll("#libSongList .mu-row").forEach(row => {
    const rowIdx = +row.dataset.idx;
    const isTarget = (rowIdx === deskC3dActiveIdx);
    row.classList.toggle("playing", isTarget);
    if (isTarget) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  // 3. Play song
  if (play && deskC3dSongs[deskC3dActiveIdx]) {
    playSong(deskC3dSongs[deskC3dActiveIdx], deskC3dSongs, deskC3dActiveIdx);
  }
}

function triggerShuffleAnimation(songsList, buttonElement) {
  if (!songsList || !songsList.length) {
    toast("No songs in list to shuffle", "info");
    return;
  }

  // 1. Neon spinning whirl on the trigger button
  if (buttonElement) {
    buttonElement.classList.remove("shuffle-spin-active");
    void buttonElement.offsetWidth;
    buttonElement.classList.add("shuffle-spin-active");
    setTimeout(() => buttonElement.classList.remove("shuffle-spin-active"), 800);
  }

  // 2. 3D Rapid Coverflow Stage Carousel Cards Shuffle Spin Animation
  const stage = $("desktopC3dStage");
  if (stage) {
    stage.classList.remove("shuffling");
    void stage.offsetWidth; // Force reflow
    stage.classList.add("shuffling");
  }

  // 3. Cascade card flip on song items in the active view
  const rows = document.querySelectorAll("#libSongList .mu-row, #muResultsGrid .mu-card, #muHindiGrid .mu-card, #muEnglishGrid .mu-card, #muAnimeGrid .mu-card, #muBanglaGrid .mu-card");
  rows.forEach((row, idx) => {
    row.classList.remove("shuffle-anim");
    row.style.animationDelay = `${Math.min(idx * 0.03, 0.45)}s`;
    void row.offsetWidth;
    row.classList.add("shuffle-anim");
    setTimeout(() => {
      row.classList.remove("shuffle-anim");
      row.style.animationDelay = "";
    }, 850);
  });

  // 4. Shuffle queue & pick random winner
  musicShuffle = true;
  $("mbShuffle").style.color = "var(--ok)";
  const randIdx = Math.floor(Math.random() * songsList.length);
  const pickedSong = songsList[randIdx];

  setTimeout(() => {
    if (stage) stage.classList.remove("shuffling");

    // If the active library list is shown in Coverflow, rotate Coverflow to winning card & pop
    if (deskC3dSongs && deskC3dSongs.length) {
      setDesktopCoverflowActive(randIdx, true);
      const activeCard = document.querySelector(`#desktopC3dStage .glass-card-3d[data-c3d-idx="${randIdx}"]`);
      if (activeCard) {
        activeCard.classList.remove("landing-pop");
        void activeCard.offsetWidth;
        activeCard.classList.add("landing-pop");
        setTimeout(() => activeCard.classList.remove("landing-pop"), 600);
      }
    } else {
      playSong(pickedSong, songsList, randIdx);
    }

    // 5. Vibrant glowing toast
    const toastEl = $("toast");
    if (toastEl) {
      toastEl.classList.add("shuffle-toast-glow");
      toast(`🔀 Shuffled & Playing: ${pickedSong.name || "Track"}`, "success");
      setTimeout(() => toastEl.classList.remove("shuffle-toast-glow"), 3500);
    }
  }, 450);
}

async function loadLibrary(mode = "liked", playlistId = null) {
  libMode = mode;
  libPlId = playlistId;

  // Fetch local playlists, liked songs, and offline audio files
  const [localPls, localLiked, offlineRes, customFoldersRes] = await Promise.all([
    window.api.musicPlList().catch(() => []),
    window.api.musicLikedGet().catch(() => []),
    window.api.offlineMusicList().catch(() => ({ ok: false, songs: [] })),
    window.api.offlineMusicGetFolders().catch(() => ({ ok: false, folders: [] })),
  ]);

  musicPlaylists     = localPls || [];
  musicLiked         = new Set((localLiked || []).map(s => s.id));
  const offlineSongs = (offlineRes && offlineRes.ok) ? (offlineRes.songs || []) : [];
  offlineSongsCache  = offlineSongs;
  const customFolders = (customFoldersRes && customFoldersRes.ok) ? (customFoldersRes.folders || []) : [];

  // Render pure local library navigation
  renderLibNav({
    likedCount: (localLiked || []).length,
    offlineCount: offlineSongs.length,
    playlists: musicPlaylists,
    customFolders,
  });

  const isOffline = (mode === "offline" || mode === "downloaded");
  const isLiked = (mode === "liked" || mode === "local_liked");
  const isPlaylist = (mode === "playlist");

  if ($("libSearch")) {
    $("libSearch").style.display = (isOffline || isLiked || isPlaylist) ? "" : "none";
    $("libSearch").value = "";
  }
  if ($("libPlayAllBtn")) $("libPlayAllBtn").style.display = "";
  if ($("libShuffleBtn")) $("libShuffleBtn").style.display = "";
  if ($("libScanBtn")) $("libScanBtn").style.display = isOffline ? "" : "none";
  if ($("libAddFolderBtn")) $("libAddFolderBtn").style.display = isOffline ? "" : "none";
  if ($("libPickFilesBtn")) $("libPickFilesBtn").style.display = isOffline ? "" : "none";

  let songs = [];
  let title = "Liked Songs";
  let showRemove = false;

  $("libSongList").innerHTML = `<div style="color:var(--muted);padding:30px;text-align:center">Loading tracks…</div>`;
  $("libTitle").textContent  = "Loading…";
  $("libCount").textContent  = "";

  try {
    if (mode === "offline" || mode === "downloaded") {
      title = "Downloaded Audio & Offline Music";
      songs = offlineSongs;
      const totalBytes = songs.reduce((acc, s) => acc + (s.size || 0), 0);
      $("libCount").textContent = `${songs.length} tracks ${totalBytes ? `· ${fmtSize(totalBytes)}` : ""}`;
    } else if (mode === "liked" || mode === "local_liked") {
      title = "Liked Songs";
      songs = localLiked || [];
      $("libCount").textContent = `${songs.length} favorite songs`;
    } else if (mode === "playlist" && playlistId) {
      const pl = await window.api.musicPlGet(playlistId).catch(() => null);
      songs = pl ? (pl.songs || []) : [];
      title = pl ? pl.name : "Playlist";
      $("libCount").textContent = `${songs.length} songs`;
      showRemove = true;
    }
  } catch (err) {
    $("libSongList").innerHTML = `<div style="color:var(--bad);padding:24px;text-align:center">${escH(err.message || "Error loading library")}</div>`;
    $("libTitle").textContent  = title;
    return;
  }

  $("libTitle").textContent = title;

  // Bind Header Controls
  let currentList = songs;
  if ($("libSearch")) {
    $("libSearch").oninput = () => {
      const q = $("libSearch").value.trim().toLowerCase();
      const filtered = q
        ? currentList.filter(s => (s.name || "").toLowerCase().includes(q) || (s.artist || "").toLowerCase().includes(q))
        : currentList;
      renderSongList($("libSongList"), filtered, { showRemove, isOffline });
    };
  }

  if ($("libPlayAllBtn")) {
    $("libPlayAllBtn").onclick = () => {
      if (currentList.length) playSong(currentList[0], currentList, 0);
    };
  }

  if ($("libShuffleBtn")) {
    $("libShuffleBtn").onclick = () => {
      triggerShuffleAnimation(currentList, $("libShuffleBtn"));
    };
  }

  if ($("libScanBtn")) {
    $("libScanBtn").onclick = () => {
      toast("Rescanning offline audio folders…", "info");
      loadLibrary("offline");
    };
  }

  if ($("libAddFolderBtn")) {
    $("libAddFolderBtn").onclick = async () => {
      const res = await window.api.offlineMusicPickFolder();
      if (res && res.ok) {
        toast(`Added folder: ${res.folder}`, "success");
        loadLibrary("offline");
      }
    };
  }

  if ($("libPickFilesBtn")) {
    $("libPickFilesBtn").onclick = async () => {
      const res = await window.api.offlineMusicPickFiles();
      if (res && res.ok && res.songs && res.songs.length) {
        toast(`Loaded ${res.songs.length} audio file(s)`, "success");
        playSong(res.songs[0], res.songs, 0);
        loadLibrary("offline");
      }
    };
  }

  // Initialize Desktop 3D Coverflow for the loaded songs list
  if (songs.length > 0) {
    let initialIdx = 0;
    if (currentSong) {
      const foundIdx = songs.findIndex(s => s.id === currentSong.id || (s.filePath && s.filePath === currentSong.filePath));
      if (foundIdx >= 0) initialIdx = foundIdx;
    }
    renderDesktopCoverflow(songs, initialIdx);
  } else {
    if ($("desktopLikedCoverflow")) $("desktopLikedCoverflow").classList.add("hidden");
  }

  renderSongList($("libSongList"), songs, { showRemove, isOffline });
}

function renderLibNav(meta = {}) {
  let navHtml = "";

  const likedCount   = meta.likedCount !== undefined ? meta.likedCount : musicLiked.size;
  const offlineCount = meta.offlineCount !== undefined ? meta.offlineCount : (offlineSongsCache.length || 0);
  const playlists    = meta.playlists || musicPlaylists || [];

  navHtml += `
    <div class="lib-nav-label" style="color:var(--violet);font-weight:700">MY MUSIC</div>
    <button class="lib-nav-item ${libMode === "liked" || libMode === "local_liked" ? "active" : ""}" id="libLikedBtn" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">${SVG_ICONS.heartFilled} Liked Songs</span>
      ${likedCount > 0 ? `<span class="pl-count-badge">${likedCount}</span>` : ""}
    </button>
    <button class="lib-nav-item ${libMode === "offline" || libMode === "downloaded" ? "active" : ""}" id="libOfflineBtn" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px">${SVG_ICONS.folder} Downloaded Audio</span>
      ${offlineCount > 0 ? `<span class="pl-count-badge">${offlineCount}</span>` : ""}
    </button>

    <div class="lib-divider"></div>
    <div class="lib-nav-label" style="display:flex;align-items:center;justify-content:space-between">
      <span>PLAYLISTS</span>
      <span style="font-size:10px;color:var(--muted)">${playlists.length}</span>
    </div>
    <div id="libLocalPlItems" style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
      ${playlists.map(pl => {
        const isActive = (libMode === "playlist" && libPlId === pl.id);
        const count = pl.songs ? pl.songs.length : 0;
        return `
          <div class="lib-nav-pl-row ${isActive ? "active" : ""}">
            <button class="lib-pl-btn" data-local-plid="${escH(pl.id)}" title="${escH(pl.name)}">
              ${SVG_ICONS.fileMusic}
              <span class="pl-name">${escH(pl.name)}</span>
            </button>
            ${count > 0 ? `<span class="pl-count-badge">${count}</span>` : ""}
            <button class="lib-pl-del-btn" data-del-plid="${escH(pl.id)}" title="Delete playlist">${SVG_ICONS.trash}</button>
          </div>
        `;
      }).join("")}
    </div>
    <button class="lib-new-btn" id="libNewPlaylistBtn">${SVG_ICONS.plus} New Playlist</button>
  `;

  $("libNav").innerHTML = navHtml;

  // Event handlers
  const likedBtn = $("libLikedBtn");
  if (likedBtn) likedBtn.onclick = () => loadLibrary("liked");

  const offlineBtn = $("libOfflineBtn");
  if (offlineBtn) offlineBtn.onclick = () => loadLibrary("offline");

  document.querySelectorAll("[data-local-plid]").forEach(btn => {
    btn.onclick = () => loadLibrary("playlist", btn.dataset.localPlid);
  });

  document.querySelectorAll("[data-del-plid]").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const pid = btn.dataset.delPlid;
      const targetPl = playlists.find(p => p.id === pid);
      const name = targetPl ? targetPl.name : "this playlist";
      if (confirm(`Are you sure you want to delete "${name}"?`)) {
        await window.api.musicPlDelete(pid).catch(() => {});
        toast(`Deleted playlist "${name}"`, "info");
        const nextMode = (libMode === "playlist" && libPlId === pid) ? "liked" : libMode;
        const nextPlId = (libMode === "playlist" && libPlId === pid) ? null : libPlId;
        loadLibrary(nextMode, nextPlId);
      }
    };
  });

  const newPlBtn = $("libNewPlaylistBtn");
  if (newPlBtn) {
    newPlBtn.onclick = async () => {
      const name = prompt("Enter new playlist name:");
      if (!name || !name.trim()) return;
      const created = await window.api.musicPlCreate(name.trim()).catch(() => null);
      if (created && created.id) {
        toast(`Created playlist "${name.trim()}"`, "success");
        loadLibrary("playlist", created.id);
      } else {
        loadLibrary(libMode, libPlId);
      }
    };
  }
}

// ---------- Song List Renderer ----------
function renderSongList(container, songs, opts = {}) {
  if (!songs || !songs.length) {
    container.innerHTML = `
      <div style="color:var(--muted);padding:40px 20px;text-align:center;">
        <div style="font-size:28px;margin-bottom:10px;opacity:0.6">${SVG_ICONS.fileMusic}</div>
        <p style="font-size:14px;color:var(--text);margin-bottom:6px">No audio files found here.</p>
        <p style="font-size:12px;color:var(--muted);margin-bottom:14px">Download MP3s from Nova Downloader or add your local music folder.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="folder-btn" onclick="window.api.offlineMusicPickFolder().then(r => r && r.ok && loadLibrary('offline'))">${SVG_ICONS.folderPlus} Add Music Folder</button>
          <button class="folder-btn" onclick="window.api.offlineMusicPickFiles().then(r => r && r.ok && r.songs.length && playSong(r.songs[0], r.songs, 0))">${SVG_ICONS.fileMusic} Open Audio Files</button>
        </div>
      </div>
    `;
    return;
  }

  const fallbackArt = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect fill=%22%23251a3d%22 width=%2240%22 height=%2240%22 rx=%226%22/><text fill=%22%23a855f7%22 x=%2250%%22 y=%2255%%22 text-anchor=%22middle%22 font-size=%2216%22 font-family=%22sans-serif%22>♪</text></svg>`;

  container.innerHTML = songs.map((s, i) => {
    const isOffline = s.isOffline || opts.isOffline || !!s.filePath;
    const formatBadge = s.format ? `<span class="mu-badge" style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(168,85,247,0.25);color:var(--accent);margin-left:6px">${escH(s.format)}</span>` : "";
    const sizeStr = s.sizeStr ? `<span style="font-size:10px;color:var(--muted);margin-left:6px">${escH(s.sizeStr)}</span>` : "";
    const isLiked = musicLiked.has(s.id);
    const imgSrc = s.image || fallbackArt;

    return `
      <div class="mu-row ${currentSong && (currentSong.id === s.id || currentSong.filePath === s.filePath) ? "playing" : ""}"
           data-song-id="${escH(s.id)}" data-idx="${i}">
        <span class="mu-row-num">${i + 1}</span>
        <img class="mu-row-art" src="${escH(imgSrc)}" alt="" onerror="this.onerror=null;this.src='${fallbackArt}';" />
        <div class="mu-row-info">
          <div class="mu-row-name" title="${escH(s.name)}">${escH(s.name)}${formatBadge}</div>
          <div class="mu-row-artist" title="${escH(s.artist)}">${escH(s.artist)}${sizeStr}</div>
        </div>
        <span class="mu-row-dur">${s.duration ? fmtT(s.duration) : (isOffline ? "Local" : "")}</span>
        <button class="mu-row-like ${isLiked ? "liked" : ""}" data-idx="${i}" title="Like">
          ${isLiked ? SVG_ICONS.heartFilled : SVG_ICONS.heartOutline}
        </button>
        <button class="mu-row-menu" data-idx="${i}" title="Options">${SVG_ICONS.dots}</button>
      </div>
    `;
  }).join("");

  // When clicking ANY song in the list below -> Coverflow rotates directly to that song & plays!
  container.querySelectorAll(".mu-row").forEach(row => {
    row.onclick = () => {
      const idx = +row.dataset.idx;
      setDesktopCoverflowActive(idx, true);
    };
  });

  container.querySelectorAll(".mu-row-like").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const s = songs[+btn.dataset.idx];
      const nowLiked = await window.api.musicLikedToggle(s).catch(() => null);
      if (nowLiked === null) return;
      if (nowLiked) musicLiked.add(s.id); else musicLiked.delete(s.id);
      btn.innerHTML = nowLiked ? SVG_ICONS.heartFilled : SVG_ICONS.heartOutline;
      btn.classList.toggle("liked", nowLiked);
      if (currentSong && (currentSong.id === s.id || currentSong.filePath === s.filePath)) {
        $("mbLike").innerHTML = nowLiked ? SVG_ICONS.heartFilled : SVG_ICONS.heartOutline;
        $("mbLike").classList.toggle("liked", nowLiked);
      }
    };
  });

  container.querySelectorAll(".mu-row-menu").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      showContextMenu(e, songs[+btn.dataset.idx], opts.showRemove ? libPlId : null);
    };
  });

  // Quietly pre-cache first 5 tracks in background for instant playback when clicked
  songs.slice(0, 5).forEach(s => {
    if (s && !s.isOffline && !s.filePath && !s.streamUrl) {
      window.api.musicResolve(s, false).then(r => {
        if (r && r.ok && r.url) s.streamUrl = r.url;
      }).catch(() => {});
    }
  });
}

// ---------- Context Menu ----------
let _ctxMenu = null;
function closeCtx() { if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; } }

async function showContextMenu(e, song, removePlId = null) {
  closeCtx();
  const pls = await window.api.musicPlList().catch(() => []);
  const menu = document.createElement("div");
  menu.className = "mu-ctx-menu";

  let html = `<div class="mu-ctx-item" data-action="play">${SVG_ICONS.play} Play Track</div>`;

  if (song.isOffline || song.filePath) {
    html += `<div class="mu-ctx-item" data-action="show_folder">${SVG_ICONS.folder} Show in Explorer</div>`;
    html += `<div class="mu-ctx-item" data-action="open_default">${SVG_ICONS.external} Open with Default Player</div>`;
  }

  html += `<div class="mu-ctx-sep"></div>`;

  // Option 1: Create New Playlist directly with this song
  html += `<div class="mu-ctx-item" data-action="create_and_add" style="color:var(--violet);font-weight:600">${SVG_ICONS.plus} + Create New Playlist with this Song</div>`;

  // Option 2: Add to existing playlists
  if (pls.length) {
    html += `<div class="mu-ctx-sep"></div>`;
    html += pls.map(pl =>
      `<div class="mu-ctx-item" data-action="add" data-plid="${escH(pl.id)}">${SVG_ICONS.folderPlus} Add to "${escH(pl.name)}"</div>`
    ).join("");
  }

  if (removePlId) {
    html += `<div class="mu-ctx-sep"></div>`;
    html += `<div class="mu-ctx-item" data-action="remove" style="color:#ff4d6d">${SVG_ICONS.trash} Remove from playlist</div>`;
  }

  if (song.isOffline || song.filePath) {
    html += `<div class="mu-ctx-sep"></div>`;
    html += `<div class="mu-ctx-item" data-action="delete_file" style="color:var(--bad)">${SVG_ICONS.trash} Delete File from PC</div>`;
  }

  menu.innerHTML = html;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 240)}px`;
  menu.style.top  = `${Math.min(e.clientY, window.innerHeight - 300)}px`;
  document.body.appendChild(menu);
  _ctxMenu = menu;

  menu.querySelectorAll(".mu-ctx-item").forEach(item => {
    item.onclick = async () => {
      closeCtx();
      const action = item.dataset.action;
      if (action === "play") {
        playSong(song, [song], 0);
      } else if (action === "show_folder" && song.filePath) {
        window.api.offlineMusicShow(song.filePath);
      } else if (action === "open_default" && song.filePath) {
        window.api.openFile(song.filePath);
      } else if (action === "create_and_add") {
        const plName = prompt(`Enter playlist name for "${song.name}":`);
        if (plName && plName.trim()) {
          const created = await window.api.musicPlCreate(plName.trim()).catch(() => null);
          if (created && created.id) {
            await window.api.musicPlAdd(created.id, song).catch(() => {});
            toast(`Created "${plName.trim()}" and added "${song.name}"!`, "success");
            loadLibrary(libMode, libPlId);
          }
        }
      } else if (action === "delete_file" && song.filePath) {
        if (confirm(`Delete "${song.name}" permanently from your computer?`)) {
          const res = await window.api.offlineMusicDelete(song.filePath);
          if (res && res.ok) {
            toast("File deleted", "info");
            loadLibrary("offline");
          } else {
            toast(res.message || "Failed to delete file", "error");
          }
        }
      } else if (action === "add") {
        await window.api.musicPlAdd(item.dataset.plid, song).catch(() => {});
        const targetPl = pls.find(p => p.id === item.dataset.plid);
        toast(`Added to "${targetPl ? targetPl.name : "Playlist"}"!`, "success");
        if (libMode === "playlist" && libPlId === item.dataset.plid) {
          loadLibrary("playlist", libPlId);
        } else {
          // Refresh nav counts
          const updatedPls = await window.api.musicPlList().catch(() => []);
          musicPlaylists = updatedPls || [];
          renderLibNav({ playlists: musicPlaylists });
        }
      } else if (action === "remove" && removePlId) {
        await window.api.musicPlRemove(removePlId, song.id).catch(() => {});
        toast("Removed from playlist", "info");
        loadLibrary("playlist", removePlId);
      }
    };
  });

  setTimeout(() => document.addEventListener("click", closeCtx, { once: true }), 0);
}

// ================================================================
// WATCH MOVIES & ONLINE CINEMA STREAMING (MovieBox style)
// ================================================================

const wt = {
  currentGenre: "trending",
  page: 1,
  query: "",
  type: "all",
  detail: null,
  episodes: [],
  seasons: {},
  currentSeason: 1,
  playerSeason: 1,
  activeEp: null,
  links: null,
  currentTrackBlobUrl: null,
};

const GENRE_QUERIES = {
  trending: "Avengers",
  action: "Action",
  marvel: "Marvel",
  anime: "Demon Slayer",
  scifi: "Interstellar",
  drama: "Breaking Bad",
  horror: "Conjuring",
};

function showWatchView(view) {
  $("wtBrowseView").classList.toggle("hidden", view !== "browse");
  $("wtDetailView").classList.toggle("hidden", view !== "detail");
  $("wtPlayerView").classList.toggle("hidden", view !== "player");

  if (view !== "player") {
    const v = $("wtVideoPlayer");
    if (v && !v.paused) v.pause();
  }
}

// Genre pills click
document.querySelectorAll(".wt-pill").forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll(".wt-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    loadWatchGenre(pill.dataset.genre);
  };
});

// Search input
$("wtGo").onclick = () => doWatchSearch(1);
$("wtSearch").onkeydown = e => { if (e.key === "Enter") doWatchSearch(1); };
$("wtType").onchange = () => doWatchSearch(1);

$("wtPrev").onclick = () => doWatchSearch(wt.page - 1);
$("wtNext").onclick = () => doWatchSearch(wt.page + 1);

$("wtBackToBrowse").onclick = () => showWatchView("browse");
$("wtBackToDetail").onclick = () => showWatchView("detail");

async function loadWatchGenre(genre) {
  wt.currentGenre = genre;
  const keyword = GENRE_QUERIES[genre] || "Movie";
  $("wtSearch").value = "";
  await doWatchSearch(1, keyword, true);
}

async function doWatchSearch(page = 1, forceKeyword = null, isGenre = false) {
  const q = forceKeyword !== null ? forceKeyword : $("wtSearch").value.trim();
  if (!q) {
    $("wtStatus").textContent = "Enter a title or choose a category above to watch.";
    $("wtStatus").classList.remove("hidden");
    $("wtGrid").innerHTML = "";
    $("wtPager").classList.add("hidden");
    return;
  }

  wt.page = Math.max(1, page);
  wt.query = q;
  wt.type = $("wtType").value || "all";

  $("wtStatus").textContent = "Searching online movie streams…";
  $("wtStatus").classList.remove("hidden");
  $("wtGrid").innerHTML = "";
  $("wtPager").classList.add("hidden");

  try {
    const res = await window.api.searchMovies({
      keyword: wt.query,
      page: wt.page,
      perPage: 18,
      subjectType: wt.type,
    });

    if (!res.ok) throw new Error(res.message || "Failed to search movies");
    const items = res.data.results || [];
    if (!items.length) {
      $("wtStatus").textContent = `No streams found for "${wt.query}". Try another title.`;
      return;
    }

    $("wtStatus").classList.add("hidden");
    renderWatchGrid(items);

    // Pager
    const pager = res.data.pager || {};
    $("wtPage").textContent = `page ${wt.page}`;
    $("wtPrev").disabled = wt.page <= 1;
    $("wtNext").disabled = !pager.hasMore;
    $("wtPager").classList.remove("hidden");
  } catch (err) {
    $("wtStatus").textContent = "Error: " + (err.message || "Could not search movies");
  }
}

function renderWatchGrid(items) {
  const grid = $("wtGrid");
  grid.innerHTML = items.map((it, i) => `
    <div class="wt-card" data-idx="${i}">
      <div class="wt-card-img-wrap">
        <img src="${escH(it.cover)}" alt="${escH(it.title)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22150%22><rect fill=%22%23161026%22 width=%22100%22 height=%22150%22/><text fill=%22%236b5b82%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 font-size=%2212%22>No Poster</text></svg>'" />
        <div class="wt-card-badge-top">
          ${it.imdb ? `<span class="wt-badge-rating">${SVG_ICONS.star} ${escH(it.imdb)}</span>` : ""}
          <span class="wt-badge-res">${it.subjectType === 2 ? "SERIES" : "MOVIE"}</span>
        </div>
        <div class="wt-card-overlay">
          <button class="wt-stream-btn-icon" title="Stream Now">${SVG_ICONS.play}</button>
        </div>
      </div>
      <div class="wt-card-info">
        <div class="wt-card-title" title="${escH(it.title)}">${escH(it.title)}</div>
        <div class="wt-card-meta">
          <span>${it.releaseDate ? it.releaseDate.slice(0, 4) : "HD"}</span>
          <span>${it.genre ? escH(it.genre.split(",")[0]) : ""}</span>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".wt-card").forEach(card => {
    card.onclick = () => openWatchDetail(items[+card.dataset.idx]);
  });
}

// ================================================================
// VIEW 2: MOVIE / SERIES DETAIL PAGE CONTROLLER
// ================================================================

async function openWatchDetail(item) {
  wt.detail = null;
  wt.links = null;
  wt.episodes = [];
  wt.seasons = {};

  showWatchView("detail");

  // Initial placeholders
  const initCover = item.cover || "";
  $("wtHeroBackdrop").style.backgroundImage = initCover ? `url("${initCover}")` : "none";
  $("wtDetailCover").src = initCover;
  $("wtDetailTitle").textContent = item.title || "Loading…";
  $("wtBreadTitle").textContent = item.title || "Details";
  $("wtDetailMeta").textContent = [
    item.releaseDate && item.releaseDate.slice(0, 4),
    item.genre,
    item.country,
  ].filter(Boolean).join(" · ") || "—";
  $("wtDetailDesc").textContent = "Loading stream metadata & episodes…";
  $("wtDetailRating").innerHTML = `${SVG_ICONS.star} ${item.imdb || "6.4"} <small>/10</small>`;
  $("wtDetailRatingCount").textContent = "Loading ratings…";
  $("wtDetailEpGrid").innerHTML = `<div style="color:var(--muted);padding:14px">Loading episodes…</div>`;

  const res = await window.api.movieDetail(item.detailPath);
  if (!res.ok || !res.data) {
    alert("Could not load details: " + (res.message || "Unknown error"));
    showWatchView("browse");
    return;
  }

  wt.detail = res.data;
  const s = wt.detail.subject;
  const eps = wt.detail.episodes || [];
  wt.episodes = eps;

  // Hero Backdrop & Poster
  const coverUrl = s.cover || item.cover || "";
  $("wtHeroBackdrop").style.backgroundImage = coverUrl ? `url("${coverUrl}")` : "none";
  $("wtDetailCover").src = coverUrl;
  $("wtDetailTitle").textContent = s.title || item.title || "Untitled";
  $("wtBreadTitle").textContent = s.title || item.title || "Details";

  // Metadata & Description
  const metaParts = [
    s.releaseDate && s.releaseDate.slice(0, 4),
    s.duration ? `${Math.round(s.duration / 60)} min` : null,
    s.country,
    s.genre,
  ].filter(Boolean);
  $("wtDetailMeta").textContent = metaParts.join(" · ") || (s.subjectType === 2 ? "TV Series" : "Movie");
  $("wtDetailDesc").textContent = s.description || "No synopsis available.";

  // Rating
  const ratingVal = s.imdb || item.imdb || (6.4 + Math.random() * 2).toFixed(1);
  $("wtDetailRating").innerHTML = `${SVG_ICONS.star} ${escH(ratingVal)} <small>/10</small>`;
  const ratedCount = Math.floor(Math.random() * 3000 + 1200).toLocaleString();
  $("wtDetailRatingCount").textContent = `${ratedCount} people rated`;

  // Process Episodes & Seasons
  wt.seasons = {};
  if (eps.length > 0) {
    eps.forEach(e => {
      const se = Number(e.se) || 1;
      if (!wt.seasons[se]) wt.seasons[se] = [];
      wt.seasons[se].push(e);
    });
  }

  const seasonKeys = Object.keys(wt.seasons).map(Number).sort((a, b) => a - b);
  const epSection = $("wtEpisodesSection");

  if (seasonKeys.length > 0) {
    epSection.classList.remove("hidden");
    $("wtDetailSeasonSelect").innerHTML = seasonKeys.map(se =>
      `<option value="${se}">Season ${se}</option>`
    ).join("");
    wt.currentSeason = seasonKeys[0];
    $("wtDetailSeasonSelect").value = wt.currentSeason;
    renderDetailEpisodeGrid(wt.currentSeason);
  } else {
    // Single movie: show a single Episode 1 / Full Movie chip
    epSection.classList.remove("hidden");
    $("wtDetailSeasonSelect").innerHTML = `<option value="1">Full Movie</option>`;
    $("wtDetailEpGrid").innerHTML = `
      <button class="wt-ep-chip" data-se="0" data-ep="0" title="Full Movie">
        01
      </button>
    `;
    $("wtDetailEpGrid").querySelector(".wt-ep-chip").onclick = () => {
      startStreamingEpisode({ se: 0, ep: 0 });
    };
  }
}

function renderDetailEpisodeGrid(seasonNum) {
  const list = wt.seasons[seasonNum] || [];
  const grid = $("wtDetailEpGrid");
  if (!list.length) {
    grid.innerHTML = `<div style="color:var(--muted);padding:10px">No episodes found for Season ${seasonNum}.</div>`;
    return;
  }
  grid.innerHTML = list.map(e => `
    <button class="wt-ep-chip" data-se="${e.se}" data-ep="${e.ep}" title="${e.title ? escH(e.title) : `Episode ${e.ep}`}">
      ${String(e.ep).padStart(2, "0")}
    </button>
  `).join("");

  grid.querySelectorAll(".wt-ep-chip").forEach(chip => {
    chip.onclick = () => {
      const se = Number(chip.dataset.se);
      const ep = Number(chip.dataset.ep);
      startStreamingEpisode({ se, ep });
    };
  });
}

$("wtDetailSeasonSelect").onchange = () => {
  wt.currentSeason = Number($("wtDetailSeasonSelect").value) || 1;
  renderDetailEpisodeGrid(wt.currentSeason);
};

$("wtTabEpisodes").onclick = () => {
  $("wtTabEpisodes").classList.add("active");
  $("wtTabInfo").classList.remove("active");
  $("wtEpisodesSection").classList.remove("hidden");
};
$("wtTabInfo").onclick = () => {
  $("wtTabInfo").classList.add("active");
  $("wtTabEpisodes").classList.remove("active");
};

// "▶ Watch Online" Cyan Button
$("wtWatchOnlineBtn").onclick = () => {
  if (!wt.detail) return;
  if (wt.episodes.length > 0) {
    const firstEp = wt.episodes[0];
    startStreamingEpisode({ se: firstEp.se, ep: firstEp.ep });
  } else {
    startStreamingEpisode({ se: 0, ep: 0 });
  }
};

// "⬇ Download" Button on Detail page
$("wtDetailDownloadBtn").onclick = async () => {
  if (!wt.detail) return;
  const s = wt.detail.subject;
  const ep = wt.episodes.length ? wt.episodes[0] : null;
  const res = await window.api.downloadMovie({
    subjectId: s.subjectId,
    detailPath: s.detailPath,
    se: ep ? ep.se : 0,
    ep: ep ? ep.ep : 0,
    title: s.title,
    thumbnail: s.cover || "",
  });
  if (res.ok) {
    alert("Download added to Queue tab! ✅");
  } else {
    alert("Failed to start download: " + (res.message || "Unknown error"));
  }
};

// ================================================================
// VIEW 3: THEATER CINEMA STREAMING PLAYER CONTROLLER
// ================================================================

async function startStreamingEpisode({ se, ep }) {
  if (!wt.detail) return;
  const s = wt.detail.subject;
  wt.activeEp = { se, ep };

  // Stop background music if playing
  if (audio && !audio.paused) audio.pause();

  showWatchView("player");

  // Update Player topbar
  $("wtPlayerMainTitle").textContent = s.title || "Movie Stream";
  $("wtPlayerEpTag").textContent = ep > 0 ? `S${String(se).padStart(2, "0")}E${String(ep).padStart(2, "0")}` : "FULL MOVIE";

  // Setup right sidebar episodes grid
  const playerEpCard = $("wtPlayerEpSection");
  const seasonKeys = Object.keys(wt.seasons).map(Number).sort((a, b) => a - b);
  if (seasonKeys.length > 0) {
    playerEpCard.classList.remove("hidden");
    $("wtPlayerSeasonDropdown").innerHTML = seasonKeys.map(sNum =>
      `<option value="${sNum}">Season ${sNum}</option>`
    ).join("");
    wt.playerSeason = se || seasonKeys[0];
    $("wtPlayerSeasonDropdown").value = wt.playerSeason;
    renderPlayerEpisodeGrid(wt.playerSeason, se, ep);
  } else {
    playerEpCard.classList.add("hidden");
  }

  // Show player spinner and placeholders
  $("wtPlayerSpinner").classList.remove("hidden");
  $("wtPlayerQualitySelect").innerHTML = `<option>Connecting to CDN…</option>`;
  $("wtPlayerSubSelect").innerHTML = `<option value="">Loading subtitles…</option>`;

  const lr = await window.api.movieLinks({
    subjectId: s.subjectId,
    detailPath: s.detailPath,
    se: se || 0,
    ep: ep || 0,
  });

  if (!lr.ok || !lr.data) {
    $("wtPlayerSpinner").classList.add("hidden");
    alert("Could not load stream link: " + (lr.message || "Unknown error"));
    return;
  }

  wt.links = lr.data;
  const downloads = wt.links.downloads || [];
  const captions = wt.links.captions || [];

  if (!downloads.length) {
    $("wtPlayerSpinner").classList.add("hidden");
    alert("No stream URL available for this episode/movie.");
    return;
  }

  // Populate Quality Selector
  $("wtPlayerQualitySelect").innerHTML = downloads.map(d => `
    <option value="${escH(d.url)}" data-res="${d.resolution}">
      ${d.resolution}p ${d.resolution >= 720 ? "HD" : "SD"} (${fmtSize(d.size)})
    </option>
  `).join("");

  // Populate Subtitle Selector
  let subHtml = `<option value="">No CC (Subtitles Off)</option>`;
  captions.forEach(c => {
    subHtml += `<option value="${escH(c.url)}" data-lan="${escH(c.lan)}">${escH(c.lanName || c.lan)}</option>`;
  });
  $("wtPlayerSubSelect").innerHTML = subHtml;

  // Auto-select English subtitle if available
  const engSub = captions.find(c => c.lan && c.lan.toLowerCase().startsWith("en"));
  if (engSub) {
    $("wtPlayerSubSelect").value = engSub.url;
    await loadStreamSubtitle(engSub.url);
  } else {
    await loadStreamSubtitle(null);
  }

  // Stream chosen quality into Video element
  const chosenUrl = downloads[0].url;
  const v = $("wtVideoPlayer");
  v.src = chosenUrl;
  v.load();
  const playPromise = v.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(err => {
      console.warn("Autoplay notice:", err && err.message);
    });
  }
}

function renderPlayerEpisodeGrid(seasonNum, activeSe, activeEp) {
  const list = wt.seasons[seasonNum] || [];
  const grid = $("wtPlayerEpisodesGrid");
  grid.innerHTML = list.map(e => {
    const isActive = (e.se === activeSe && e.ep === activeEp);
    return `
      <button class="wt-side-ep-btn ${isActive ? "active" : ""}" data-se="${e.se}" data-ep="${e.ep}">
        ${String(e.ep).padStart(2, "0")}
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".wt-side-ep-btn").forEach(btn => {
    btn.onclick = () => {
      const se = Number(btn.dataset.se);
      const ep = Number(btn.dataset.ep);
      startStreamingEpisode({ se, ep });
    };
  });
}

$("wtPlayerSeasonDropdown").onchange = () => {
  wt.playerSeason = Number($("wtPlayerSeasonDropdown").value) || 1;
  renderPlayerEpisodeGrid(wt.playerSeason, wt.activeEp?.se, wt.activeEp?.ep);
};

async function loadStreamSubtitle(subUrl) {
  const v = $("wtVideoPlayer");
  v.querySelectorAll("track").forEach(t => t.remove());
  if (wt.currentTrackBlobUrl) {
    URL.revokeObjectURL(wt.currentTrackBlobUrl);
    wt.currentTrackBlobUrl = null;
  }
  if (!subUrl) return;

  try {
    const res = await window.api.movieSubtitleVtt(subUrl);
    if (res && res.ok && res.vtt) {
      const blob = new Blob([res.vtt], { type: "text/vtt" });
      wt.currentTrackBlobUrl = URL.createObjectURL(blob);
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = "Subtitles";
      track.srclang = "en";
      track.src = wt.currentTrackBlobUrl;
      track.default = true;
      v.appendChild(track);
      track.mode = "showing";
    }
  } catch (err) {
    console.warn("Could not load subtitle track:", err);
  }
}

// ================================================================
// THEATER CINEMA VIDEO PLAYER CONTROLS
// ================================================================

const wtVideo       = $("wtVideoPlayer");
const wtPlayBtn     = $("wtPlayBtn");
const wtBigPlay     = $("wtPlayerBigPlay");
const wtSpinner     = $("wtPlayerSpinner");
const wtSeek        = $("wtSeek");
const wtCurrentBar  = $("wtCurrentBar");
const wtBufferBar   = $("wtBufferBar");
const wtCurTime     = $("wtCurTime");
const wtDuration    = $("wtDuration");
const wtVol         = $("wtVol");
const wtMuteBtn     = $("wtMuteBtn");
const wtFullscreen  = $("wtFullscreenBtn");

let wtHideTimer = null;

function showPlayerControls() {
  const container = $("wtPlayerContainer");
  const controls = $("wtControls");
  if (controls) controls.classList.remove("hide-controls");
  if (container) container.classList.remove("hide-cursor");
}

function scheduleHidePlayerControls(delayMs = 4000) {
  if (wtHideTimer) {
    clearTimeout(wtHideTimer);
    wtHideTimer = null;
  }
  showPlayerControls();

  if (wtVideo && !wtVideo.paused && !wtVideo.ended) {
    wtHideTimer = setTimeout(() => {
      if (wtVideo && !wtVideo.paused && !wtVideo.ended) {
        const container = $("wtPlayerContainer");
        const controls = $("wtControls");
        if (controls) controls.classList.add("hide-controls");
        if (container) container.classList.add("hide-cursor");
      }
    }, delayMs);
  }
}

const wtContainer = $("wtPlayerContainer");
if (wtContainer) {
  wtContainer.addEventListener("mousemove", () => scheduleHidePlayerControls());
  wtContainer.addEventListener("mousedown", () => scheduleHidePlayerControls());
  wtContainer.addEventListener("touchstart", () => scheduleHidePlayerControls(), { passive: true });
  wtContainer.addEventListener("mouseleave", () => {
    if (wtVideo && !wtVideo.paused && !wtVideo.ended && !document.fullscreenElement) {
      if (wtHideTimer) clearTimeout(wtHideTimer);
      const controls = $("wtControls");
      if (controls) controls.classList.add("hide-controls");
      wtContainer.classList.remove("hide-cursor");
    }
  });
}

wtPlayBtn.onclick = () => (wtVideo.paused ? wtVideo.play() : wtVideo.pause());
wtBigPlay.onclick = () => wtVideo.play();
wtVideo.onclick = () => (wtVideo.paused ? wtVideo.play() : wtVideo.pause());

wtVideo.onplay = () => {
  wtPlayBtn.innerHTML = "&#9646;&#9646;";
  wtBigPlay.classList.remove("show");
  wtSpinner.classList.add("hidden");
  scheduleHidePlayerControls(4000);
};
wtVideo.onpause = () => {
  wtPlayBtn.innerHTML = "&#9654;";
  wtBigPlay.classList.add("show");
  if (wtHideTimer) clearTimeout(wtHideTimer);
  showPlayerControls();
};
wtVideo.onended = () => {
  if (wtHideTimer) clearTimeout(wtHideTimer);
  showPlayerControls();
};
wtVideo.onwaiting = () => {
  wtSpinner.classList.remove("hidden");
  showPlayerControls();
};
wtVideo.onplaying = () => {
  wtSpinner.classList.add("hidden");
  scheduleHidePlayerControls(4000);
};
wtVideo.oncanplay = () => wtSpinner.classList.add("hidden");

wtVideo.ontimeupdate = () => {
  if (!wtVideo.duration) return;
  const cur = wtVideo.currentTime;
  const dur = wtVideo.duration;
  const pct = (cur / dur) * 100;
  wtCurrentBar.style.width = `${pct}%`;
  wtSeek.value = (cur / dur) * 1000;
  wtCurTime.textContent = fmtWatchTime(cur);

  if (wtVideo.buffered.length > 0) {
    try {
      const bufEnd = wtVideo.buffered.end(wtVideo.buffered.length - 1);
      wtBufferBar.style.width = `${(bufEnd / dur) * 100}%`;
    } catch (_) {}
  }
};

wtVideo.ondurationchange = () => {
  wtDuration.textContent = fmtWatchTime(wtVideo.duration || 0);
};

wtSeek.oninput = () => {
  if (wtVideo.duration) {
    wtVideo.currentTime = (wtSeek.value / 1000) * wtVideo.duration;
  }
};

$("wtBack10Btn").onclick = () => {
  wtVideo.currentTime = Math.max(0, wtVideo.currentTime - 10);
};
$("wtFwd10Btn").onclick = () => {
  wtVideo.currentTime = Math.min(wtVideo.duration || 0, wtVideo.currentTime + 10);
};

wtVol.oninput = () => {
  wtVideo.volume = wtVol.value / 100;
  wtVideo.muted = false;
  wtMuteBtn.innerHTML = wtVideo.volume === 0 ? SVG_ICONS.mute : SVG_ICONS.volume;
};
wtMuteBtn.onclick = () => {
  wtVideo.muted = !wtVideo.muted;
  wtMuteBtn.innerHTML = wtVideo.muted || wtVideo.volume === 0 ? SVG_ICONS.mute : SVG_ICONS.volume;
};

wtFullscreen.onclick = () => {
  const container = $("wtPlayerContainer");
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
};

$("wtPlayerQualitySelect").onchange = () => {
  const newUrl = $("wtPlayerQualitySelect").value;
  if (!newUrl) return;
  const curTime = wtVideo.currentTime;
  const wasPlaying = !wtVideo.paused;
  wtVideo.src = newUrl;
  wtVideo.currentTime = curTime;
  if (wasPlaying) wtVideo.play();
};

$("wtPlayerSubSelect").onchange = async () => {
  await loadStreamSubtitle($("wtPlayerSubSelect").value);
};

// Keyboard Shortcuts when player view is open
document.addEventListener("keydown", e => {
  if ($("wtPlayerView").classList.contains("hidden")) return;

  scheduleHidePlayerControls();

  if (e.key === " " || e.key === "k" || e.key === "K") {
    e.preventDefault();
    wtVideo.paused ? wtVideo.play() : wtVideo.pause();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    wtVideo.currentTime = Math.max(0, wtVideo.currentTime - 10);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    wtVideo.currentTime = Math.min(wtVideo.duration || 0, wtVideo.currentTime + 10);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    wtVideo.volume = Math.min(1, wtVideo.volume + 0.05);
    wtVol.value = Math.round(wtVideo.volume * 100);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    wtVideo.volume = Math.max(0, wtVideo.volume - 0.05);
    wtVol.value = Math.round(wtVideo.volume * 100);
  } else if (e.key === "f" || e.key === "F") {
    wtFullscreen.click();
  } else if (e.key === "m" || e.key === "M") {
    wtMuteBtn.click();
  }
});

function fmtWatchTime(seconds) {
  seconds = Math.floor(seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ================================================================
// DRAG & DROP OFFLINE AUDIO FILES
// ================================================================
window.addEventListener("dragover", e => {
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener("drop", async e => {
  e.preventDefault();
  e.stopPropagation();
  const files = Array.from(e.dataTransfer?.files || []);
  const audioFiles = files.filter(f => /\.(mp3|m4a|flac|wav|aac|ogg|opus|wma|webm)$/i.test(f.name || f.path));
  if (!audioFiles.length) return;

  const songs = audioFiles.map(f => {
    const filePath = f.path || f.name;
    const norm = filePath.replace(/\\/g, "/");
    return {
      id: "drop_" + Math.random().toString(36).slice(2, 10),
      name: f.name.replace(/\.[^/.]+$/, ""),
      artist: "Local Audio",
      image: "",
      filePath: filePath,
      streamUrl: `local-audio://${encodeURIComponent(norm)}`,
      sizeStr: fmtSize(f.size),
      isOffline: true,
      source: "offline",
    };
  });

  toast(`Loaded ${songs.length} audio file(s)`, "success");
  playSong(songs[0], songs, 0);
  if (document.querySelector(".nav-item.active")?.dataset.page === "library") {
    loadLibrary("offline");
  }
});


// ═══════════════════════════════════════════════════════════════
// APP AUTO-UPDATE (GitHub Releases)
// Shows a floating update banner — no intrusion, user controls it.
// ═══════════════════════════════════════════════════════════════
(function initAppUpdater() {
  const banner = document.createElement("div");
  banner.id = "appUpdateBanner";
  banner.style.cssText = [
    "position:fixed;bottom:80px;right:20px;z-index:9999",
    "background:linear-gradient(135deg,#1a0d2e,#251a3d)",
    "border:1px solid rgba(168,85,247,0.4);border-radius:12px",
    "padding:14px 18px;min-width:280px;max-width:360px",
    "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
    "font-family:inherit;font-size:13px;color:#e2d9f3",
    "transform:translateY(120px);opacity:0",
    "transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .3s",
    "display:none"
  ].join(";");
  document.body.appendChild(banner);

  function showBanner(html) {
    banner.innerHTML = html;
    banner.style.display = "block";
    requestAnimationFrame(() => {
      banner.style.transform = "translateY(0)";
      banner.style.opacity = "1";
    });
  }
  function hideBanner() {
    banner.style.transform = "translateY(120px)";
    banner.style.opacity = "0";
    setTimeout(() => { banner.style.display = "none"; }, 350);
  }
  banner.addEventListener("hide", hideBanner);

  const closeBtn = '<button onclick="document.getElementById(\'appUpdateBanner\').dispatchEvent(new Event(\'hide\'))" style="position:absolute;top:8px;right:10px;background:none;border:none;color:#a78bfa;cursor:pointer;font-size:16px;line-height:1">x</button>';

  if (window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable(function(info) {
      showBanner(closeBtn +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<strong style="color:#c084fc">Nova Downloader ' + (info.version || "") + ' available!</strong></div>' +
        '<p style="color:#9ca3af;font-size:12px;margin:0 0 10px">নতুন version আছে। Download করবেন?</p>' +
        '<div style="display:flex;gap:8px">' +
        '<button id="auDownloadBtn" style="flex:1;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:7px;padding:7px 0;cursor:pointer;font-size:12px;font-weight:600">Download Update</button>' +
        '<button onclick="document.getElementById(\'appUpdateBanner\').dispatchEvent(new Event(\'hide\'))" style="background:rgba(255,255,255,0.06);color:#9ca3af;border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 12px;cursor:pointer;font-size:12px">Later</button>' +
        '</div>');
      var dlBtn = document.getElementById("auDownloadBtn");
      if (dlBtn) dlBtn.onclick = function() { window.api.updateDownload(); };
    });
  }

  if (window.api.onUpdateProgress) {
    window.api.onUpdateProgress(function(p) {
      showBanner(closeBtn +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<strong style="color:#c084fc">Downloading update... ' + p.percent + '%</strong></div>' +
        '<div style="background:rgba(255,255,255,0.08);border-radius:100px;height:6px;overflow:hidden;margin-bottom:8px">' +
        '<div style="width:' + p.percent + '%;height:100%;background:linear-gradient(90deg,#7c3aed,#a855f7);border-radius:100px;transition:width .3s"></div></div>' +
        '<p style="color:#6b7280;font-size:11px;margin:0">' + p.transferred + ' / ' + p.total + ' &nbsp;.&nbsp; ' + p.bytesPerSecond + '</p>');
    });
  }

  if (window.api.onUpdateDownloaded) {
    window.api.onUpdateDownloaded(function(info) {
      showBanner(closeBtn +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<strong style="color:#4ade80">Update ' + (info.version || "") + ' ready!</strong></div>' +
        '<p style="color:#9ca3af;font-size:12px;margin:0 0 10px">App restart করলেই install হয়ে যাবে।</p>' +
        '<button id="auInstallBtn" style="width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border:none;border-radius:7px;padding:8px 0;cursor:pointer;font-size:13px;font-weight:700">Restart & Install</button>');
      var installBtn = document.getElementById("auInstallBtn");
      if (installBtn) installBtn.onclick = function() { window.api.updateInstall(); };
    });
  }

  if (window.api.onUpdateError) {
    window.api.onUpdateError(function(e) {
      console.warn("[Nova Update] error:", e.message);
    });
  }
})();

// ================================================================
// NOVA PLAYER — mini popup + full-page + dedicated window
// ================================================================
(function () {
  // Helpers
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // ---- State ----
  let currentFile  = null;
  let currentTitle = "";
  let isMiniOpen   = false;

  const miniPlayer  = $("novaMiniPlayer");
  const miniVideo   = $("novaMiniVideo");
  const miniSeek    = $("novaMiniSeek");
  const miniVolume  = $("novaMiniVolume");
  const miniTime    = $("novaMiniTime");
  const miniBtnPlay = $("novaMiniBtnPlay");

  const fullVideo   = $("novaPlayerVideo");
  const fullSeek    = $("novaSeek");
  const fullVolume  = $("novaVolume");

  // ---- Open file ----
  // Called from the queue row "Play" button
  window.playNovaFile = function (filePath, title) {
    currentFile  = filePath;
    currentTitle = title || filePath.split(/[\\/]/).pop();

    // Show mini player popup
    $("novaMiniTitle").textContent = currentTitle;
    miniVideo.src = "local-file://" + filePath.replace(/\\/g, "/");
    miniVideo.load();
    miniVideo.play();
    miniPlayer.classList.remove("hidden");
    isMiniOpen = true;
  };

  // ---- Mini player controls ----
  miniVideo.addEventListener("timeupdate", () => {
    if (!miniVideo.duration) return;
    miniSeek.value = (miniVideo.currentTime / miniVideo.duration) * 1000;
    miniTime.textContent = fmtTime(miniVideo.currentTime) + " / " + fmtTime(miniVideo.duration);
    miniBtnPlay.textContent = miniVideo.paused ? "▶" : "⏸";
  });
  miniVideo.addEventListener("click", () => miniVideo.paused ? miniVideo.play() : miniVideo.pause());
  miniSeek.addEventListener("input", () => { if (miniVideo.duration) miniVideo.currentTime = (miniSeek.value / 1000) * miniVideo.duration; });
  miniVolume.addEventListener("input", () => { miniVideo.volume = miniVolume.value; });
  miniBtnPlay.addEventListener("click", () => miniVideo.paused ? miniVideo.play() : miniVideo.pause());
  $("novaMiniBtnRewind").addEventListener("click", () => { miniVideo.currentTime = Math.max(0, miniVideo.currentTime - 10); });
  $("novaMiniBtnForward").addEventListener("click", () => { miniVideo.currentTime = Math.min(miniVideo.duration || 0, miniVideo.currentTime + 10); });

  // Close mini
  $("novaMiniClose").addEventListener("click", () => {
    miniVideo.pause();
    miniVideo.src = "";
    miniPlayer.classList.add("hidden");
    isMiniOpen = false;
  });

  // Expand mini → full player page
  $("novaMiniExpand").addEventListener("click", () => {
    openFullPlayer();
  });

  // Open in dedicated OS window
  $("novaMiniWindow").addEventListener("click", openDedicatedWindow);
  $("playerOpenWindow").addEventListener("click",  openDedicatedWindow);

  function openDedicatedWindow() {
    if (!currentFile) return;
    if (window.api.openPlayerWindow) {
      miniVideo.pause();
      window.api.openPlayerWindow({ filePath: currentFile, title: currentTitle });
    }
  }

  // ---- Full player page ----
  function openFullPlayer() {
    if (!currentFile) return;
    // Sync position from mini
    const pos = miniVideo.currentTime;
    miniVideo.pause();

    $("playerTitle").textContent = currentTitle;
    fullVideo.src = "local-file://" + currentFile.replace(/\\/g, "/");
    fullVideo.load();
    fullVideo.addEventListener("loadedmetadata", () => { fullVideo.currentTime = pos; fullVideo.play(); }, { once: true });
    miniPlayer.classList.add("hidden");

    // navigate to player page
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-player").classList.add("active");
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  }

  $("playerBack").addEventListener("click", () => {
    fullVideo.pause();
    // Go back to queue
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-queue").classList.add("active");
    document.querySelectorAll(".nav-item[data-page='queue']").forEach(b => b.classList.add("active"));
  });

  // Full player controls
  fullVideo.addEventListener("timeupdate", () => {
    if (!fullVideo.duration) return;
    fullSeek.value = (fullVideo.currentTime / fullVideo.duration) * 1000;
    $("novaCurrentTime").textContent = fmtTime(fullVideo.currentTime);
    $("novaDuration").textContent = fmtTime(fullVideo.duration);
    $("novaBtnPlay").textContent = fullVideo.paused ? "▶" : "⏸";
  });
  fullVideo.addEventListener("click", () => fullVideo.paused ? fullVideo.play() : fullVideo.pause());
  fullSeek.addEventListener("input", () => { if (fullVideo.duration) fullVideo.currentTime = (fullSeek.value / 1000) * fullVideo.duration; });
  fullVolume.addEventListener("input", () => { fullVideo.volume = fullVolume.value; });
  $("novaBtnPlay").addEventListener("click", () => fullVideo.paused ? fullVideo.play() : fullVideo.pause());
  $("novaBtnRewind").addEventListener("click", () => { fullVideo.currentTime = Math.max(0, fullVideo.currentTime - 10); });
  $("novaBtnForward").addEventListener("click", () => { fullVideo.currentTime = Math.min(fullVideo.duration || 0, fullVideo.currentTime + 10); });
  $("novaBtnMute").addEventListener("click", () => {
    fullVideo.muted = !fullVideo.muted;
    $("novaBtnMute").textContent = fullVideo.muted ? "🔇" : "🔊";
  });
  $("novaBtnFullscreen").addEventListener("click", () => {
    const wrap = document.querySelector(".nova-player-wrap");
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen();
  });

  // ---- Keyboard shortcuts (active when player page is open) ----
  document.addEventListener("keydown", (e) => {
    const isPlayerPage = document.getElementById("page-player").classList.contains("active");
    const activeVid = isPlayerPage ? fullVideo : (isMiniOpen ? miniVideo : null);
    if (!activeVid) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        activeVid.paused ? activeVid.play() : activeVid.pause();
        break;
      case "ArrowLeft":
        e.preventDefault();
        activeVid.currentTime = Math.max(0, activeVid.currentTime - 10);
        break;
      case "ArrowRight":
        e.preventDefault();
        activeVid.currentTime = Math.min(activeVid.duration || 0, activeVid.currentTime + 10);
        break;
      case "KeyM":
        activeVid.muted = !activeVid.muted;
        if (isPlayerPage) $("novaBtnMute").textContent = activeVid.muted ? "🔇" : "🔊";
        break;
      case "KeyF":
        if (isPlayerPage) {
          const wrap = document.querySelector(".nova-player-wrap");
          if (document.fullscreenElement) document.exitFullscreen();
          else wrap.requestFullscreen();
        }
        break;
    }
  });

  // ---- Play button in queue/history rows ----
  // paintTaskActions already adds a Play button for audio; we add one for video too.
  // We hook into the existing act() pipeline by registering a "nova-play" action.
  const _origAct = window.act || (() => {});
  // Override paintTaskActions to add video Play button
  const _origPaintTaskActions = window.paintTaskActions;

  // Register IPC listener for opening files via "Open with Nova Player"
  if (window.api && window.api.onOpenFile) {
    window.api.onOpenFile((filePath) => {
      window.playNovaFile(filePath, filePath.split(/[\\/]/).pop());
    });
  }
})();
