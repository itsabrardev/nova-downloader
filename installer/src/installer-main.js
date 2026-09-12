// Nova Downloader Setup — Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const {
  getDefaultInstallDir,
  getAvailableDiskSpace,
  copyDirectoryRecursive,
  createShortcut,
  registerBrowserExtension,
  registerUninstaller
} = require("./setup-engine");

let setupWindow = null;
let installedExePath = "";

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 740,
    height: 520,
    resizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: "#0b0710",
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "installer-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  setupWindow.loadFile(path.join(__dirname, "index.html"));

  setupWindow.once("ready-to-show", () => {
    setupWindow.show();
  });

  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

app.whenReady().then(() => {
  createSetupWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

// IPC Handlers
ipcMain.handle("installer:minimize", () => {
  if (setupWindow) setupWindow.minimize();
});

ipcMain.handle("installer:close", () => {
  app.quit();
});

ipcMain.handle("installer:getDefaultPath", () => {
  return getDefaultInstallDir();
});

ipcMain.handle("installer:getDriveSpace", async (_event, targetPath) => {
  return getAvailableDiskSpace(targetPath);
});

ipcMain.handle("installer:selectDirectory", async () => {
  if (!setupWindow) return null;
  const result = await dialog.showOpenDialog(setupWindow, {
    title: "Select Nova Downloader Installation Directory",
    properties: ["openDirectory", "createDirectory", "promptToCreate"]
  });
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    let chosen = result.filePaths[0];
    if (!chosen.toLowerCase().includes("nova downloader")) {
      chosen = path.join(chosen, "Nova Downloader");
    }
    return chosen;
  }
  return null;
});

function sendProgress(percent, step, status) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send("installer:progress", { percent, step, status });
  }
}

function sendLog(text, highlight = false) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send("installer:log", { text, highlight });
  }
}

function findSourcePayload() {
  const possiblePaths = [
    path.join(__dirname, "payload"),
    path.join(__dirname, "..", "payload"),
    path.join(process.resourcesPath || "", "payload"),
    path.join(__dirname, "..", "..", "release", "win-unpacked"),
    path.join(__dirname, "..", "..") // development fallback
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && (fs.existsSync(path.join(p, "Nova Downloader.exe")) || fs.existsSync(path.join(p, "electron")))) {
      return p;
    }
  }
  return path.join(__dirname, "..", "..");
}

ipcMain.handle("installer:startInstall", async (_event, config) => {
  const { targetDir, desktopShortcut, startMenuShortcut, autoExtension } = config;

  try {
    sendLog(`Starting installation to: ${targetDir}`, true);
    sendProgress(5, "Preparing environment", "Creating directories...");

    fs.mkdirSync(targetDir, { recursive: true });

    const sourceDir = findSourcePayload();
    sendLog(`Source package location: ${sourceDir}`);

    sendProgress(15, "Copying files", "Transferring application core...");

    // Check if source is a packaged electron distribution or repository
    const isUnpackedDist = fs.existsSync(path.join(sourceDir, "Nova Downloader.exe"));

    if (isUnpackedDist) {
      // Direct copy of built distribution
      copyDirectoryRecursive(sourceDir, targetDir, (filename) => {
        sendLog(`Extracted: ${filename}`);
      });
    } else {
      // Copy project structure + copy electron runtime
      const foldersToCopy = ["electron", "renderer", "assets", "bin", "ffmpeg", "extension", "node_modules"];
      const filesToCopy = ["package.json", "package-lock.json", "app.py"];

      for (let i = 0; i < foldersToCopy.length; i++) {
        const folder = foldersToCopy[i];
        const srcF = path.join(sourceDir, folder);
        if (fs.existsSync(srcF)) {
          sendProgress(20 + i * 8, `Copying ${folder}`, `Installing ${folder}...`);
          sendLog(`Installing directory: ${folder}/`);
          copyDirectoryRecursive(srcF, path.join(targetDir, folder));
        }
      }

      for (const file of filesToCopy) {
        const srcFile = path.join(sourceDir, file);
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, path.join(targetDir, file));
        }
      }
    }

    sendProgress(70, "CRX Extension Setup", "Bundling browser extension...");
    
    // Copy packed CRX into resources/ext
    const extTargetDir = path.join(targetDir, "resources", "ext");
    fs.mkdirSync(extTargetDir, { recursive: true });

    const crxSourceCandidates = [
      path.join(__dirname, "..", "dist", "nova-downloader.crx"),
      path.join(__dirname, "..", "..", "installer", "dist", "nova-downloader.crx"),
      path.join(targetDir, "installer", "dist", "nova-downloader.crx")
    ];

    for (const srcCrx of crxSourceCandidates) {
      if (fs.existsSync(srcCrx)) {
        fs.copyFileSync(srcCrx, path.join(extTargetDir, "nova-downloader.crx"));
        const infoFile = path.join(path.dirname(srcCrx), "crx-info.json");
        if (fs.existsSync(infoFile)) {
          fs.copyFileSync(infoFile, path.join(extTargetDir, "crx-info.json"));
        }
        sendLog(`Copied CRX extension to ${extTargetDir}`);
        break;
      }
    }

    // Determine target executable
    let targetExe = path.join(targetDir, "Nova Downloader.exe");
    if (!fs.existsSync(targetExe)) {
      // Check node_modules/.bin/electron or create batch launcher
      const electronExe = path.join(targetDir, "node_modules", "electron", "dist", "electron.exe");
      if (fs.existsSync(electronExe)) {
        targetExe = electronExe;
      }
    }
    installedExePath = targetExe;

    // Shortcuts
    const iconPath = path.join(targetDir, "assets", "icons", "icon.ico");

    if (desktopShortcut) {
      sendProgress(80, "Shortcuts", "Creating Desktop shortcut...");
      const desktopDir = path.join(process.env.USERPROFILE || "C:\\Users\\Public", "Desktop");
      const shortcutDest = path.join(desktopDir, "Nova Downloader.lnk");
      await createShortcut(shortcutDest, targetExe, iconPath, "Nova Downloader");
      sendLog(`Created Desktop Shortcut: ${shortcutDest}`, true);
    }

    if (startMenuShortcut) {
      sendProgress(85, "Shortcuts", "Creating Start Menu entry...");
      const appData = process.env.APPDATA || "C:\\ProgramData";
      const startMenuDir = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs");
      const shortcutDest = path.join(startMenuDir, "Nova Downloader.lnk");
      await createShortcut(shortcutDest, targetExe, iconPath, "Nova Downloader");
      sendLog(`Created Start Menu Shortcut: ${shortcutDest}`, true);
    }

    // Register Extension in Chrome & Edge
    if (autoExtension) {
      sendProgress(90, "Browser Extension", "Registering extension in Chrome & Edge...");
      await registerBrowserExtension(targetDir, sendLog);
    }

    // Uninstaller Registration
    sendProgress(95, "Finalizing", "Writing Windows configuration...");
    await registerUninstaller(targetDir, targetExe, iconPath);

    sendProgress(100, "Complete", "Nova Downloader installed successfully!");
    sendLog(`Setup finished successfully!`, true);

    return { success: true };
  } catch (err) {
    sendLog(`Error during installation: ${err.message}`, false);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("installer:finishSetup", (_event, launchApp) => {
  if (launchApp && installedExePath && fs.existsSync(installedExePath)) {
    try {
      spawn(installedExePath, [], {
        detached: true,
        stdio: "ignore",
        cwd: path.dirname(installedExePath)
      }).unref();
    } catch (_) {}
  }
  app.quit();
});
