// Nova Music — Spotube-Style Hybrid Engine
// Metadata: Spotify (rich cover art, artists, album, popularity)
// Audio:    JioSaavn (320kbps direct, primary) → YouTube Music (fallback)
const https   = require("https");
const http    = require("http");
const { spawn } = require("child_process");
const { resolveBinary } = require("./engine");
let spotify = null; // lazy-loaded to avoid circular deps
function getSpotify() {
  if (!spotify) spotify = require("./spotify");
  return spotify;
}

const SAAVN_BASE = "https://api-nova-music.vercel.app";
const LRCLIB    = "https://lrclib.net/api";

// In-memory stream cache: songId/spotifyId -> direct audio URL (expires in 4 hours)
const streamCache = new Map();

function getCachedStream(key) {
  const item = streamCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    streamCache.delete(key);
    return null;
  }
  return item.url;
}

function setCachedStream(key, url) {
  if (!key || !url) return;
  streamCache.set(key, { url, expiry: Date.now() + 4 * 3600 * 1000 });
}

// ---------- Low-level HTTP fetch ----------
const fetch_ = (url, opts = {}) => new Promise((resolve, reject) => {
  const u   = new URL(url);
  const mod = u.protocol === "https:" ? https : http;
  const req = mod.request({
    hostname: u.hostname,
    path:     u.pathname + u.search,
    method:   opts.method || "GET",
    headers:  {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":     "application/json",
      ...(opts.headers || {}),
    },
    agent: false,
  }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return fetch_(new URL(res.headers.location, url).href, opts).then(resolve, reject);
    }
    let body = "";
    res.on("data", chunk => { body += chunk; });
    res.on("end",  () => {
      try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
      catch (_) { resolve({ status: res.statusCode, data: body }); }
    });
  });
  req.setTimeout(12000, () => req.destroy(new Error("timeout")));
  req.on("error", reject);
  req.end();
});

// ---------- Helpers & Normalizers ----------

// Nova Music API response: { success, data: [{ id, name, duration, year, language, hasLyrics,
//   artists: { primary: [{name}] }, album: {id, name},
//   image: [{quality, url}], downloadUrl: [{quality:"320kbps", url:"..."}] }] }
const normSaavnSong = (s) => {
  if (!s || !s.id) return null;
  // Best image quality
  const bestImg = Array.isArray(s.image)
    ? (s.image.find(i => i.quality === "500x500") || s.image[s.image.length - 1])?.url || ""
    : typeof s.image === "string" ? s.image.trim() : "";
  // 320kbps direct stream URL — no DES decryption needed!
  const stream320 = Array.isArray(s.downloadUrl)
    ? (s.downloadUrl.find(d => d.quality === "320kbps") || s.downloadUrl[s.downloadUrl.length - 1])?.url || ""
    : "";
  // Artist name(s)
  const artist = Array.isArray(s.artists?.primary)
    ? s.artists.primary.map(a => a.name).join(", ")
    : (s.primaryArtists || s.singers || s.artists || "");
  return {
    id:        `saavn_${s.id}`,
    name:      s.name || s.title || s.song || "Untitled",
    artist,
    album:     s.album?.name || (typeof s.album === "string" ? s.album : "") || "",
    albumId:   s.album?.id || s.album_id || s.albumid || "",
    image:     bestImg,
    streamUrl: stream320,
    duration:  Number(s.duration) || 0,
    year:      s.year || "",
    language:  s.language || "",
    hasLyrics: s.hasLyrics || s.has_lyrics === "true" || false,
    source:    "saavn",
  };
};

const normList = (data) => {
  // Handle { success, data: [...] } or { success, data: { results: [...] } } or raw array
  const d = data?.data ?? data;
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.results) ? d.results
    : Array.isArray(d?.songs?.results) ? d.songs.results
    : [];
  return arr.map(normSaavnSong).filter(Boolean);
};

// ---------- YouTube Music Fast Search & Stream Resolver ----------

