// NovaDownloader Bridge — content script.
// Injects one "↓ Download" button on likely-video pages. Idempotent,
// MutationObserver-guarded, and never modifies or removes page UI.

(() => {
  "use strict";

  if (window.top !== window) return; // top frame only
  if (!/^https?:$/.test(location.protocol)) return;
  // pageinfo.js is listed before this file in the manifest, so it is always
  // present; bailing out loudly beats injecting a button that can't resolve a URL.
  if (!self.NovaPage) return;

  const MARKER = "data-nova-injected";
  const { siteOf, isDirectPost, clean: cleanUrl, POST_LINK } = self.NovaPage;

  // Which site, and does the address bar already point at one post? Both come
  // from the module the popup uses, so the button and the popup agree.
  const SITE = siteOf(location.href);
  const isDirectPage = () => isDirectPost(location.href);
  const clean = (raw) => cleanUrl(raw, location.href);

  // The <video> covering most of the viewport — on a feed that's the one playing.
  function mostVisibleVideo() {
    let best = null;
    let bestArea = 0;
    for (const video of document.querySelectorAll("video")) {
      const r = video.getBoundingClientRect();
      const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = video;
      }
    }
    return bestArea > 40000 ? best : null; // ignore thumbnails and hidden players
  }

  // A TikTok post id is a 19-digit snowflake that has begun with 7 for years
  // (7677249924475391254, 7524203120394554629 …). Anchoring on the leading 7 and
  // the exact length keeps this from matching a timestamp or a React key in some
  // unrelated attribute.
  const TT_ID = /(?:^|\D)(7\d{18})(?:\D|$)/;
  const TT_ID_ATTRS = ["id", "data-video-id", "data-id", "data-e2e-id", "aria-labelledby", "href"];

  // TikTok's feed markup is rewritten constantly, so the id is looked for in
  // several independent places instead of one selector: the player wrapper keeps
  // it in its element id (`xgwrapper-0-<id>`), other containers expose it as a
  // data attribute.
  function tiktokId(node) {
    if (!node || !node.getAttribute) return null;
    for (const name of TT_ID_ATTRS) {
      const m = TT_ID.exec(node.getAttribute(name) || "");
      if (m) return m[1];
    }
    return null;
  }

  function tiktokIdIn(scope) {
    const own = tiktokId(scope);
    if (own) return own;
    for (const node of scope.querySelectorAll("[id],[data-video-id],[data-id],a[href]")) {
      const found = tiktokId(node);
      if (found) return found;
    }
    return null;
  }

  function tiktokUser(scope) {
    for (const anchor of scope.querySelectorAll('a[href*="/@"]')) {
      const m = /\/@([\w.-]{2,})/.exec(anchor.getAttribute("href") || "");
      if (m) return m[1];
    }
    return null;
  }

  // What the button should send: the post the user is actually looking at on a
  // feed, otherwise whatever page we're on. Returns null when a feed page gives
  // no way to tell which post that is — the old code returned the bare feed URL
  // instead, which yt-dlp rejected as "Unsupported URL" and the popup reported as
  // "this page doesn't expose a downloadable video", blaming the post for a
  // detection failure.
  function targetUrl() {
    if (isDirectPage()) return clean(location.href);
    if (SITE === "other") return document.querySelector("video") ? clean(location.href) : null;

    const pattern = POST_LINK[SITE];
    if (!pattern) return null;
    const video = mostVisibleVideo();

    // Closest ancestor wins, so the anchor belongs to the post being watched
    // rather than to some neighbour further up the feed.
    for (let node = video; node && node !== document.body; node = node.parentElement) {
      for (const anchor of node.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") || "";
        if (pattern.test(href)) return clean(new URL(href, location.href).href);
      }
      // No permalink anchor in this item — TikTok often renders none in the feed.
      // Rebuild the URL from the post id instead. yt-dlp resolves a TikTok post
      // by its id, so the @handle segment is only cosmetic; it is taken from the
      // item's own subtree when present and left as `_` otherwise, rather than
      // from the page at large, where the sidebar's "following" list would supply
      // a confidently wrong name. (The `@_` placeholder is the convention other
      // tools use; not verified against this yt-dlp build.)
      if (SITE === "tiktok") {
        const id = tiktokIdIn(node);
        if (id) return `https://www.tiktok.com/@${tiktokUser(node) || "_"}/video/${id}`;
      }
    }
    return null;
  }

  function isLikelyVideoPage() {
    // YouTube's home/search pages have no single video to send.
    if (SITE === "youtube") return isDirectPage();
    // TikTok, Facebook, Instagram and X resolve the post that is on screen when
    // the button is clicked, so it's useful on a feed as well as on a post page.
    if (SITE !== "other") return true;
    // Anywhere else (Vimeo, Twitch, a random site): only when a player is really
    // on the page, otherwise the button would send a bare homepage URL.
    return document.querySelector("video") !== null;
  }

  function styleFloating(button) {
    // TikTok keeps a scrubber and its own action rail near the bottom-right;
    // sit above them so nothing important is covered.
    const bottom = SITE === "tiktok" ? 110 : 22;
    button.style.cssText = `
      position: fixed; right: 22px; bottom: ${bottom}px; z-index: 2147483646;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 18px; border-radius: 999px; cursor: pointer;
      font: 600 13px/1 "Segoe UI", system-ui, sans-serif; color: #eaf1ff;
      background: rgba(13, 20, 36, 0.82); border: 1px solid rgba(91, 140, 255, 0.55);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.04) inset;
      backdrop-filter: blur(8px); transition: transform .15s ease, border-color .15s ease;`;
    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)";
      button.style.borderColor = "rgba(91, 140, 255, 0.95)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "none";
      button.style.borderColor = "rgba(91, 140, 255, 0.55)";
    });
  }

  function styleInlineChip(button) {
    button.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; margin: 0 6px; border-radius: 18px; cursor: pointer;
      font: 600 13px/1 "Segoe UI", Roboto, sans-serif; color: #eaf1ff;
      background: rgba(13, 20, 36, 0.85); border: 1px solid rgba(91, 140, 255, 0.6);`;
  }

  function flashResult(button, ok, message) {
    const original = button.textContent;
    button.textContent = ok ? "✓ Sent" : message || "✕ Failed";
    button.style.borderColor = ok ? "rgba(63, 214, 143, 0.9)" : "rgba(255, 107, 107, 0.9)";
    setTimeout(() => {
      button.textContent = original;
      button.style.borderColor = "rgba(91, 140, 255, 0.55)";
    }, 2600);
  }

  function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    // Resolved at click time, not at injection time: on a feed the visible post
    // changes as the user scrolls.
    const url = targetUrl();
    if (!url) {
      // Saying so beats sending the feed URL and having the app report that the
      // post has no video.
      flashResult(button, false, "✕ Open the post first");
      return;
    }
    button.setAttribute(MARKER + "-busy", "1");
    chrome.runtime.sendMessage({ type: "nova-button-click", url }, (response) => {
      button.removeAttribute(MARKER + "-busy");
      if (chrome.runtime.lastError) {
        flashResult(button, false, "Extension error");
        return;
      }
      flashResult(button, !!(response && response.ok), response && response.message);
    });
  }

  function findYouTubeAnchor() {
    const selectors = [
      "#top-level-buttons-computed",
      "#actions-inner",
      "ytd-watch-metadata #actions",
    ];
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container && !container.querySelector(`[${MARKER}]`)) return container;
    }
    return null;
  }

  function inject() {
    if (!isLikelyVideoPage()) return;
    if (document.querySelector(`[${MARKER}]`)) return;

    const button = document.createElement("button");
    button.textContent = "↓ Download";
    button.setAttribute(MARKER, "1");
    button.title = "Send this page to NovaDownloader";
    button.addEventListener("click", onClick);

    const anchor = findYouTubeAnchor();
    if (anchor) {
      styleInlineChip(button);
      anchor.appendChild(button);
    } else {
      styleFloating(button);
      document.documentElement.appendChild(button);
    }
  }

  let scheduled = null;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      inject(); // no-op when the button is already present
    }, 600);
  });

  inject();
  observer.observe(document.body, { childList: true, subtree: true });

  // The popup asks which post is on screen, so it analyzes the same thing the
  // page button would send instead of the bare feed URL. `resolved: false` means
  // this is a feed and no post could be identified — the popup says so rather
  // than analyzing the feed URL and reporting a misleading failure.
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message && message.type === "nova-target-url") {
      const url = targetUrl();
      respond({ url, site: SITE, resolved: !!url });
    }
  });

  // SPA URL changes (YouTube et al.) — re-evaluate on history updates
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const existing = document.querySelector(`[${MARKER}]`);
      if (existing && !isLikelyVideoPage()) existing.remove();
      inject();
    }
  }, 1500);
})();
