// Nova Downloader — OmniSave (videodownloader.site) integration.
//
// OmniSave is a search-first movie/TV/anime downloader: you search a title, it
// returns subjects with direct MP4 download links plus subtitle files. The
// public site talks to `h5-api.aoneroom.com`, and every call wants a Bearer
// token. Anonymous visitors get a guest token issued in the `x-user` response
// header of the (otherwise auth-free) search-suggest endpoint, so this module
// bootstraps one on first use and keeps it in userData. The token is a JWT
// valid for ~90 days; on a 401 it is thrown away and re-issued once.
//
// The download links themselves are time-limited: each MP4/subtitle URL
// carries `sign` + `t` query params that expire a few minutes after they are
// minted, so links are fetched right before a download is enqueued, never
// cached.

const fs = require("fs");
const path = require("path");

const API_BASE = "https://h5-api.aoneroom.com";
const SITE_ORIGIN = "https://videodownloader.site";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// subjectType values the API filters on (from the search response `counts`).
const SUBJECT_TYPES = { all: 0, series: 2, movie: 1 };

function baseHeaders() {
  return {
    "User-Agent": BROWSER_UA,
    "x-request-lang": "en",
    Origin: SITE_ORIGIN,
    Referer: SITE_ORIGIN + "/",
  };
}

class OmniSave {
  constructor(dataDir) {
    this.tokenFile = dataDir ? path.join(dataDir, "omnisave-token.json") : null;
    this.token = this.loadToken();
  }

  loadToken() {
    if (!this.tokenFile) return null;
    try {
      return JSON.parse(fs.readFileSync(this.tokenFile, "utf8")).token || null;
    } catch (_) {
      return null;
    }
  }

  saveToken(token) {
    this.token = token;
    if (!this.tokenFile) return;
    try {
      fs.writeFileSync(this.tokenFile, JSON.stringify({ token }));
    } catch (_) {
      /* best effort — a lost token just means one extra bootstrap call */
    }
  }