function parseDurationStr(str) {
  if (!str) return 0;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

// Ultra-fast HTTP YouTube search without launching heavy Python child processes (< 300ms)
function searchYouTube(query, maxResults = 10) {
  return new Promise((resolve) => {
    try {
      const u = new URL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      const req = https.get(u.href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 6000,
      }, res => {
        let html = "";
        res.on("data", d => { html += d; });
        res.on("end", () => {
          try {
            const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
            if (!match) return resolve([]);
            const json = JSON.parse(match[1]);
            const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
            const results = [];
            for (const item of contents) {
              const v = item.videoRenderer;
              if (v && v.videoId) {
                const title = v.title?.runs?.[0]?.text || "";
                const artist = v.ownerText?.runs?.[0]?.text || "";
                const thumbs = v.thumbnail?.thumbnails || [];
                const thumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
                results.push({
                  id:         `yt_${v.videoId}`,
                  name:       cleanTrackTitle(title),
                  artist:     cleanArtistName(artist),
                  album:      "YouTube Music",
                  albumId:    "",
                  image:      thumb,
                  streamUrl:  null,
                  youtubeUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
                  duration:   parseDurationStr(v.lengthText?.simpleText || ""),
                  year:       "",
                  language:   "",
                  hasLyrics:  true,
                  source:     "youtube",
                });
                if (results.length >= maxResults) break;
              }
            }
            resolve(results);
          } catch (_) {
            resolve([]);
          }
        });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
    } catch (_) {
      resolve([]);
    }
  });
}

function resolveYouTubeStream(targetUrlOrQuery) {
  return new Promise((resolve, reject) => {
    try {
      const bin = resolveBinary(null, "yt-dlp", "bin");
      let target = targetUrlOrQuery;
      if (!target.startsWith("http")) {
        if (target.startsWith("yt_")) {
          target = `https://www.youtube.com/watch?v=${target.replace(/^yt_/, "")}`;
        } else {
          target = `ytsearch1:${target}`;
        }
      }

      const proc = spawn(bin, [
        "-g",
        "-f", "140/251/139/ba/b",
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--extractor-args", "youtube:player_client=android",
        target,
      ]);

      let out = "";
      let err = "";
      proc.stdout.on("data", d => { out += d; });
      proc.stderr.on("data", d => { err += d; });
      proc.on("error", (e) => reject(e));
      proc.on("close", (code) => {
        const url = out.trim().split("\n")[0];
        if (code === 0 && url && url.startsWith("http")) {
          resolve(url);
        } else {
          reject(new Error(err || "Could not resolve audio stream"));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function cleanTrackTitle(title) {
  return String(title || "")
    .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|hd|4k|mv|full\s*song|visualizer)[^\)\]]*[\)\]]/gi, "")
    .trim();
}

function cleanArtistName(name) {
  return String(name || "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .trim();
}

// ---------- Public API ----------

/**
 * Spotube-Style Hybrid Search
 * 1. Spotify → rich metadata (high-res art, full artist list, album, popularity)
 * 2. JioSaavn → audio match (320kbps direct stream)
 * 3. YouTube Music → fallback for songs not on JioSaavn
 * Result: Spotify metadata + best available audio source merged together
 */
async function search(query) {
  query = String(query || "").trim();
  if (!query) return { results: [] };

  const sp = getSpotify();
  const spotifyLoggedIn = sp.isConnected();

  // Run all searches in parallel
  const [spotifyTracks, saavnRes, ytResults] = await Promise.all([
    // Spotify metadata (only if logged in)
    spotifyLoggedIn
      ? sp.searchTracks(query, 20).catch(() => [])
      : Promise.resolve([]),
    // JioSaavn for audio + non-Spotify songs
    fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent(query)}`)
      .then(res => (res.status === 200 && res.data ? normList(res.data) : []))
      .catch(() => []),
    // YouTube Music for global/anime/bangla songs
    searchYouTube(query, 10).catch(() => []),
  ]);

  const seen = new Set();
  const combined = [];

  const addSong = (s) => {
    if (!s || !s.name) return;
    const key = `${s.name.toLowerCase().trim()}_${(s.artist || "").toLowerCase().slice(0, 10)}`;
    if (!seen.has(key)) { seen.add(key); combined.push(s); }
  };

  if (spotifyLoggedIn && spotifyTracks.length > 0) {
    // SPOTUBE MODE: Spotify metadata first, enrich with JioSaavn audio URLs
    const saavnMap = new Map();
    saavnRes.forEach(s => {
      const k = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      saavnMap.set(k, s);
    });

    for (const spTrack of spotifyTracks) {
      const nameKey = spTrack.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const saavnMatch = saavnMap.get(nameKey);
      // Merge: Spotify metadata + JioSaavn streamUrl (if matched)
      addSong({
        ...spTrack,
        streamUrl:  saavnMatch?.streamUrl || null,
        saavnId:    saavnMatch?.id || null,
        audioSrc:   saavnMatch ? "saavn" : "youtube", // hint for resolveStream
      });
    }
    // Add JioSaavn-only songs not in Spotify results (e.g. Indian regional)
    saavnRes.forEach(s => addSong(s));
  } else {
    // NO SPOTIFY: JioSaavn first, then YouTube
    saavnRes.forEach(s => addSong(s));
  }

  // Always add YouTube results as fallback for global/anime/bangla
  ytResults.forEach(s => addSong(s));

  return { results: combined };
}


/** Get song details */
async function getSong(id) {
  const cleanId = id.replace(/^saavn_/, "");
  const res = await fetch_(`${SAAVN_BASE}/api/songs/${encodeURIComponent(cleanId)}`);
  if (res.status !== 200 || !res.data) throw new Error("Song not found");
  return normList(res.data);
}

/** Get album details */
async function getAlbum(albumId) {
  const res = await fetch_(`${SAAVN_BASE}/api/albums?id=${encodeURIComponent(albumId)}`);
  if (res.status !== 200 || !res.data) throw new Error("Album not found");
  const a = res.data?.data || res.data;
  return {
    id:     a.id || albumId,
    name:   a.name || a.title || "",
    image:  Array.isArray(a.image) ? (a.image.find(i => i.quality === "500x500") || a.image[a.image.length-1])?.url || "" : a.image || "",
    artist: Array.isArray(a.artists) ? a.artists.map(ar => ar.name).join(", ") : (a.subtitle || ""),
    year:   a.year || "",
    songs:  normList({ data: a.songs || [] }),
  };
}

/** Get playlist details */
async function getPlaylist(playlistId) {
  const res = await fetch_(`${SAAVN_BASE}/api/playlists?id=${encodeURIComponent(playlistId)}`);
  if (res.status !== 200 || !res.data) throw new Error("Playlist not found");
  const a = res.data?.data || res.data;
  return {
    id:    a.id || playlistId,
    name:  a.name || a.title || "",
    image: Array.isArray(a.image) ? (a.image.find(i => i.quality === "500x500") || a.image[a.image.length-1])?.url || "" : a.image || "",
    artist: a.subtitle || "",
    songs: normList({ data: a.songs || [] }),
  };
}

function isAccurateTitleMatch(sourceTitle, candidateTitle) {
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim().split(/\s+/).filter(Boolean);
  const srcWords = norm(sourceTitle);
  const candWords = norm(candidateTitle);
  if (!srcWords.length || !candWords.length) return false;

  const matched = srcWords.filter(w => candWords.includes(w));
  const ratio = matched.length / Math.min(srcWords.length, candWords.length);
  return ratio >= 0.5;
}

/** Universal Stream Resolver — Spotube Pattern
 * Priority: local → cache → YouTube direct → JioSaavn (direct 320kbps) → YouTube Music fallback
 * Works for: Spotify tracks, JioSaavn songs, YouTube videos, local files
 */
async function resolveStream(song, forceFresh = false) {
  if (!song) return null;
  const key = song.id || song.spotifyId || `${song.name}_${song.artist}`;

  // If local file: always valid, no network needed
  if (song.filePath || (song.streamUrl && song.streamUrl.startsWith("local-audio://"))) {
    return song.streamUrl || `local-audio://${encodeURIComponent(song.filePath.replace(/\\/g, "/"))}`;
  }

  // 1. Check in-memory cache if not forceFresh
  if (!forceFresh) {
    const cached = getCachedStream(key);
    if (cached) return cached;
  } else {
    streamCache.delete(key);
  }

  // 2. If it is an explicit YouTube track → resolve exact YouTube audio
  if (song.youtubeUrl || (song.id && song.id.startsWith("yt_")) || song.source === "youtube") {
    try {
      const target = song.youtubeUrl || `https://www.youtube.com/watch?v=${song.id.replace(/^yt_/, "")}`;
      const url = await resolveYouTubeStream(target);
      if (url) { setCachedStream(key, url); return url; }
    } catch (e) {
      console.warn("[Nova Music] Direct YouTube resolve failed for:", song.name, e.message);
    }
  }

  // 3. If it already has a direct 320kbps streamUrl → use it immediately (no re-fetch)
  if (!forceFresh && song.streamUrl && song.streamUrl.startsWith("http")) {
    setCachedStream(key, song.streamUrl);
    return song.streamUrl;
  }

  // 4. SPOTUBE: If this Spotify track was already matched to a JioSaavn ID during search → fast path
  if (song.saavnId) {
    try {
      const cleanId = song.saavnId.replace(/^saavn_/, "");
      const res = await fetch_(`${SAAVN_BASE}/api/songs/${encodeURIComponent(cleanId)}`);
      if (res.status === 200 && res.data) {
        const list = normList(res.data);
        if (list[0]?.streamUrl) { setCachedStream(key, list[0].streamUrl); return list[0].streamUrl; }
      }
    } catch (_) {}
  }

  // 4. If it is a JioSaavn song ID -> fetch fresh direct media URL for that exact song
  if (song.source === "saavn" || (song.id && song.id.startsWith("saavn_"))) {
    try {
      const cleanId = song.id.replace(/^saavn_/, "");
      const res = await fetch_(`${SAAVN_BASE}/api/songs/${encodeURIComponent(cleanId)}`);
      if (res.status === 200 && res.data) {
        const list = normList(res.data);
        const hit = list[0];
        if (hit && hit.streamUrl) {
          setCachedStream(key, hit.streamUrl);
          return hit.streamUrl;
        }
      }
    } catch (_) {}
  }

  // 5. For Spotify / Unknown tracks: Search Saavn with STRICT title verification
  const cleanName = cleanTrackTitle(song.name);
  const firstArtist = (song.artist || "").split(/[,&/]/)[0].trim();
  const q = `${cleanName || song.name} ${firstArtist || song.artist}`.trim();

  if (q) {
    try {
      const res = await fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent(q)}`);
      if (res.status === 200 && res.data) {
        const list = normList(res.data);
        // Find best match with accurate title verification
        const hit = list.find(candidate => isAccurateTitleMatch(cleanName || song.name, candidate.name));
        if (hit && hit.streamUrl) {
          setCachedStream(key, hit.streamUrl);
          return hit.streamUrl;
        }
      }
    } catch (_) {}
  }

  // 6. Fallback to YouTube extraction via yt-dlp
  try {
    const ytQuery = `${cleanName || song.name} ${song.artist || ""} audio`.trim();
    const url = await resolveYouTubeStream(ytQuery);
    if (url) {
      setCachedStream(key, url);
      return url;
    }
  } catch (e) {
    console.warn("[Nova Music] yt-dlp resolve failed for:", song.name, e.message);
  }

  return null;
}

/** Get multi-genre trending feeds with ultra fast loading */
async function getTrending() {
  try {
    const [hindiRes, engRes, banglaRes, animeRes] = await Promise.all([
      fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent("Latest Hindi Hits 2025")}`)
        .then(res => (res.status === 200 && res.data ? normList(res.data) : []))
        .catch(() => []),
      fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent("Top Global English Hits")}`)
        .then(res => (res.status === 200 && res.data ? normList(res.data) : []))
        .catch(() => []),
      fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent("Bangla Popular Trending Songs")}`)
        .then(res => (res.status === 200 && res.data ? normList(res.data) : []))
        .catch(() => []),
      fetch_(`${SAAVN_BASE}/api/search?query=${encodeURIComponent("Anime Japanese OST Opening")}`)
        .then(res => (res.status === 200 && res.data ? normList(res.data) : []))
        .catch(() => []),
    ]);

    const dedup = (list) => {
      const seen = new Set();
      return (list || []).filter(s => {
        if (!s || !s.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    };

    let animeList = dedup(animeRes).slice(0, 12);
    if (animeList.length < 6) {
      const ytAnime = await searchYouTube("Anime Openings OST Full", 12).catch(() => []);
      animeList = dedup([...animeList, ...ytAnime]).slice(0, 12);
    }

    let banglaList = dedup(banglaRes).slice(0, 12);
    if (banglaList.length < 6) {
      const ytBangla = await searchYouTube("Bangla Trending Songs Hits", 12).catch(() => []);
      banglaList = dedup([...banglaList, ...ytBangla]).slice(0, 12);
    }

    return {
      hindi:   dedup(hindiRes).slice(0, 12),
      english: dedup(engRes).slice(0, 12),
      anime:   animeList,
      bangla:  banglaList,
    };
  } catch (_) {
    return { hindi: [], english: [], anime: [], bangla: [] };
  }
}

/** Fetch lyrics from LRCLib (free, synced lyrics) */
async function getLyrics({ title, artist, album, duration }) {
  try {
    const cleanTitle = cleanTrackTitle(title);
    const qs = new URLSearchParams({ track_name: cleanTitle || title, artist_name: artist });
    if (album) qs.set("album_name", album);
    if (duration) qs.set("duration", String(Math.round(duration)));
    const url = `${LRCLIB}/get?${qs}`;
    const res = await fetch_(url);
    if (res.status === 200 && res.data && res.data.trackName) {
      const synced  = res.data.syncedLyrics || null;
      const plain   = res.data.plainLyrics  || null;
      return { synced, plain, found: true };
    }
  } catch (_) { /* fall through */ }
  return { synced: null, plain: null, found: false };
}

module.exports = {
  search,
  getSong,
  getAlbum,
  getPlaylist,
  getTrending,
  getLyrics,
  resolveStream,
  normSong: normSaavnSong,
};
