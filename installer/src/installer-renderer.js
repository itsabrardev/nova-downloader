// Installer Frontend Logic
const screenConfig = document.getElementById("screenConfig");
const screenInstalling = document.getElementById("screenInstalling");
const screenComplete = document.getElementById("screenComplete");

const inputInstallPath = document.getElementById("inputInstallPath");
const btnBrowseFolder = document.getElementById("btnBrowseFolder");
const txtSpaceAvailable = document.getElementById("txtSpaceAvailable");

const chkDesktopShortcut = document.getElementById("chkDesktopShortcut");
const chkStartMenuShortcut = document.getElementById("chkStartMenuShortcut");
const chkAutoExtension = document.getElementById("chkAutoExtension");
const chkLaunchApp = document.getElementById("chkLaunchApp");

const btnStartInstall = document.getElementById("btnStartInstall");
const btnCancelConfig = document.getElementById("btnCancelConfig");
const btnFinishSetup = document.getElementById("btnFinishSetup");

const btnMinimize = document.getElementById("btnMinimize");
const btnClose = document.getElementById("btnClose");

const progressBarFill = document.getElementById("progressBarFill");
const txtInstallStatus = document.getElementById("txtInstallStatus");
const txtProgressStep = document.getElementById("txtProgressStep");
const txtProgressPercent = document.getElementById("txtProgressPercent");
const logBox = document.getElementById("logBox");

const txtFinalPath = document.getElementById("txtFinalPath");
const txtExtStatus = document.getElementById("txtExtStatus");

// Window controls
btnMinimize.addEventListener("click", () => window.installerApi.minimize());
btnClose.addEventListener("click", () => window.installerApi.close());
btnCancelConfig.addEventListener("click", () => window.installerApi.close());

function switchScreen(screen) {
  [screenConfig, screenInstalling, screenComplete].forEach((s) => s.classList.remove("active"));
  screen.classList.add("active");
}

function appendLog(message, isHighlight = false) {
  const line = document.createElement("div");
  line.className = "log-line" + (isHighlight ? " highlight" : "");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

async function updateSpace(pathToCheck) {
  try {
    const space = await window.installerApi.getDriveSpace(pathToCheck);
    if (space && space.freeGB !== undefined) {
      txtSpaceAvailable.textContent = `Available on ${space.drive}: ${space.freeGB} GB`;
    } else {
      txtSpaceAvailable.textContent = "Available: Sufficient space";
    }
  } catch (_) {
    txtSpaceAvailable.textContent = "Available: Sufficient space";
  }
}

// Initial default path
(async function init() {
  try {
    const defaultPath = await window.installerApi.getDefaultPath();
    inputInstallPath.value = defaultPath;
    await updateSpace(defaultPath);
  } catch (err) {
    inputInstallPath.value = "D:\\Nova Downloader";
  }
})();

inputInstallPath.addEventListener("input", () => {
  updateSpace(inputInstallPath.value.trim());
});

btnBrowseFolder.addEventListener("click", async () => {
  const selected = await window.installerApi.selectDirectory();
  if (selected) {
    inputInstallPath.value = selected;
    await updateSpace(selected);
  }
});

// Start Installation
btnStartInstall.addEventListener("click", async () => {
  const targetDir = inputInstallPath.value.trim();
  if (!targetDir) {
    alert("Please select a valid installation path.");
    return;
  }

  switchScreen(screenInstalling);
  appendLog(`Target installation directory: ${targetDir}`);

  const options = {
    targetDir,
    desktopShortcut: chkDesktopShortcut.checked,
    startMenuShortcut: chkStartMenuShortcut.checked,
    autoExtension: chkAutoExtension.checked
  };

  try {
    const result = await window.installerApi.startInstall(options);
    if (result && result.success) {
      txtFinalPath.textContent = targetDir;
      txtExtStatus.textContent = options.autoExtension ? "Registered (Chrome & Edge)" : "Skipped";
      switchScreen(screenComplete);
    } else {
      alert("Installation error: " + (result ? result.error : "Unknown error"));
      switchScreen(screenConfig);
    }
  } catch (err) {
    alert("Installation failed: " + (err.message || err));
    switchScreen(screenConfig);
  }
});

// Event listeners for progress from main
window.installerApi.onProgress((data) => {
  if (data.percent !== undefined) {
    progressBarFill.style.width = `${data.percent}%`;
    txtProgressPercent.textContent = `${Math.round(data.percent)}%`;
  }
  if (data.status) {
    txtInstallStatus.textContent = data.status;
  }
  if (data.step) {
    txtProgressStep.textContent = data.step;
  }
});

window.installerApi.onLog((msg) => {
  appendLog(msg.text, msg.highlight);
});

// Finish Setup
btnFinishSetup.addEventListener("click", () => {
  window.installerApi.finishSetup(chkLaunchApp.checked);
});
