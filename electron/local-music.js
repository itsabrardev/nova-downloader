// Nova Music — Offline / Local Audio Engine & Scanner
const fs   = require("fs");
const path = require("path");
const { app, shell, dialog } = require("electron");
const musicStore = require("./music-store");

const AUDIO_EXTS = new Set([".mp3", ".m4a", ".flac", ".wav", ".aac", ".ogg", ".opus", ".webm", ".wma"]);

// In-memory cache for parsed metadata so rescans are instantaneous
const metaCache = new Map();

// Parse ID3v2 tags from MP3 buffer (pure JS, super fast & zero dependencies)
function parseId3(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const headerBuf = Buffer.alloc(10);
    fs.readSync(fd, headerBuf, 0, 10, 0);

    if (headerBuf.toString("ascii", 0, 3) !== "ID3") {
      fs.closeSync(fd);
      return null;
    }

    const version = headerBuf[3]; // 3 = v2.3, 4 = v2.4
    const tagSize = ((headerBuf[6] & 0x7f) << 21) |
                    ((headerBuf[7] & 0x7f) << 14) |
                    ((headerBuf[8] & 0x7f) << 7)  |
                    (headerBuf[9] & 0x7f);

    const readLen = Math.min(tagSize, 256 * 1024);
    const tagBuf = Buffer.alloc(readLen);
    fs.readSync(fd, tagBuf, 0, readLen, 10);
    fs.closeSync(fd);

    let offset = 0;
    const tags = {};

    const decodeText = (buf, encoding) => {
      try {
        if (encoding === 0) return buf.toString("latin1").replace(/\0+$/, "");
        if (encoding === 1) return buf.toString("utf16le").replace(/\0+$/, "");
        if (encoding === 2) return buf.toString("utf16be").replace(/\0+$/, "");
        if (encoding === 3) return buf.toString("utf8").replace(/\0+$/, "");
        return buf.toString("utf8").replace(/\0+$/, "");
      } catch (_) {
        return "";
      }
    };

    while (offset + 10 < tagBuf.length) {
      const frameId = tagBuf.toString("ascii", offset, offset + 4);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      let frameSize = 0;
      if (version === 4) {
        frameSize = ((tagBuf[offset + 4] & 0x7f) << 21) |
                    ((tagBuf[offset + 5] & 0x7f) << 14) |
                    ((tagBuf[offset + 6] & 0x7f) << 7)  |
                    (tagBuf[offset + 7] & 0x7f);
      } else {
        frameSize = tagBuf.readUInt32BE(offset + 4);
      }

      offset += 10;
      if (frameSize <= 0 || offset + frameSize > tagBuf.length) break;

      const frameData = tagBuf.subarray(offset, offset + frameSize);
      offset += frameSize;

      if (frameId === "TIT2" && !tags.title) {
        tags.title = decodeText(frameData.subarray(1), frameData[0]).trim();
      } else if (frameId === "TPE1" && !tags.artist) {
        tags.artist = decodeText(frameData.subarray(1), frameData[0]).trim();
      } else if (frameId === "TALB" && !tags.album) {
        tags.album = decodeText(frameData.subarray(1), frameData[0]).trim();
      } else if (frameId === "APIC" && !tags.image) {
        try {
          const enc = frameData[0];
          let p = 1;
          while (p < frameData.length && frameData[p] !== 0) p++;
          const mime = frameData.toString("ascii", 1, p) || "image/jpeg";
          p++; // skip null
          p++; // skip picture type
          // skip description
          if (enc === 1 || enc === 2) {
            while (p + 1 < frameData.length && !(frameData[p] === 0 && frameData[p + 1] === 0)) p += 2;
            p += 2;
          } else {
            while (p < frameData.length && frameData[p] !== 0) p++;
            p++;
          }
          if (p < frameData.length) {
            const imgBuf = frameData.subarray(p);
            if (imgBuf.length > 32) {
              tags.image = `data:${mime};base64,${imgBuf.toString("base64")}`;
            }
          }
        } catch (_) {}
      }
    }

    return tags;
  } catch (_) {
    return null;
  }
}

// Extract clean title and artist from filename
function parseFilename(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const clean = base
    .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|hd|4k|mv|full\s*song|visualizer|320kbps|hq)[^\)\]]*[\)\]]/gi, "")
    .trim();

  // Pattern: "Artist - Song Title" or "Artist – Song Title"
  const parts = clean.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim(),
    };
  }

  return {
    artist: "Offline Audio",
    title: clean || base,
  };
}

// Format file size
function fmtBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Scan a single folder recursively
function scanDir(dirPath, maxDepth = 2, currentDepth = 0) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        if (currentDepth < maxDepth) {
          results.push(...scanDir(full, maxDepth, currentDepth + 1));
        }
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          results.push(full);
        }
      }
    }
  } catch (_) {}

  return results;
}

