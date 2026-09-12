// Nova Downloader — per-site knowledge.
// yt-dlp already supports hundreds of sites; this module only holds the few
// per-site details that change what we ask it for: filename shape, watermark
// avoidance, and whether a failure is likely a login problem.

const SITES = {
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  tiktok: { label: "TikTok", hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"] },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.watch", "fb.com", "m.facebook.com"] },
  instagram: { label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  twitter: { label: "X / Twitter", hosts: ["x.com", "twitter.com", "t.co"] },
};

// Sites whose posts carry a caption instead of a title: the "title" yt-dlp
// reports is the whole caption (emoji, hashtags, newlines) and repeats across
// posts, so those files need trimming and a unique id to avoid collisions.
const CAPTION_SITES = ["tiktok", "facebook", "instagram", "twitter"];

// Sites where a failure is usually "you are not logged in" rather than
// "this link is unsupported".
const LOGIN_SITES = ["facebook", "instagram", "twitter"];

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch (_) {
    return "";
  }
}

// "tiktok" | "facebook" | … | "generic"
function detectSite(url) {
  const host = hostOf(url);
  if (!host) return "generic";
  for (const [key, site] of Object.entries(SITES)) {
    if (site.hosts.some((h) => host === h || host.endsWith("." + h))) return key;
  }
  return "generic";
}

function siteLabel(site) {
  return SITES[site] ? SITES[site].label : "";
}

const isCaptionSite = (site) => CAPTION_SITES.includes(site);
const isLoginSite = (site) => LOGIN_SITES.includes(site);

// Filename template, relative to the download folder.
//   YouTube/generic:  Some Video Title.mp4
//   TikTok/FB/IG/X:   username - first bit of the caption [postid].mp4
// `%(a,b)s` is yt-dlp's "first field that exists" syntax; `.80B` truncates to
// 80 *bytes*, which keeps multi-byte captions from blowing the path limit.
function outputTemplate(site) {
  if (isCaptionSite(site)) return "%(uploader,channel,uploader_id,id)s - %(title,description).80B [%(id)s].%(ext)s";
  return "%(title).150B.%(ext)s";
}

// TikTok publishes the watermarked copy as an ordinary format, so it has to be
// excluded by hand. Three checks, because the label depends on which TikTok API
// the extractor reached: the mobile API tags it `format_note: watermarked`,
// while the web path exposes it as the format id `download` — which contains no
// "watermark" substring at all, hence the exact-id check. `!*=?` / `!=?` mean
// "does not match, and formats missing the field still pass"; without the `?`
// every format without that field would be dropped and nothing would be left.
const WATERMARK_FILTER = "[format_note!*=?watermark][format_id!=?download][format_id!*=?watermark]";

// Whether a clean copy is being *required* for this download.
function skipWatermark(site, settings) {
  return site === "tiktok" && settings.tiktokNoWatermark !== false;
}

// The format-selector fragment. Note that `selector()` in engine.js carries this
// through *every* branch including the last one, with no unfiltered fallback:
// when the user asks for a clean copy, quietly handing them the stamped video
// instead is worse than failing with an explanation.
function videoFilter(site, settings) {
  return skipWatermark(site, settings) ? WATERMARK_FILTER : "";
}

// Same rule as WATERMARK_FILTER, applied to a `-J` format entry. Used so the
// quality list only offers heights a clean download can actually deliver.
function isWatermarked(format) {
  const note = String((format && format.format_note) || "").toLowerCase();
  const id = String((format && format.format_id) || "").toLowerCase();
  return note.includes("watermark") || id === "download" || id.includes("watermark");
}

// Extra flags that apply to both `analyze` and `download`.
function commonArgs(site, settings) {
  const args = [];
  const browser = String(settings.cookiesFromBrowser || "").trim();
  if (browser) args.push("--cookies-from-browser", browser);
  // Facebook/Instagram reject requests that don't look like they came from the
  // site itself on some video URLs.
  if (site === "facebook" || site === "instagram") args.push("--referer", `https://www.${site}.com/`);
  return args;
}

// TikTok's default extraction route scrapes the web page, and TikTok changes
// that page every few months — which is why a link fails with "Unexpected
// response from webpage request" while nothing at all is wrong with the link.
// yt-dlp keeps a second route: TikTok's own mobile app API. Its docs are
// explicit that this route is *enabled* by passing `device_id` or `app_info`;
// `api_hostname` alone only chooses which host the mobile calls go to, so
// passing it by itself does nothing. A random 19-digit device id is exactly what
// yt-dlp generates by default, so making one here identifies nobody.
//
// Several hosts are tried because they are regional front ends and a given one
// can be unreachable, rate-limited or blocked by an ISP while another answers
// normally. Order: US East (the value yt-dlp's own docs use), Singapore (closest
// for South/South-East Asia), then a second US host.
//
// These are fallbacks, not the default: the web route returns richer metadata and
// works most of the time. Only used after the normal attempt fails.
const TIKTOK_API_HOSTS = [
  "api22-normal-c-useast2a.tiktokv.com",
  "api22-normal-c-alisg.tiktokv.com",
  "api16-normal-c-useast1a.tiktokv.com",
];
const TIKTOK_API_HOST = TIKTOK_API_HOSTS[0];

function randomDeviceId() {
  let id = String(1 + Math.floor(Math.random() * 9)); // no leading zero
  for (let i = 0; i < 18; i++) id += Math.floor(Math.random() * 10);
  return id;
}

// Alternative extraction routes for `site`, in the order they should be tried,
// as arrays of extra yt-dlp args. `[]` when the site has no alternative route.
// ARGS syntax is `KEY:ARG=VAL;ARG=VAL`.
function fallbackRoutes(site) {
  if (site !== "tiktok") return [];
  return TIKTOK_API_HOSTS.map((host) => [
    "--extractor-args",
    `tiktok:api_hostname=${host};device_id=${randomDeviceId()}`,
  ]);
}

// A short label for one of those routes, for the "show yt-dlp output" panel:
// three near-identical stderr blocks are useless without knowing which host
// produced which.
function routeLabel(args) {
  const m = /api_hostname=([^;\s]+)/.exec(args.join(" "));
  return m ? `mobile API via ${m[1]}` : "alternative route";
}

module.exports = {
  SITES, detectSite, siteLabel, isCaptionSite, isLoginSite,
  outputTemplate, videoFilter, skipWatermark, isWatermarked, commonArgs,
  fallbackRoutes, routeLabel, TIKTOK_API_HOST, TIKTOK_API_HOSTS,
};
