#!/usr/bin/env node
// Packs extension/ into a signed CRX3 so the installer can hand Chrome a real
// extension file instead of asking the user to load an unpacked folder.
//
// Deliberately dependency-free: a ZIP writer, a CRX3 container and the id
// derivation are ~150 lines between them, and adding a build dependency to a
// project that currently has exactly one (electron) costs more than it saves.
//
// Outputs, all under installer/dist/:
//   nova-downloader.crx  the signed extension
//   crx-info.json        { id, version } — read at runtime to serve updates.xml
//   crx-id.nsh           !define for the NSIS script (Chrome policy needs the id)
// The signing key lives at installer/extension-key.pem and is generated once.
// KEEP THAT FILE. It is what makes the extension id stable across builds — a new
// key means a new id, which means Chrome treats it as a different extension.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "extension");
const OUT = path.join(ROOT, "installer", "dist");
const KEY = path.join(ROOT, "installer", "extension-key.pem");

// ---------- ZIP (deflate, no external tools) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    // Nothing generated or version-control-only belongs in a shipped extension.
    if (entry.name === ".gitkeep" || entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else if (entry.isFile()) out.push({ full, rel });
  }
  return out;
}

// Minimal ZIP writer: local headers + central directory + EOCD, all stored with
// method 8 (deflate). No zip64, no data descriptors — an extension is small.
function zipDir(dir) {
  const files = walk(dir);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.full);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const name = Buffer.from(file.rel, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1 Jan 1996 — fixed, so builds are reproducible)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + deflated.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return { zip: Buffer.concat([...locals, centralBuf, eocd]), count: files.length };
}

// ---------- CRX3 ----------
// A CRX3 file is "Cr24" + version 3 + a length-prefixed protobuf header + the
// zip. The header carries the RSA public key, a signature, and a SignedData
// message holding the 16-byte extension id.
function varint(value) {
  const bytes = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function field(fieldNumber, payload) {
  return Buffer.concat([varint((fieldNumber << 3) | 2), varint(payload.length), payload]);
}

function loadKey() {
  if (fs.existsSync(KEY)) return crypto.createPrivateKey(fs.readFileSync(KEY));
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.mkdirSync(path.dirname(KEY), { recursive: true });
  fs.writeFileSync(KEY, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`generated a new signing key at ${path.relative(ROOT, KEY)} — keep it, it fixes the extension id`);
  return crypto.createPrivateKey(fs.readFileSync(KEY));
}

// Chrome's id is the first 16 bytes of SHA-256 over the DER public key, hex
// digits remapped from 0-9a-f onto a-p. Those same 16 bytes are the `crx_id`
// inside the file's SignedData block, so both come out of one call.
function extensionId(spki) {
  const bytes = crypto.createHash("sha256").update(spki).digest().subarray(0, 16);
  const id = [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  return { id, bytes };
}

function main() {
  const manifestPath = path.join(SRC, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const privateKey = loadKey();
  const spki = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const { id, bytes: idBytes } = extensionId(spki);

  // Pinning `key` in the manifest makes an unpacked load use the same id as the
  // packed build, so Chrome's policy entry matches either way and a developer
  // reload doesn't produce a second, silently-different extension.
  const b64 = spki.toString("base64");
  if (manifest.key !== b64) {
    manifest.key = b64;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("wrote the public key into extension/manifest.json (pins the extension id)");
  }

  const { zip, count } = zipDir(SRC);

  const signedData = field(1, idBytes);

  // The signature covers a domain-separated prefix, the SignedData block and the
  // zip — not the header, which contains the signature itself.
  const signer = crypto.createSign("sha256");
  signer.update(Buffer.from("CRX3 SignedData\x00", "binary"));
  const lengthLE = Buffer.alloc(4);
  lengthLE.writeUInt32LE(signedData.length, 0);
  signer.update(lengthLE);
  signer.update(signedData);
  signer.update(zip);
  const signature = signer.sign(privateKey);

  const proof = Buffer.concat([field(1, spki), field(2, signature)]);
  const header = Buffer.concat([field(2, proof), field(10000, signedData)]);

  const magic = Buffer.alloc(12);
  magic.write("Cr24", 0, "ascii");
  magic.writeUInt32LE(3, 4);
  magic.writeUInt32LE(header.length, 8);

  fs.mkdirSync(OUT, { recursive: true });
  const crxPath = path.join(OUT, "nova-downloader.crx");
  fs.writeFileSync(crxPath, Buffer.concat([magic, header, zip]));
  fs.writeFileSync(path.join(OUT, "crx-info.json"),
    `${JSON.stringify({ id, version: manifest.version, file: "nova-downloader.crx" }, null, 2)}\n`);
  // The NSIS script needs both at compile time: the id names the extension in
  // Chrome's policy value, and the version is what the external-install registry
  // key must report for Chrome to accept the package it points at.
  fs.writeFileSync(path.join(OUT, "crx-id.nsh"),
    `!define NOVA_EXT_ID "${id}"\n!define NOVA_EXT_VERSION "${manifest.version}"\n`);

  console.log(`packed ${count} files → ${path.relative(ROOT, crxPath)}`);
  console.log(`extension id: ${id}`);
}

main();
