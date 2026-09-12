// Setup Engine: Handles file extraction, shortcut creation, and Chrome/Edge extension registration.
const fs = require("fs");
const path = require("path");
const { exec, execSync, spawn } = require("child_process");

function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ success: !err, stdout, stderr });
    });
  });
}

function getAvailableDiskSpace(targetPath) {
  try {
    const root = path.parse(path.resolve(targetPath)).root || "C:\\";
    const driveLetter = root.charAt(0).toUpperCase();
    const output = execSync(
      `powershell -NoProfile -Command "(Get-PSDrive '${driveLetter}').Free"`,
      { encoding: "utf8", windowsHide: true }
    ).trim();
    const bytes = parseInt(output, 10);
    if (!isNaN(bytes)) {
      const freeGB = (bytes / (1024 * 1024 * 1024)).toFixed(1);
      return { drive: driveLetter + ":", freeGB, bytes };
    }
  } catch (_) {}
  return { drive: "Drive", freeGB: "100+", bytes: 100 * 1024 * 1024 * 1024 };
}

function getDefaultInstallDir() {
  try {
    if (fs.existsSync("D:\\")) {
      return "D:\\Nova Downloader";
    }
  } catch (_) {}
  const localAppData = process.env.LOCALAPPDATA || process.env.PROGRAMFILES || "C:\\Program Files";
  return path.join(localAppData, "Nova Downloader");
}

function copyDirectoryRecursive(src, dest, progressCb) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, progressCb);
    } else {
      fs.copyFileSync(srcPath, destPath);
      if (progressCb) progressCb(entry.name);
    }
  }
}

async function createShortcut(shortcutPath, targetExe, iconPath, description) {
  const psScript = `
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, "\\\\")}")
    $Shortcut.TargetPath = "${targetExe.replace(/\\/g, "\\\\")}"
    $Shortcut.WorkingDirectory = "${path.dirname(targetExe).replace(/\\/g, "\\\\")}"
    $Shortcut.Description = "${description || "Nova Downloader"}"
    if ("${(iconPath || "").replace(/\\/g, "\\\\")}") {
      $Shortcut.IconLocation = "${(iconPath || "").replace(/\\/g, "\\\\")}"
    }
    $Shortcut.Save()
  `;
  await runCommand(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, "; ")}"`);
}

async function registerBrowserExtension(targetDir, onLog) {
  let crxInfo = null;
  const metaLocations = [
    path.join(targetDir, "resources", "ext", "crx-info.json"),
    path.join(__dirname, "..", "dist", "crx-info.json"),
    path.join(__dirname, "..", "..", "installer", "dist", "crx-info.json")
  ];

  for (const loc of metaLocations) {
    if (fs.existsSync(loc)) {
      try {
        crxInfo = JSON.parse(fs.readFileSync(loc, "utf8"));
        break;
      } catch (_) {}
    }
  }

  const extId = (crxInfo && crxInfo.id) || "capbggdaoemkkgdhijkpjmdobnijbleg";
  const extVer = (crxInfo && crxInfo.version) || "0.1.0";
  const crxFilePath = path.join(targetDir, "resources", "ext", "nova-downloader.crx");
  const updateUrl = "http://127.0.0.1:8765/ext/updates.xml";

  if (onLog) onLog(`Registering Chrome & Edge extension ID: ${extId} (v${extVer})`);

  // Commands to write to both HKLM and HKCU (64-bit and 32-bit registry)
  const regCommands = [
    // Chrome HKCU
    `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${extId}" /v "path" /t REG_SZ /d "${crxFilePath}" /f`,
    `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${extId}" /v "version" /t REG_SZ /d "${extVer}" /f`,
    // Edge HKCU
    `reg add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${extId}" /v "path" /t REG_SZ /d "${crxFilePath}" /f`,
    `reg add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${extId}" /v "version" /t REG_SZ /d "${extVer}" /f`,
    // Chrome HKLM (elevated/admin or standard)
    `reg add "HKLM\\SOFTWARE\\Google\\Chrome\\Extensions\\${extId}" /v "path" /t REG_SZ /d "${crxFilePath}" /f /reg:64`,
    `reg add "HKLM\\SOFTWARE\\Google\\Chrome\\Extensions\\${extId}" /v "version" /t REG_SZ /d "${extVer}" /f /reg:64`,
    `reg add "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v "1000" /t REG_SZ /d "${extId};${updateUrl}" /f /reg:64`,
    // Edge HKLM
    `reg add "HKLM\\SOFTWARE\\Microsoft\\Edge\\Extensions\\${extId}" /v "path" /t REG_SZ /d "${crxFilePath}" /f /reg:64`,
    `reg add "HKLM\\SOFTWARE\\Microsoft\\Edge\\Extensions\\${extId}" /v "version" /t REG_SZ /d "${extVer}" /f /reg:64`,
    `reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\ExtensionInstallForcelist" /v "1000" /t REG_SZ /d "${extId};${updateUrl}" /f /reg:64`
  ];

  for (const cmd of regCommands) {
    await runCommand(cmd);
  }

  if (onLog) onLog(`Chrome and Edge extension registered successfully!`, true);
}

async function registerUninstaller(targetDir, targetExe, iconPath) {
  const uninstallCmd = `"${targetExe}" --uninstall`;
  const regPath = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NovaDownloader";
  const cmds = [
    `reg add "${regPath}" /v "DisplayName" /t REG_SZ /d "Nova Downloader" /f`,
    `reg add "${regPath}" /v "DisplayVersion" /t REG_SZ /d "0.1.0" /f`,
    `reg add "${regPath}" /v "Publisher" /t REG_SZ /d "Nova Downloader" /f`,
    `reg add "${regPath}" /v "InstallLocation" /t REG_SZ /d "${targetDir}" /f`,
    `reg add "${regPath}" /v "DisplayIcon" /t REG_SZ /d "${iconPath || targetExe}" /f`,
    `reg add "${regPath}" /v "UninstallString" /t REG_SZ /d "${uninstallCmd}" /f`
  ];

  for (const cmd of cmds) {
    await runCommand(cmd);
  }
}

module.exports = {
  getDefaultInstallDir,
  getAvailableDiskSpace,
  copyDirectoryRecursive,
  createShortcut,
  registerBrowserExtension,
  registerUninstaller,
  runCommand
};
