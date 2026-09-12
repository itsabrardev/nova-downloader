// Nova Music — local persistence (userData/nova-music.json)
// Stores: liked songs, playlists, recently played (up to 50).

const fs   = require("fs");
const path = require("path");
const { app } = require("electron");

let _dataPath = null;
function dataPath() {
  if (!_dataPath) _dataPath = path.join(app.getPath("userData"), "nova-music.json");
  return _dataPath;
}

const DEFAULT = () => ({ liked: [], playlists: [], recent: [], localFolders: [] });

function load() {
  try { return { ...DEFAULT(), ...JSON.parse(fs.readFileSync(dataPath(), "utf8")) }; }
  catch (_) { return DEFAULT(); }
}

function save(data) {
  try { fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2)); } catch (_) {}
}

// ---------- Local Music Folders ----------
function getLocalFolders() {
  const data = load();
  return Array.isArray(data.localFolders) ? data.localFolders : [];
}

function addLocalFolder(folderPath) {
  if (!folderPath) return false;
  const data = load();
  if (!Array.isArray(data.localFolders)) data.localFolders = [];
  if (!data.localFolders.includes(folderPath)) {
    data.localFolders.push(folderPath);
    save(data);
    return true;
  }
  return false;
}

function removeLocalFolder(folderPath) {
  const data = load();
  if (!Array.isArray(data.localFolders)) return false;
  data.localFolders = data.localFolders.filter(f => f !== folderPath);
  save(data);
  return true;
}

// ---------- Liked Songs ----------
function getLiked() { return load().liked; }

function toggleLike(song) {
  const data = load();
  const idx  = data.liked.findIndex(s => s.id === song.id);
  if (idx >= 0) data.liked.splice(idx, 1);
  else data.liked.unshift(song);
  save(data);
  return idx < 0; // true = now liked
}

function isLiked(songId) { return load().liked.some(s => s.id === songId); }

// ---------- Playlists ----------
function newId() { return String(Date.now() + Math.random()).replace(".", ""); }

function getPlaylists() { return load().playlists; }
function getPlaylist(id) { return load().playlists.find(p => p.id === id) || null; }

function createPlaylist(name) {
  const data = load();
  const pl   = { id: newId(), name, songs: [], createdAt: Date.now() };
  data.playlists.push(pl);
  save(data);
  return pl;
}

function renamePlaylist(id, name) {
  const data = load();
  const pl   = data.playlists.find(p => p.id === id);
  if (!pl) return false;
  pl.name = name;
  save(data);
  return true;
}

function deletePlaylist(id) {
  const data = load();
  data.playlists = data.playlists.filter(p => p.id !== id);
  save(data);
}

function addToPlaylist(playlistId, song) {
  const data = load();
  const pl   = data.playlists.find(p => p.id === playlistId);
  if (!pl) return false;
  if (!pl.songs.find(s => s.id === song.id)) pl.songs.push(song);
  save(data);
  return true;
}

function removeFromPlaylist(playlistId, songId) {
  const data = load();
  const pl   = data.playlists.find(p => p.id === playlistId);
  if (!pl) return false;
  pl.songs = pl.songs.filter(s => s.id !== songId);
  save(data);
  return true;
}

// ---------- Recently Played ----------
function getRecent() { return load().recent; }

function addRecent(song) {
  const data = load();
  data.recent = [song, ...data.recent.filter(s => s.id !== song.id)].slice(0, 50);
  save(data);
}

module.exports = {
  getLiked, toggleLike, isLiked,
  getPlaylists, getPlaylist, createPlaylist, renamePlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist,
  getRecent, addRecent,
  getLocalFolders, addLocalFolder, removeLocalFolder,
};
