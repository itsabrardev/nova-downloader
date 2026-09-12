#!/usr/bin/env node
// Nova Downloader Setup Builder
// 1. Packs CRX browser extension
// 2. Builds app distribution package
// 3. Builds modern setup installer
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

console.log("=== [1/3] Packing Chrome & Edge Extension (CRX3) ===");
execSync("node tools/pack-crx.js", { cwd: ROOT, stdio: "inherit" });

console.log("\n=== [2/3] Building Nova Downloader App Distribution ===");
execSync("npx electron-builder --win nsis", { cwd: ROOT, stdio: "inherit" });

const releaseDir = path.join(ROOT, "release");
if (fs.existsSync(releaseDir)) {
  const files = fs.readdirSync(releaseDir);
  const setupExe = files.find(f => f.startsWith("Nova-Downloader-Setup") && f.endsWith(".exe"));
  if (setupExe) {
    const mainExeName = "Nova-Downloader-Setup.exe";
    const srcPath = path.join(releaseDir, setupExe);
    const destPath = path.join(releaseDir, mainExeName);
    if (srcPath !== destPath) {
      fs.copyFileSync(srcPath, destPath);
    }
    console.log(`\n========================================`);
    console.log(` SUCCESS: Setup Executable Ready!`);
    console.log(` Path: ${path.relative(ROOT, destPath)} (${(fs.statSync(destPath).size / (1024 * 1024)).toFixed(1)} MB)`);
    console.log(`========================================\n`);
  }
}
