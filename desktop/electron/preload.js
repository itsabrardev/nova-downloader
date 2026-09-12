/* Preload: minimal, typed bridge between the React UI and the Electron shell. */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nova", {
  isElectron: true,
  minimize: () => ipcRenderer.send("window-minimize"),
  toggleMaximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  revealPath: (path) => ipcRenderer.invoke("reveal-path", path),
  setMinimizeToTray: (value) => ipcRenderer.send("set-minimize-to-tray", value),
  setClipboardMonitor: (value) => ipcRenderer.send("set-clipboard-monitor", value),
  onClipboardUrl: (callback) => ipcRenderer.on("clipboard-url", (_event, url) => callback(url)),
});
