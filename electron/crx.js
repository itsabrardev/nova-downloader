// Nova Downloader — locates the packed extension and describes it to Chrome.
//
// The app serves its own extension over the loopback API, so an install works
// with no internet and no Web Store round trip:
//
//   http://127.0.0.1:<port>/ext/updates.xml   → the manifest Chrome polls
//   http://127.0.0.1:<port>/ext/nova-downloader.crx → the signed package
//
// Everything here is produced by `npm run pack:crx` (tools/pack-crx.js). If that
// hasn't been run, every function returns null and the /ext routes 404 — the app
// itself keeps working, only the browser hookup is unavailable.
const fs = require("fs");
const path = require("path");

// Packaged, the files ship as extraResources under resources/ext; from source
// they sit where the packer wrote them. resources/ first, so an installed build
// never accidentally reads a stale dist/ folder that happens to be alongside.
function roots() {
  const list = [];
  if (process.resourcesPath) list.push(path.join(process.resourcesPath, "ext"));
  list.push(path.join(__dirname, "..", "installer", "dist"));
  return list;
}

function find(name) {
  for (const root of roots()) {
    const full = path.join(root, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// { id, version, file } — the id is what a Chrome policy entry has to name, and
// the version is what makes Chrome decide the served package is newer.
function info() {
  const file = find("crx-info.json");
  if (!file) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed.id || !parsed.version) return null;
    return { id: parsed.id, version: parsed.version, file: parsed.file || "nova-downloader.crx" };
  } catch (_) {
    return null; // half-written or hand-edited: treat as absent rather than crash
  }
}

function crxPath() {
  const meta = info();
  // Only ever the filename recorded by the packer — never a value from a request.
  return meta ? find(path.basename(meta.file)) : null;
}

// The unpacked copy, for the "Load unpacked" route on machines where Chrome
// refuses to install off-store packages silently.
function unpackedDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, "extension"));
  candidates.push(path.join(__dirname, "..", "extension"));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  }
  return null;
}

// Chrome's update manifest. Deliberately minimal: one app, one codebase URL.
function updatesXml(port) {
  const meta = info();
  if (!meta) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${meta.id}">
    <updatecheck codebase="http://127.0.0.1:${port}/ext/${meta.file}" version="${meta.version}" />
  </app>
</gupdate>
`;
}

module.exports = { info, crxPath, unpackedDir, updatesXml };
