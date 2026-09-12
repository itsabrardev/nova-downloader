// Nova Downloader — preload bridge (contextIsolated; the renderer gets no Node access)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // window
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),

  // background video
  getBackgroundVideo: () => ipcRenderer.invoke("bg:getVideo"),
  listBackgrounds: () => ipcRenderer.invoke("bg:list"),
  addBackground: () => ipcRenderer.invoke("bg:add"),
  selectBackground: (id) => ipcRenderer.invoke("bg:select", id),
  removeBackground: (id) => ipcRenderer.invoke("bg:remove", id),

  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  chooseFolder: () => ipcRenderer.invoke("settings:chooseFolder"),
  chooseBinary: (kind) => ipcRenderer.invoke("settings:chooseFile", kind),

  // media + queue
  checkDeps: () => ipcRenderer.invoke("deps:check"),
  updateYtdlp: () => ipcRenderer.invoke("deps:updateYtdlp"),
  analyze: (url) => ipcRenderer.invoke("media:analyze", url),
  enqueue: (req) => ipcRenderer.invoke("queue:enqueue", req),
  listTasks: () => ipcRenderer.invoke("queue:list"),
  taskAction: (action, id) => ipcRenderer.invoke("queue:action", { action, id }),
  pauseAll: () => ipcRenderer.send("queue:pauseAll"),
  resumeAll: () => ipcRenderer.send("queue:resumeAll"),
  clearFinished: () => ipcRenderer.send("queue:clearFinished"),

  // movies (OmniSave search → stream & download)
  searchMovies: (q) => ipcRenderer.invoke("movies:search", q),
  movieDetail: (detailPath) => ipcRenderer.invoke("movies:detail", detailPath),
  movieLinks: (args) => ipcRenderer.invoke("movies:links", args),
  movieSubtitleVtt: (url) => ipcRenderer.invoke("movies:subtitleVtt", url),
  downloadMovie: (req) => ipcRenderer.invoke("movies:download", req),

  // files
  openFolder: (p) => ipcRenderer.send("file:openFolder", p),
  openFile: (p) => ipcRenderer.send("file:open", p),

  // browser extension
  extensionInfo: () => ipcRenderer.invoke("ext:info"),
  openExtensionsPage: () => ipcRenderer.invoke("ext:openBrowserPage"),

  // events
  onTaskUpdate: (cb) => ipcRenderer.on("task:update", (_e, d) => cb(d)),
  onTaskRemoved: (cb) => ipcRenderer.on("task:removed", (_e, d) => cb(d)),
  onTaskCleared: (cb) => ipcRenderer.on("task:cleared", (_e, d) => cb(d)),
  onIncoming: (cb) => ipcRenderer.on("task:incoming", (_e, d) => cb(d)),
  onYtdlpUpdateProgress: (cb) => ipcRenderer.on("deps:updateProgress", (_e, d) => cb(d)),

  // Nova Music
  musicTrending:     ()             => ipcRenderer.invoke("music:trending"),
  musicSearch:       (q)            => ipcRenderer.invoke("music:search", q),
  musicAlbum:        (id)           => ipcRenderer.invoke("music:album", id),
  musicPlaylist:     (id)           => ipcRenderer.invoke("music:playlist", id),
  musicLyrics:       (opts)         => ipcRenderer.invoke("music:lyrics", opts),
  musicLikedGet:     ()             => ipcRenderer.invoke("music:liked:get"),
  musicLikedToggle:  (song)         => ipcRenderer.invoke("music:liked:toggle", song),
  musicLikedIs:      (id)           => ipcRenderer.invoke("music:liked:is", id),
  musicPlList:       ()             => ipcRenderer.invoke("music:pl:list"),
  musicPlGet:        (id)           => ipcRenderer.invoke("music:pl:get", id),
  musicPlCreate:     (name)         => ipcRenderer.invoke("music:pl:create", name),
  musicPlRename:     (id, name)     => ipcRenderer.invoke("music:pl:rename", id, name),
  musicPlDelete:     (id)           => ipcRenderer.invoke("music:pl:delete", id),
  musicPlAdd:        (pid, song)    => ipcRenderer.invoke("music:pl:add", pid, song),
  musicPlRemove:     (pid, songId)  => ipcRenderer.invoke("music:pl:remove", pid, songId),
  musicRecentGet:    ()             => ipcRenderer.invoke("music:recent:get"),
  musicRecentAdd:    (song)         => ipcRenderer.invoke("music:recent:add", song),
  musicResolve:      (song, forceFresh) => ipcRenderer.invoke("music:resolve", song, forceFresh),
  musicDownload:     (song)         => ipcRenderer.invoke("music:download", song),

  // Spotify
  spotifyStatus:          ()        => ipcRenderer.invoke("spotify:status"),
  spotifyLogin:           (cid)     => ipcRenderer.invoke("spotify:login", cid),
  spotifyLogout:          ()        => ipcRenderer.invoke("spotify:logout"),
  spotifyLiked:           ()        => ipcRenderer.invoke("spotify:liked"),
  spotifyPlaylists:       ()        => ipcRenderer.invoke("spotify:playlists"),
  spotifyPlaylistTracks:  (id)      => ipcRenderer.invoke("spotify:playlist:tracks", id),
  spotifyResolve:         (song)    => ipcRenderer.invoke("spotify:resolve", song),

  // Offline / Local Music
  offlineMusicList:         ()           => ipcRenderer.invoke("music:offline:list"),
  offlineMusicPickFolder:   ()           => ipcRenderer.invoke("music:offline:pickFolder"),
  offlineMusicPickFiles:    ()           => ipcRenderer.invoke("music:offline:pickFiles"),
  offlineMusicGetFolders:   ()           => ipcRenderer.invoke("music:offline:getFolders"),
  offlineMusicRemoveFolder: (folder)     => ipcRenderer.invoke("music:offline:removeFolder", folder),
  offlineMusicDelete:       (filePath)   => ipcRenderer.invoke("music:offline:delete", filePath),
  offlineMusicShow:         (filePath)   => ipcRenderer.invoke("music:offline:show", filePath),

  // ── App Auto-Update (GitHub Releases) ──────────────────────────────────────
  updateCheck:    ()  => ipcRenderer.invoke("update:check"),
  updateDownload: ()  => ipcRenderer.invoke("update:download"),
  updateInstall:  ()  => ipcRenderer.invoke("update:install"),
  getAppVersion:  ()  => ipcRenderer.invoke("update:getVersion"),

  onUpdateChecking:      (cb) => ipcRenderer.on("update:checking",      (_e, d) => cb(d)),
  onUpdateAvailable:     (cb) => ipcRenderer.on("update:available",     (_e, d) => cb(d)),
  onUpdateNotAvailable:  (cb) => ipcRenderer.on("update:not-available", (_e, d) => cb(d)),
  onUpdateProgress:      (cb) => ipcRenderer.on("update:progress",      (_e, d) => cb(d)),
  onUpdateDownloaded:    (cb) => ipcRenderer.on("update:downloaded",    (_e, d) => cb(d)),
  onUpdateError:         (cb) => ipcRenderer.on("update:error",         (_e, d) => cb(d)),
});

