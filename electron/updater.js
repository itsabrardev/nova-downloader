// Nova Downloader — yt-dlp self-update.
//
// Why this exists: yt-dlp is the only part of the app that goes stale on its own.
// It chases sites that change their pages every few weeks, so a build two months
// old fails per-site (TikTok first) with "Unexpected response from webpage
// request". Package managers lag behind — `winget upgrade yt-dlp.yt-dlp` reported
// "no available upgrade" on a build that was already 52 days old — so the only
// reliable route is the official release asset, fetched here.
//
// Security posture, deliberately narrow because this writes an executable:
//   * HTTPS only, and every redirect hop is re-checked against ALLOWED_HOSTS —
//     GitHub bounces release downloads onto a CDN host, so checking just the
//     first URL would let a redirect walk anywhere.
//   * The SHA-256 published by yt-dlp in the same release is verified before the
//     file is put in place. A mismatch throws and the old binary stays.
//   * Nothing from the renderer reaches this module: no URL, no path, no
//     filename. The asset is chosen by process.platform and the destination is
//     always `bin/` inside the app.
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Extractor fixes land in nightly days-to-weeks before a stable release ships
// them, which is exactly the window in which TikTok or Facebook is broken. yt-dlp's
// own docs put it plainly: the latest stable release is "often 'stale' and prone to
// external breakage", and nightly is "the recommended channel for regular users".
// Same asset names, same published SHA2-256SUMS, so nothing else changes.
const CHANNELS = {
  stable: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
  nightly: "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest",
};
// GitHub's API rejects requests without a User-Agent.
const UA = "NovaDownloader/1.0 (+yt-dlp updater)";
const SUMS_ASSET = "SHA2-256SUMS";
const MAX_REDIRECTS = 5;
const MAX_BYTES = 64 * 1024 * 1024; // a yt-dlp build is ~17 MB; this is a sanity stop

const ALLOWED_HOSTS = ["api.github.com", "github.com"];
const hostAllowed = (u) =>
  u.protocol === "https:" &&
  (ALLOWED_HOSTS.includes(u.hostname) || u.hostname.endsWith(".githubusercontent.com"));

// Which release asset this platform needs, and what it is called on disk.
function assetFor(platform = process.platform) {
  if (platform === "win32") return { asset: "yt-dlp.exe", file: "yt-dlp.exe" };
  if (platform === "darwin") return { asset: "yt-dlp_macos", file: "yt-dlp" };
  return { asset: "yt-dlp_linux", file: "yt-dlp" };
}

// GET a URL into a Buffer, following redirects. `onProgress(received, total)` is
// called as bytes arrive; total is 0 when the server sends no Content-Length.
function fetchBuffer(url, onProgress, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (_) {
      return reject(new Error("Bad download URL."));
    }
    if (!hostAllowed(target)) return reject(new Error(`Refusing to download from ${target.hostname}.`));

    const req = https.get(
      target,
      { headers: { "User-Agent": UA, Accept: "*/*" }, timeout: 30000 },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // drain, or the socket is never released
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects."));
          const next = new URL(res.headers.location, target).href;
          return fetchBuffer(next, onProgress, redirectsLeft - 1).then(resolve, reject);
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`Download failed (HTTP ${status}).`));
        }

        const total = Number(res.headers["content-length"] || 0);
        const chunks = [];
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (received > MAX_BYTES) {
            req.destroy();
            return reject(new Error("Download was unexpectedly large — aborted."));
          }
          chunks.push(chunk);
          if (onProgress) onProgress(received, total);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("Connection timed out.")));
    req.on("error", (err) => reject(new Error(err.message || "Network error.")));
  });
}

// The SHA2-256SUMS asset is `"<hex>  <filename>"` per line.
function expectedHash(sumsText, assetName) {
  for (const line of String(sumsText).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+(\S+)$/i.exec(line.trim());
    if (m && m[2] === assetName) return m[1].toLowerCase();
  }
  return null;
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Replace `target` with `buf`. Written next to the destination first so a failed
// or half-finished download can never leave a truncated binary behind.
function installFile(buf, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.new`;
  fs.writeFileSync(tmp, buf, { mode: 0o755 });
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    // Windows refuses to rename over a file another process has open.
    try {
      fs.unlinkSync(target);
      fs.renameSync(tmp, target);
    } catch (_) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw new Error(
        "Could not replace the existing yt-dlp — it may still be running. Close any download and retry."
      );
    }
  }
  return target;
}

// Fetch the newest yt-dlp release and install it into `binDir`.
// `onProgress({ phase, percent })` reports "checking" | "downloading" | "verifying".
// `channel` is "stable" or "nightly"; anything else falls back to stable rather
// than being interpolated into a URL.
async function updateYtdlp(binDir, onProgress = () => {}, channel = "stable") {
  const { asset, file } = assetFor();
  const api = CHANNELS[channel] || CHANNELS.stable;

  onProgress({ phase: "checking", percent: 0 });
  const releaseRaw = await fetchBuffer(api);
  let release;
  try {
    release = JSON.parse(releaseRaw.toString("utf8"));
  } catch (_) {
    throw new Error("Could not read the release info from GitHub.");
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const wanted = assets.find((a) => a && a.name === asset);
  const sums = assets.find((a) => a && a.name === SUMS_ASSET);
  if (!wanted || !wanted.browser_download_url) throw new Error(`The latest release has no ${asset}.`);
  // No checksum, no install: an unverified executable is not worth the convenience.
  if (!sums || !sums.browser_download_url) throw new Error("The release is missing its checksum file.");

  const sumsText = (await fetchBuffer(sums.browser_download_url)).toString("utf8");
  const expected = expectedHash(sumsText, asset);
  if (!expected) throw new Error(`No published checksum for ${asset}.`);

  onProgress({ phase: "downloading", percent: 0 });
  const bin = await fetchBuffer(wanted.browser_download_url, (received, total) => {
    onProgress({ phase: "downloading", percent: total ? Math.round((received / total) * 100) : 0 });
  });

  onProgress({ phase: "verifying", percent: 100 });
  const actual = sha256(bin);
  if (actual !== expected) {
    throw new Error("Checksum mismatch — the download was corrupted or tampered with. Nothing was changed.");
  }

  const target = installFile(bin, path.join(binDir, file));
  return { version: String(release.tag_name || "").trim(), channel: CHANNELS[channel] ? channel : "stable", path: target };
}

module.exports = { updateYtdlp, assetFor, expectedHash, hostAllowed, CHANNELS };
