// NovaDownloader Bridge — URL knowledge shared by the content script and the
// popup. Loaded by both (content_scripts list it before content.js; popup.html
// pulls it in before popup.js), so the two can never disagree about whether a
// URL already points at a single post.
//
// Pure functions over a URL string: no DOM, no chrome.* calls.

(function (root) {
  "use strict";

  const SITE_HOSTS = {
    youtube: ["youtube.com", "youtu.be"],
    tiktok: ["tiktok.com"],
    facebook: ["facebook.com", "fb.watch", "fb.com"],
    instagram: ["instagram.com"],
    twitter: ["x.com", "twitter.com"],
  };

  function parse(raw) {
    try {
      return new URL(String(raw));
    } catch (_) {
      return null;
    }
  }

  function hostOf(raw) {
    const url = parse(raw);
    if (!url) return "";
    return url.hostname.replace(/^(www|m|web|mbasic)\./i, "").toLowerCase();
  }

  // "youtube" | "tiktok" | "facebook" | "instagram" | "twitter" | "other"
  function siteOf(raw) {
    const host = hostOf(raw);
    if (!host) return "other";
    return (
      Object.keys(SITE_HOSTS).find((key) =>
        SITE_HOSTS[key].some((h) => host === h || host.endsWith("." + h))) || "other"
    );
  }

  // URLs that already *are* one post, so the address bar is the right thing to
  // send. Separate predicates rather than one regex, because Facebook keeps the
  // video id in the query string (`/watch/?v=123`) while the rest keep it in the
  // path.
  const DIRECT = {
    youtube: (u, host) =>
      /\/(watch|shorts|live|embed)\//.test(u.pathname) ||
      /[?&]v=/.test(u.search) ||
      // youtu.be/<id> normally redirects, but not always in an SPA history push.
      (host === "youtu.be" && /^\/[\w-]{6,}/.test(u.pathname)),
    tiktok: (u) => /\/(video|photo)\/\d+/.test(u.pathname) || /\/embed\/\d+/.test(u.pathname),
    facebook: (u) =>
      /\/(reel|reels)\/\d+|\/videos\/|\/share\/[vr]\//.test(u.pathname) ||
      (/\/watch/.test(u.pathname) && /[?&]v=\d+/.test(u.search)),
    instagram: (u) => /\/(reel|reels|p|tv)\/[\w-]+/.test(u.pathname),
    twitter: (u) => /\/status\/\d+/.test(u.pathname),
  };

  function isDirectPost(raw) {
    const url = parse(raw);
    if (!url) return false;
    const test = DIRECT[siteOf(raw)];
    return test ? !!test(url, hostOf(raw)) : false;
  }

  // Links that point at a single post — used to work out which item of a feed the
  // user is looking at. Kept here next to DIRECT so the two stay in step.
  const POST_LINK = {
    tiktok: /\/(video|photo)\/\d+/,
    facebook: /\/(reel|reels)\/\d+|\/videos\/\d+|\/watch\/?\?v=\d+|\/share\/[vr]\//,
    instagram: /\/(reel|reels|p|tv)\/[\w-]+/,
    twitter: /\/status\/\d+/,
  };

  // Feeds hand out URLs padded with tracking junk; yt-dlp only needs the post.
  // YouTube is left alone because `?v=` and `&t=` are meaningful there.
  function clean(raw, base) {
    const site = siteOf(raw);
    if (site === "youtube" || site === "other") return raw;
    try {
      const url = new URL(raw, base || undefined);
      const v = url.searchParams.get("v");
      url.search = "";
      url.hash = "";
      if (site === "facebook" && v && /\/watch/.test(url.pathname)) url.searchParams.set("v", v);
      return url.href;
    } catch (_) {
      return raw;
    }
  }

  root.NovaPage = { hostOf, siteOf, isDirectPost, clean, POST_LINK };
})(typeof self !== "undefined" ? self : this);
