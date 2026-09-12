const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("installerApi", {
  minimize: () => ipcRenderer.invoke("installer:minimize"),
  close: () => ipcRenderer.invoke("installer:close"),
  getDefaultPath: () => ipcRenderer.invoke("installer:getDefaultPath"),
  selectDirectory: () => ipcRenderer.invoke("installer:selectDirectory"),
  getDriveSpace: (targetPath) => ipcRenderer.invoke("installer:getDriveSpace", targetPath),
  startInstall: (config) => ipcRenderer.invoke("installer:startInstall", config),
  finishSetup: (launchApp) => ipcRenderer.invoke("installer:finishSetup", launchApp),
  
  onProgress: (callback) => {
    ipcRenderer.on("installer:progress", (_event, data) => callback(data));
  },
  onLog: (callback) => {
    ipcRenderer.on("installer:log", (_event, msg) => callback(msg));
  }
});