// Create a local song object from file path and optional download task metadata
function createSongEntry(filePath, taskMeta = null) {
  try {
    const stat = fs.statSync(filePath);
    const cached = metaCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.song;
    }

    const ext = path.extname(filePath).toLowerCase();
    const extName = ext.replace(".", "").toUpperCase();
    let id3 = null;
    if (ext === ".mp3") {
      id3 = parseId3(filePath);
    }

    const fnMeta = parseFilename(filePath);
    const title = (id3 && id3.title) || (taskMeta && taskMeta.title) || fnMeta.title || path.basename(filePath);
    const artist = (id3 && id3.artist) || (taskMeta && taskMeta.artist) || fnMeta.artist || "Offline Audio";
    const album = (id3 && id3.album) || "Downloaded Audio";
    const image = (id3 && id3.image) || (taskMeta && taskMeta.thumbnail) || "";

    const normalizedPath = filePath.replace(/\\/g, "/");
    const streamUrl = `local-audio://${encodeURIComponent(normalizedPath)}`;

    // Unique ID for the offline track
    const id = "local_" + Buffer.from(normalizedPath.toLowerCase()).toString("base64").replace(/[+/=]/g, "").slice(0, 24);

    const song = {
      id,
      name: title,
      artist,
      album,
      image,
      streamUrl,
      filePath,
      format: extName,
      size: stat.size,
      sizeStr: fmtBytes(stat.size),
      duration: (taskMeta && taskMeta.duration) || 0,
      modifiedAt: stat.mtimeMs,
      source: "offline",
      isOffline: true,
    };

    metaCache.set(filePath, { mtimeMs: stat.mtimeMs, song });
    return song;
  } catch (_) {
    return null;
  }
}

// Scan all offline audio sources
async function getOfflineAudio(downloadFolder, engineHistory = []) {
  const folders = new Set();

  if (downloadFolder && fs.existsSync(downloadFolder)) {
    folders.add(downloadFolder);
  }

  // Also check custom folders from musicStore
  const customFolders = musicStore.getLocalFolders ? musicStore.getLocalFolders() : [];
  for (const cf of customFolders) {
    if (cf && fs.existsSync(cf)) folders.add(cf);
  }

  // Also include system Music folder if exists
  try {
    const sysMusic = app.getPath("music");
    if (sysMusic && fs.existsSync(sysMusic)) folders.add(sysMusic);
  } catch (_) {}

  // Map engine completed tasks for metadata preservation
  const taskMap = new Map();
  if (Array.isArray(engineHistory)) {
    for (const t of engineHistory) {
      if (t && t.filePath && fs.existsSync(t.filePath)) {
        const norm = path.normalize(t.filePath).toLowerCase();
        taskMap.set(norm, t);
      }
    }
  }

  // Gather all audio files
  const filePaths = new Set();
  for (const dir of folders) {
    const files = scanDir(dir, 2);
    files.forEach(f => filePaths.add(f));
  }

  // Also add any audio files directly from task history
  for (const [normPath, t] of taskMap.entries()) {
    const ext = path.extname(t.filePath).toLowerCase();
    if (AUDIO_EXTS.has(ext) && fs.existsSync(t.filePath)) {
      filePaths.add(t.filePath);
    }
  }

  const songs = [];
  for (const fp of filePaths) {
    const norm = path.normalize(fp).toLowerCase();
    const taskMeta = taskMap.get(norm);
    const song = createSongEntry(fp, taskMeta);
    if (song) songs.push(song);
  }

  // Sort by newest modified/downloaded first
  songs.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
  return songs;
}

// Pick folders dialog
async function pickFolder(mainWindow) {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Offline Music Folder",
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
  const picked = res.filePaths[0];
  if (musicStore.addLocalFolder) {
    musicStore.addLocalFolder(picked);
  }
  return picked;
}

// Pick audio files dialog
async function pickAudioFiles(mainWindow) {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    title: "Select Audio Files to Play",
    filters: [
      { name: "Audio Files", extensions: ["mp3", "m4a", "flac", "wav", "aac", "ogg", "opus", "webm", "wma"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return [];
  const songs = [];
  for (const fp of res.filePaths) {
    const song = createSongEntry(fp);
    if (song) songs.push(song);
  }
  return songs;
}

// Delete an audio file
async function deleteAudioFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, message: "File not found" };
  try {
    await shell.trashItem(filePath);
    metaCache.delete(filePath);
    return { ok: true };
  } catch (err) {
    try {
      fs.unlinkSync(filePath);
      metaCache.delete(filePath);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
}

module.exports = {
  getOfflineAudio,
  pickFolder,
  pickAudioFiles,
  deleteAudioFile,
  createSongEntry,
  AUDIO_EXTS,
};
