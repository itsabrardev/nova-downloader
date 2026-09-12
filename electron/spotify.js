// Nova Music — Spotify Web API integration (PKCE + custom URI scheme)
// Redirect URI: nova-downloader://callback  (no HTTP server needed)

const https  = require("https");
const crypto = require("crypto");
const path   = require("path");
const fs     = require("fs");
const { shell, app } = require("electron");

const SPOTIFY_AUTH  = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API   = "https://api.spotify.com/v1";
const REDIRECT_URI  = "nova-downloader://callback";
const SCOPES        = "user-library-read playlist-read-private user-read-private user-read-email";

// ---------- Token storage ----------
let _tokenPath = null;
function tokenPath() {
  if (!_tokenPath) _tokenPath = path.join(app.getPath("userData"), "nova-spotify.json");
  return _tokenPath;
}
function loadTokens() {
  try { return JSON.parse(fs.readFileSync(tokenPath(), "utf8")); } catch (_) { return {}; }
}
function saveTokens(data) {
  try { fs.writeFileSync(tokenPath(), JSON.stringify(data, null, 2)); } catch (_) {}
}
function clearTokens() { try { fs.unlinkSync(tokenPath()); } catch (_) {} }

// ---------- PKCE helpers ----------
function b64url(buf) { return buf.toString("base64url"); }
function genVerifier()   { return b64url(crypto.randomBytes(32)); }
function genChallenge(v) { return b64url(crypto.createHash("sha256").update(v).digest()); }

// ---------- Pending auth state ----------
let _verifier        = null;
let _pendingResolve  = null;
let _pendingReject   = null;
let _pendingTimeout  = null;
let _pendingClientId = null;

// Called by main.js when the custom protocol URL arrives (second-instance or open-url)
function handleCallback(url) {
  if (!_pendingResolve) return;
  try {
    const raw = String(url).trim().replace(/^["']|["']$/g, "");
    const u   = new URL(raw);
    const code  = u.searchParams.get("code");
    const error = u.searchParams.get("error");
    clearTimeout(_pendingTimeout);
    const resolve = _pendingResolve;
    const reject  = _pendingReject;
    _pendingResolve = _pendingReject = null;
    if (error) reject(new Error(error));
    else if (code) resolve(code);
    else reject(new Error("No authorization code returned from Spotify callback"));
  } catch (e) {
    if (_pendingReject) { _pendingReject(e); _pendingResolve = _pendingReject = null; }
  }
}

// ---------- Login ----------
async function login(clientId) {
  _verifier        = genVerifier();
  _pendingClientId = clientId;
  const challenge  = genChallenge(_verifier);

  const params = new URLSearchParams({
    response_type: "code", client_id: clientId,
    scope: SCOPES, redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256", code_challenge: challenge,
  });

  const code = await new Promise((resolve, reject) => {
    _pendingResolve = resolve;
    _pendingReject  = reject;
    _pendingTimeout = setTimeout(() => {
      _pendingResolve = _pendingReject = null;
      reject(new Error("Login timed out after 5 minutes"));
    }, 300_000);
    shell.openExternal(`${SPOTIFY_AUTH}?${params}`);
  });

  const tokens = await exchangeCode(clientId, code);
  const stored = { ...tokens, clientId, expiry: Date.now() + ((tokens.expires_in || 3600) - 30) * 1000 };
  saveTokens(stored);

  // Fetch and store display name
  try {
    const me = await getMe();
    stored.displayName = me.display_name || me.id || "";
    stored.email       = me.email || "";
    saveTokens(stored);
  } catch (_) {}
  return stored;
}

function logout() { clearTokens(); }
function isConnected() { return !!loadTokens().refresh_token; }
function getUserInfo() { const t = loadTokens(); return { displayName: t.displayName || "", email: t.email || "" }; }

// ---------- Token management ----------
async function getAccessToken() {
  const t = loadTokens();
  if (!t.refresh_token) throw new Error("Not logged in to Spotify");
  if (t.access_token && Date.now() < (t.expiry || 0)) return t.access_token;
  return doRefresh(t.clientId, t.refresh_token);
}

async function doRefresh(clientId, refreshTok) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshTok, client_id: clientId });
  const res  = await postForm(SPOTIFY_TOKEN, body.toString());
  if (res.error) throw new Error(res.error_description || res.error);
  const t   = loadTokens();
  const upd = { ...t, access_token: res.access_token,
    expiry: Date.now() + (res.expires_in - 30) * 1000,
    refresh_token: res.refresh_token || t.refresh_token };
  saveTokens(upd);
  return res.access_token;
}

async function exchangeCode(clientId, code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code", code,
    redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: _verifier,
  });
  const res = await postForm(SPOTIFY_TOKEN, body.toString());
  if (res.error) throw new Error(res.error_description || res.error);
  return res;
}

// ---------- HTTP helpers ----------
async function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST", agent: false,
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, res => {
      let data = ""; res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (_) { resolve(data); } });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

async function apiGet(endpoint) {
  const token = await getAccessToken();
  return new Promise((resolve, reject) => {
    const u = new URL(SPOTIFY_API + endpoint);
    https.get({
      hostname: u.hostname, path: u.pathname + u.search, agent: false,
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "NovaDownloader/1.0" },
    }, res => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400 || (parsed && parsed.error)) {
            const errDetail = parsed.error?.message || parsed.error_description || (typeof parsed.error === "string" ? parsed.error : `HTTP ${res.statusCode}`);
            return reject(new Error(errDetail));
          }
          resolve(parsed);
        } catch (_) {
          if (res.statusCode >= 400) return reject(new Error(`Spotify HTTP ${res.statusCode}`));
          resolve(body);
        }
      });
    }).on("error", reject);
  });
}

// ---------- Data normalisation ----------
function normTrack(item) {
  const track = item.track || item;
  if (!track || !track.id || track.is_local) return null;
  return {
    id: `sp_${track.id}`, spotifyId: track.id,
    name:     track.name || "",
    artist:   (track.artists || []).map(a => a.name).join(", "),
    album:    track.album?.name || "",
    image:    track.album?.images?.[0]?.url || (track.images?.[0]?.url) || "",
    duration: Math.round((track.duration_ms || 0) / 1000),
    streamUrl: null,
  };
}

function normPlaylist(pl) {
  return { id: pl.id, name: pl.name, image: pl.images?.[0]?.url || "", total: pl.tracks?.total || 0, owner: pl.owner?.display_name || "" };
}

// ---------- Public API ----------
async function getMe() { return apiGet("/me"); }

async function getAllLikedSongs() {
  const all = []; let offset = 0;
  while (true) {
    const data = await apiGet(`/me/tracks?limit=50&offset=${offset}`);
    const items = (data.items || []).map(normTrack).filter(Boolean);
    all.push(...items);
    if (!data.next || all.length >= 500) break;
    offset += 50;
  }
  return all;
}

async function getPlaylists() {
  const data = await apiGet("/me/playlists?limit=50");
  return (data.items || []).map(normPlaylist);
}

async function getPlaylistTracks(playlistId) {
  const all = []; let offset = 0;
  while (true) {
    const data = await apiGet(`/playlists/${playlistId}/tracks?limit=100&offset=${offset}`);
    const items = (data.items || []).map(normTrack).filter(Boolean);
    all.push(...items);
    if (!data.next || all.length >= 500) break;
    offset += 100;
  }
  return all;
}

module.exports = { login, logout, isConnected, getUserInfo, handleCallback, getAllLikedSongs, getPlaylists, getPlaylistTracks, getMe };

