// Nova Downloader — background video library.
// Uploaded clips are COPIED into userData/backgrounds, so the app keeps working
// after the user moves, renames, or deletes the original file.
const fs = require("fs");
const path = require("path");

const VIDEO_EXT = [".mp4", ".webm", ".mov", ".mkv", ".m4v"];
const MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

class Backgrounds {
  constructor(userDataDir) {
    this.dir = path.join(userDataDir, "backgrounds"); // uploaded by the user
    this.assetsDir = path.join(__dirname, "..", "assets"); // shipped with the app
  }

  // Everything available, bundled clips first.
  list() {
    const read = (dir, source) => {
      try {
        return fs
          .readdirSync(dir)
          .filter((n) => VIDEO_EXT.includes(path.extname(n).toLowerCase()))
          .sort((a, b) => a.localeCompare(b))
          .map((n) => ({ id: `${source}:${n}`, name: n, source, path: path.join(dir, n) }));
      } catch (_) {
        return []; // folder may not exist yet
      }
    };
    return [...read(this.assetsDir, "builtin"), ...read(this.dir, "library")];
  }

  // An id is only ever matched against the real listing, so a crafted id
  // cannot escape the two known folders.
  resolve(id) {
    if (!id) return null;
    return this.list().find((e) => e.id === id) || null;
  }

  // The clip that should be playing right now.
  current(selectedId) {
    const items = this.list();
    if (!items.length) return null;
    const picked = this.resolve(selectedId);
    if (picked) return picked;
    // Nothing chosen (or the chosen file is gone): keep the old behaviour of
    // preferring assets/background.*, else just use the first clip available.
    return items.find((e) => e.source === "builtin" && /^background\./i.test(e.name)) || items[0];
  }

  add(sourcePath) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!VIDEO_EXT.includes(ext)) throw new Error("Not a supported video file.");
    fs.mkdirSync(this.dir, { recursive: true });

    // Strip anything path-like out of the stored name.
    const base =
      path.basename(sourcePath, ext).replace(/[^\w\-. ]+/g, "_").trim().slice(0, 60) || "background";
    let name = `${base}${ext}`;
    for (let n = 2; fs.existsSync(path.join(this.dir, name)); n++) name = `${base} (${n})${ext}`;

    fs.copyFileSync(sourcePath, path.join(this.dir, name));
    return `library:${name}`;
  }

  remove(id) {
    const entry = this.resolve(id);
    if (!entry || entry.source !== "library") return false; // bundled clips are not deletable
    try {
      fs.unlinkSync(entry.path);
      return true;
    } catch (err) {
      console.error("[Nova] could not delete background:", err.message);
      return false;
    }
  }

  static mime(filePath) {
    return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  }
}

module.exports = { Backgrounds, VIDEO_EXT, MIME };
