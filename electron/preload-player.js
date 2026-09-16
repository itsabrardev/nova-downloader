const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("playerApi", {
  onLoad: (cb) => ipcRenderer.on("player:load", (_e, d) => cb(d)),
});