  // The one endpoint that answers without auth — and hands back a guest token
  // in the `x-user` header, exactly like the website does on a cold visit.
  async bootstrapToken() {
    const res = await fetch(`${API_BASE}/wefeed-h5api-bff/subject/search-suggest`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "a", perPage: 1 }),
    });
    const raw = res.headers.get("x-user");
    if (!raw) throw new Error("OmniSave did not issue a guest token.");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      throw new Error("OmniSave guest token was malformed.");
    }
    if (!parsed || !parsed.token) throw new Error("OmniSave guest token was empty.");
    this.saveToken(parsed.token);
    return parsed.token;
  }

  async ensureToken() {
    return this.token || this.bootstrapToken();
  }

  // Authenticated call with a single automatic retry after re-bootstrapping:
  // an expired guest token should cost the user nothing.
  async call(pathname, { method = "GET", body } = {}, retried = false) {
    const token = await this.ensureToken();
    const res = await fetch(API_BASE + pathname, {
      method,
      headers: {
        ...baseHeaders(),
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      this.token = null;
      if (this.tokenFile) {
        try { fs.unlinkSync(this.tokenFile); } catch (_) {}
      }
      return this.call(pathname, { method, body }, true);
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j && j.message) msg = j.message;
      } catch (_) {}
      throw new Error(`OmniSave API: ${msg}`);
    }
    const json = await res.json();
    if (json && typeof json.code === "number" && json.code !== 0) {
      throw new Error(`OmniSave API: ${json.message || "error " + json.code}`);
    }
    return json && json.data !== undefined ? json.data : json;
  }

  async search(keyword, { page = 1, perPage = 20, subjectType } = {}) {
    const body = { keyword: String(keyword).trim(), page, perPage };
    const t = SUBJECT_TYPES[subjectType];
    if (t) body.subjectType = t;
    const data = await this.call("/wefeed-h5api-bff/subject/search", {
      method: "POST",
      body,
    });
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      results: items.map((it) => ({
        subjectId: String(it.subjectId || ""),
        subjectType: it.subjectType, // 1 movie, 2 series
        title: it.title || "Untitled",
        description: it.description || "",
        releaseDate: it.releaseDate || "",
        duration: it.duration || 0,
        genre: it.genre || "",
        country: it.countryName || "",
        imdb: it.imdbRatingValue || "",
        cover: (it.cover && it.cover.url) || "",
        subtitles: it.subtitles || "",
        hasResource: !!it.hasResource,
        detailPath: it.detailPath || "",
      })),
      pager: data.pager || {},
    };
  }

  async detail(detailPath) {
    const data = await this.call(
      `/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(detailPath)}`
    );
    const subject = data && data.subject ? data.subject
      : data && data.subjectId ? data : null;
    if (!subject) throw new Error("OmniSave: no subject in detail response.");

    // Episode lists arrive in several shapes (seasonList / resource.seasons /
    // flat episodeList); the site's own client tolerates all of them, so this
    // mirrors that tolerance instead of betting on one shape.
    const episodes = [];
    const pushEp = (se, ep, extra) => {
      if (ep == null) return;
      episodes.push({ se: Number(se) || 1, ep: Number(ep), ...(extra || {}) });
    };
    const roots = [data, data.resource].filter(Boolean);
    for (const root of roots) {
      const seasonLists = [root.seasonList, root.seasons].filter(Array.isArray);
      for (const seasons of seasonLists) {
        seasons.forEach((s, i) => {
          const se = Number(s.se ?? s.season ?? s.seasonNum) || i + 1;
          const eps = s.episodes || s.episodeList || s.list;
          if (Array.isArray(eps)) {
            eps.forEach((e) => {
              const ep = e && (e.ep ?? e.episode ?? e.episodeNum);
              pushEp(se, ep, e && { title: e.title || e.name || "" });
            });
          } else if (typeof s.allEp === "string" && s.allEp) {
            // "1-24" style ranges.
            const m = /^(\d+)\s*-\s*(\d+)$/.exec(s.allEp.trim());
            const from = m ? Number(m[1]) : 1;
            const to = m ? Number(m[2]) : Number(s.maxEp || 0);
            for (let e = from; e <= to; e++) pushEp(se, e);
          } else if (Number(s.maxEp) > 0) {
            // The common series shape: just a season number and an episode
            // count ({se:1, maxEp:24}), no per-episode records at all.
            for (let e = 1; e <= Number(s.maxEp); e++) pushEp(se, e);
          }
        });
      }
      for (const key of ["episodeList", "episodes", "videoList", "videos"]) {
        if (Array.isArray(root[key])) {
          root[key].forEach((e) => {
            const ep = e && (e.ep ?? e.episode ?? e.episodeNum);
            pushEp(1, ep, e && { title: e.title || e.name || "" });
          });
        }
      }
    }
    const seen = new Set();
    const unique = episodes
      .filter((e) => {
        const k = `${e.se}:${e.ep}`;
        if (seen.has(k) || !e.ep) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.se - b.se || a.ep - b.ep);

    return {
      subject: {
        subjectId: String(subject.subjectId || ""),
        subjectType: subject.subjectType,
        title: subject.title || "Untitled",
        description: subject.description || "",
        releaseDate: subject.releaseDate || "",
        genre: subject.genre || "",
        country: subject.countryName || "",
        imdb: subject.imdbRatingValue || "",
        cover: (subject.cover && subject.cover.url) || "",
        subtitles: subject.subtitles || "",
        hasResource: !!subject.hasResource,
        detailPath: subject.detailPath || detailPath,
      },
      episodes: unique,
    };
  }

  // Download links for a subject, or for one se/ep of a series. Links expire
  // within minutes, so call this only when a download is about to start.
  async downloadLinks({ subjectId, detailPath, se = 0, ep = 0 }) {
    const q = new URLSearchParams({
      subjectId: String(subjectId),
      se: String(se),
      ep: String(ep),
      detailPath: String(detailPath || ""),
    });
    const data = await this.call(`/wefeed-h5api-bff/subject/download?${q}`);
    return {
      downloads: (Array.isArray(data.downloads) ? data.downloads : [])
        .filter((d) => d && d.url && !d.vipLocked && !d.vip_locked)
        .map((d) => ({
          id: String(d.id || ""),
          url: d.url,
          resolution: d.resolution || 0, // 360 / 480 / 1080
          size: Number(d.size) || 0,
          format: d.format || "MP4",
          codec: d.codecName || "",
        }))
        .sort((a, b) => b.resolution - a.resolution),
      vipResolutions: (Array.isArray(data.downloads) ? data.downloads : [])
        .filter((d) => d && (d.vipLocked || d.vip_locked) && d.resolution)
        .map((d) => d.resolution),
      captions: (Array.isArray(data.captions) ? data.captions : []).map((c) => ({
        id: String(c.id || ""),
        lan: c.lan || "",
        lanName: c.lanName || c.lan || "",
        url: c.url || "",
        size: Number(c.size) || 0,
      })),
      hasResource: !!(data && data.hasResource),
    };
  }
}

module.exports = { OmniSave, API_BASE, SITE_ORIGIN, BROWSER_UA };
