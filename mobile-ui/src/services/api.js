// Universal API Service — Powered by JioSaavn HD Audio & OmniSave Cinema
const H5_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
const SITE_ORIGIN = 'https://videodownloader.site';

let h5Token = null;

// -------------------------------------------------------------
// Async native fetch plumbing — the old synchronous nativeFetch()
// froze the whole WebView while each HTTP call ran, so the app
// locked up whenever content loaded. The async variant runs the
// request on a Java worker thread and resolves this promise instead.
// -------------------------------------------------------------
const nativePendingFetches = new Map();
let nativeFetchSeq = 0;

window.__onNativeFetchResult = (id, res) => {
  const resolve = nativePendingFetches.get(id);
  if (resolve) {
    nativePendingFetches.delete(id);
    resolve(res);
  }
};

function bridgeFetchAsync(url, method, headers, body) {
  return new Promise((resolve) => {
    const id = ++nativeFetchSeq;
    // Safety net: if the native callback never arrives, resolve with null → fallback to fetch()
    const timer = setTimeout(() => {
      if (nativePendingFetches.has(id)) {
        nativePendingFetches.delete(id);
        resolve(null);
      }
    }, 35000);
    nativePendingFetches.set(id, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    try {
      window.AndroidBridge.nativeFetchAsync(url, method, JSON.stringify(headers), body, String(id));
    } catch (e) {
      clearTimeout(timer);
      nativePendingFetches.delete(id);
      resolve(null);
    }
  });
}

function bridgeResponse(res) {
  return {
    status: res.status || 200,
    ok: res.status >= 200 && res.status < 300,
    headers: {
      get: (name) => {
        const k = (name || '').toLowerCase();
        return (res.headers && res.headers[k]) || null;
      }
    },
    json: async () => {
      try { return JSON.parse(res.body || '{}'); } catch (_) { return {}; }
    },
    text: async () => res.body || ''
  };
}

export async function doFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};
  const body = typeof options.body === 'string' ? options.body : (options.body ? JSON.stringify(options.body) : '');
  const bridge = window.AndroidBridge;

  if (bridge && typeof bridge.nativeFetchAsync === 'function') {
    const res = await bridgeFetchAsync(url, method, headers, body);
    if (res) return bridgeResponse(res);
    console.warn('nativeFetchAsync returned no result, falling back to fetch:', url);
  } else if (bridge && typeof bridge.nativeFetch === 'function') {
    // Legacy APK path: synchronous bridge call
    try {
      const res = JSON.parse(bridge.nativeFetch(url, method, JSON.stringify(headers), body) || '{}');
      return bridgeResponse(res);
    } catch (e) {
      console.warn('nativeFetch fallback to fetch:', e);
    }
  }
  return fetch(url, options);
}

// -------------------------------------------------------------
// Pure JavaScript DES-ECB Decryptor (Zero Dependencies)
// -------------------------------------------------------------
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7
];
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25
];
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4
];
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32
];
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
  8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
  24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1
];
const SBOXES = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
  ]
];
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25
];

function permute(src, map) {
  const out = new Uint8Array(map.length);
  for (let i = 0; i < map.length; i++) {
    const bitPos = map[i] - 1;
    out[i] = (src[Math.floor(bitPos / 8)] >> (7 - (bitPos % 8))) & 1;
  }
  return out;
}

function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
  }
  return bytes;
}

function bytesToBits(bytes) {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
    }
  }
  return bits;
}

function generateSubkeys(keyBytes) {
  const pc1Bits = permute(keyBytes, PC1);
  let c = pc1Bits.slice(0, 28);
  let d = pc1Bits.slice(28, 56);

  const subkeys = [];
  for (let round = 0; round < 16; round++) {
    const s = SHIFTS[round];
    c = new Uint8Array([...c.slice(s), ...c.slice(0, s)]);
    d = new Uint8Array([...d.slice(s), ...d.slice(0, s)]);
    const cd = new Uint8Array([...c, ...d]);
    const cdBytes = bitsToBytes(cd);
    subkeys.push(permute(cdBytes, PC2));
  }
  return subkeys;
}

function desBlock(blockBytes, subkeys, decrypt = false) {
  const ipBits = permute(blockBytes, IP);
  let l = ipBits.slice(0, 32);
  let r = ipBits.slice(32, 64);
  const keys = decrypt ? [...subkeys].reverse() : subkeys;

  for (let round = 0; round < 16; round++) {
    const rBytes = bitsToBytes(r);
    const er = permute(rBytes, E);
    const k = keys[round];

    const xor = new Uint8Array(48);
    for (let i = 0; i < 48; i++) xor[i] = er[i] ^ k[i];

    const sboxOut = new Uint8Array(32);
    for (let box = 0; box < 8; box++) {
      const bBits = xor.slice(box * 6, box * 6 + 6);
      const row = (bBits[0] << 1) | bBits[5];
      const col = (bBits[1] << 3) | (bBits[2] << 2) | (bBits[3] << 1) | bBits[4];
      const val = SBOXES[box][row * 16 + col];
      for (let bit = 0; bit < 4; bit++) {
        sboxOut[box * 4 + bit] = (val >> (3 - bit)) & 1;
      }
    }

    const sboxBytes = bitsToBytes(sboxOut);
    const pBits = permute(sboxBytes, P);

    const nextL = r;
    const nextR = new Uint8Array(32);
    for (let i = 0; i < 32; i++) nextR[i] = l[i] ^ pBits[i];

    l = nextL;
    r = nextR;
  }

  const rl = new Uint8Array([...r, ...l]);
  const rlBytes = bitsToBytes(rl);
  const fpBits = permute(rlBytes, FP);
  return bitsToBytes(fpBits);
}

function decryptDES_ECB(base64Cipher, keyStr = '38346591') {
  if (!base64Cipher) return null;
  // If native Android Bridge is present, use ultra-fast native decryption
  if (window.AndroidBridge && typeof window.AndroidBridge.decryptSaavnUrl === 'function') {
    const res = window.AndroidBridge.decryptSaavnUrl(base64Cipher);
    if (res && res.startsWith('http')) return res;
  }

  try {
    const cleanB64 = base64Cipher.replace(/\s+/g, '');
    const binaryStr = atob(cleanB64);
    const cipherBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) cipherBytes[i] = binaryStr.charCodeAt(i);

    const keyBytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) keyBytes[i] = keyStr.charCodeAt(i);

    const subkeys = generateSubkeys(keyBytes);
    const decrypted = new Uint8Array(cipherBytes.length);

    for (let i = 0; i < cipherBytes.length; i += 8) {
      const block = cipherBytes.slice(i, i + 8);
      if (block.length < 8) break;
      const dec = desBlock(block, subkeys, true);
      decrypted.set(dec, i);
    }

    const padLen = decrypted[decrypted.length - 1];
    const finalBytes = padLen > 0 && padLen <= 8 ? decrypted.slice(0, decrypted.length - padLen) : decrypted;
    const url = new TextDecoder('utf-8').decode(finalBytes);
    return url ? url.replace('_96.mp4', '_320.mp4').replace('_160.mp4', '_320.mp4') : null;
  } catch (e) {
    console.error('DES Decrypt Error:', e);
    return null;
  }
}

// -------------------------------------------------------------
// Direct JioSaavn HD Audio Engine (Real 320kbps Streams)
// -------------------------------------------------------------
function cleanHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function searchSaavnTrack(query) {
  if (!query) return [];
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=10&q=${encodeURIComponent(query)}`;
    const res = await doFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    const text = await res.text();
    const data = JSON.parse(text.trim());
    const results = Array.isArray(data.results) ? data.results : [];

    const songs = [];
    for (const r of results) {
      const streamUrl = decryptDES_ECB(r.encrypted_media_url);
      if (streamUrl && streamUrl.startsWith('http')) {
        const image = (r.image || '').replace('150x150.jpg', '500x500.jpg').replace('50x50.jpg', '500x500.jpg');
        const durationSec = Number(r.duration) || 0;
        const durMin = Math.floor(durationSec / 60);
        const durRest = durationSec % 60;
        const durationStr = `${durMin}:${String(durRest).padStart(2, '0')}`;

        songs.push({
          id: r.id ? `saavn_${r.id}` : `song_${Math.random()}`,
          name: cleanHtmlEntities(r.song || r.title || 'Untitled Track'),
          artist: cleanHtmlEntities(r.singers || r.primary_artists || r.music || 'Artist'),
          album: cleanHtmlEntities(r.album || 'HD Single'),
          image: image || '',
          duration: durationStr,
          durationSec: durationSec,
          streamUrl: streamUrl,
          source: 'saavn'
        });
      }
    }
    return songs;
  } catch (err) {
    console.error('searchSaavnTrack error:', err);
    return [];
  }
}

// -------------------------------------------------------------
// Dynamic Curated Music Pools
// -------------------------------------------------------------
const CURATED_MUSIC_POOLS = {
  trending: [
    'Die With A Smile Lady Gaga Bruno Mars',
    'Deora Coke Studio Bangla Pritom Hasan',
    'Tauba Tauba Bad Newz Karan Aujla',
    'Sajni Laapataa Ladies Arijit Singh',
    'Aaj Ki Raat Stree 2 Tamannaah',
    'Husn Anuv Jain',
    'Artcell Oniket Prantor',
    'Espresso Sabrina Carpenter',
    'Shironamhin Ei Obela',
    'Birds Of A Feather Billie Eilish',
    'Dunki O Maahi Arijit Singh',
    'Illuminati Aavesham Sushin Shyam',
    'Arijit Singh Kesariya',
    'The Weeknd Blinding Lights',
    'Pritom Hasan Morey Jaak'
  ],
  bangla: [
    'Deora Coke Studio Bangla Pritom Hasan',
    'Artcell Oniket Prantor',
    'Shironamhin Ei Obela',
    'Miles Phiriye Dao',
    'Warfaze Boshe Achi',
    'Aurthohin Chaite Paro',
    'Kotha Koiyo Na Coke Studio Bangla',
    'Habib Wahid Bhalobashbo Bashbore Bondhu',
    'Pritom Hasan Morey Jaak',
    'Anupam Roy Amake Amar Moto Thakte Dao',
    'Artcell Dukkho Bilash',
    'Meghdol E Hawa',
    'Shironamhin Hasimukhe',
    'Warfaze Purnota',
    'Tahsan Premtumi'
  ],
  hindi: [
    'Tauba Tauba Bad Newz Karan Aujla',
    'Sajni Laapataa Ladies Arijit Singh',
    'Aaj Ki Raat Stree 2 Tamannaah',
    'Dunki O Maahi Arijit Singh',
    'Chaleya Jawan Arijit Singh',
    'Husn Anuv Jain',
    'Apna Bana Le Bhediya Arijit Singh',
    'Heeriye Jasleen Royal Arijit Singh',
    'Soulmate Badshah Arijit Singh',
    'Satranga Animal Arijit Singh',
    'Tum Hi Ho Aashiqui 2 Arijit Singh',
    'Kesariya Brahmastra Arijit Singh',
    'Pehle Bhi Main Animal Vishal Mishra',
    'Ve Kamleya Rocky Aur Rani',
    'Raataan Lambiyan Shershaah'
  ],
  english: [
    'Die With A Smile Lady Gaga Bruno Mars',
    'Birds Of A Feather Billie Eilish',
    'Espresso Sabrina Carpenter',
    'Please Please Please Sabrina Carpenter',
    'Blinding Lights The Weeknd',
    'Cruel Summer Taylor Swift',
    'Viva La Vida Coldplay',
    'Houdini Dua Lipa',
    'I Had Some Help Post Malone Morgan Wallen',
    'Beautiful Things Benson Boone',
    'Shape of You Ed Sheeran',
    'Starboy The Weeknd'
  ],
  anime: [
    'Gurenge LiSA Demon Slayer',
    'Blue Bird Ikimono Gakari Naruto',
    'Unravel TK from Ling Tosite Sigure',
    'Shinunoga E-Wa Fujii Kaze',
    'Suzume RADWIMPS',
    'KICK BACK Kenshi Yonezu Chainsaw Man',
    'Bling-Bang-Bang-Born Creepy Nuts',
    'Idol YOASOBI Oshi no Ko',
    'Silhouette KANA-BOON Naruto Shippuden',
    'Peace Sign Kenshi Yonezu My Hero Academia'
  ],
  lofi: [
    'Husn Anuv Jain Lofi',
    'O Maahi Arijit Singh Lofi',
    'Coke Studio Bangla Lofi',
    'Oniket Prantor Lofi',
    'Sajni Lofi Arijit Singh',
    'Deora Lofi Pritom Hasan',
    'Kesariya Lofi Arijit Singh',
    'Chaleya Lofi Jawan'
  ]
};

const musicCache = new Map();

async function fetchCuratedMusic(categoryKey = 'trending') {
  const cat = categoryKey || 'trending';
  if (musicCache.has(cat)) {
    return musicCache.get(cat);
  }

  const queries = CURATED_MUSIC_POOLS[cat] || CURATED_MUSIC_POOLS.trending;
  const trackPromises = queries.map(q => searchSaavnTrack(q));
  const resultsArray = await Promise.all(trackPromises);

  const tracks = [];
  const seenTitles = new Set();

  for (const list of resultsArray) {
    if (list && list.length > 0) {
      const top = list[0];
      const normKey = top.name.toLowerCase().trim();
      if (!seenTitles.has(normKey)) {
        seenTitles.add(normKey);
        tracks.push(top);
      }
    }
  }

  if (tracks.length > 0) {
    musicCache.set(cat, tracks);
  }
  return tracks;
}

// -------------------------------------------------------------
// Dynamic Blockbuster Movies & Anime Catalog
// -------------------------------------------------------------
const BLOCKBUSTER_POOLS = {
  popular: [
    'Deadpool & Wolverine',
    'Avengers',
    'Spider-Man',
    'Dune',
    'Demon Slayer',
    'Naruto',
    'Oppenheimer',
    'Inception',
    'Interstellar',
    'Batman',
    'Jujutsu Kaisen',
    'One Piece',
    'House of the Dragon',
    'John Wick'
  ],
  anime: [
    'Naruto',
    'One Piece',
    'Demon Slayer',
    'Jujutsu Kaisen',
    'Attack on Titan',
    'Death Note',
    'Bleach',
    'Chainsaw Man',
    'Solo Leveling',
    'Dragon Ball',
    'Tokyo Ghoul',
    'Hunter x Hunter'
  ],
  action: [
    'John Wick',
    'Avengers',
    'Fast and Furious',
    'Mission Impossible',
    'Gladiator',
    'Top Gun',
    'Mad Max',
    'Extraction'
  ],
  superhero: [
    'Spider-Man',
    'Batman',
    'Iron Man',
    'Deadpool',
    'Superman',
    'Avengers',
    'The Dark Knight',
    'Black Panther'
  ],
  scifi: [
    'Interstellar',
    'Inception',
    'Dune',
    'Avatar',
    'Matrix',
    'Blade Runner',
    'Tenet'
  ]
};

async function getH5Token(forceRefresh = false) {
  if (h5Token && !forceRefresh) return h5Token;
  try {
    const res = await doFetch(`${H5_BASE}/subject/search-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-lang': 'en',
        Origin: SITE_ORIGIN,
        Referer: `${SITE_ORIGIN}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ keyword: 'a', perPage: 1 })
    });
    const raw = res.headers.get('x-user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token) {
        h5Token = parsed.token;
        return h5Token;
      }
    }
  } catch (e) {
    console.warn('H5 token bootstrap error:', e);
  }
  return null;
}

async function fetchH5(endpoint, options = {}, retried = false) {
  const token = await getH5Token();
  const headers = {
    'x-request-lang': 'en',
    Origin: SITE_ORIGIN,
    Referer: `${SITE_ORIGIN}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await doFetch(`${H5_BASE}${endpoint}`, { ...options, headers });
    if (res.status === 401 && !retried) {
      h5Token = null;
      await getH5Token(true);
      return fetchH5(endpoint, options, true);
    }
    const data = await res.json();
    return data && data.data !== undefined ? data.data : data;
  } catch (err) {
    console.error('fetchH5 error:', err);
    throw err;
  }
}

const moviesCache = new Map();

async function searchMoviesPool(poolQueries) {
  const searchPromises = poolQueries.map(q =>
    fetchH5('/subject/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: q, page: 1, perPage: 2 })
    }).catch(() => ({ items: [] }))
  );

  const results = await Promise.all(searchPromises);
  const allItems = [];
  const seenIds = new Set();

  for (const res of results) {
    const items = Array.isArray(res?.items) ? res.items : [];
    for (const it of items) {
      if (it && it.subjectId && !seenIds.has(it.subjectId) && it.cover?.url) {
        seenIds.add(it.subjectId);
        allItems.push({
          id: String(it.subjectId || ''),
          subjectId: String(it.subjectId || ''),
          title: it.title || 'Untitled Movie',
          image: it.cover?.url || '',
          rating: it.imdbRatingValue || it.score || '8.8',
          year: it.releaseDate ? it.releaseDate.substring(0, 4) : '2024',
          subjectType: it.subjectType,
          detailPath: it.detailPath || ''
        });
      }
    }
  }
  return allItems;
}

// -------------------------------------------------------------
// Public Unified API Service
// -------------------------------------------------------------
export const api = {
  // Real Trending 320kbps Music
  async getTrending(category = 'trending') {
    return fetchCuratedMusic(category);
  },

  async getCategoryTracks(category) {
    return fetchCuratedMusic(category);
  },

  // Instant High-Fidelity Music Search (JioSaavn 320kbps Streams)
  async searchMusic(query) {
    if (!query) return [];
    return searchSaavnTrack(query);
  },

  // Dynamic Blockbuster Movies & Anime Search
  async searchMovies(keyword = 'popular') {
    const cleanKey = (keyword || 'popular').toLowerCase().trim();
    const isPool = BLOCKBUSTER_POOLS[cleanKey] || (cleanKey === 'trending' ? BLOCKBUSTER_POOLS.popular : null);

    if (isPool) {
      // Pool results are static catalog content — cache them so switching tabs or
      // typing in search doesn't re-fire the whole pool over the network.
      if (moviesCache.has(cleanKey)) {
        return moviesCache.get(cleanKey);
      }
      try {
        const allItems = await searchMoviesPool(isPool.slice(0, 8));
        if (allItems.length > 0) {
          moviesCache.set(cleanKey, allItems);
        }
        return allItems;
      } catch (e) {
        console.error('searchMovies pool error:', e);
      }
    }

    // Direct User Search Query
    try {
      const data = await fetchH5('/subject/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword || 'Avengers', page: 1, perPage: 20 })
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.map(it => ({
        id: String(it.subjectId || ''),
        subjectId: String(it.subjectId || ''),
        title: it.title || 'Untitled Movie',
        image: it.cover?.url || '',
        rating: it.imdbRatingValue || it.score || 'HD',
        year: it.releaseDate ? it.releaseDate.substring(0, 4) : '',
        subjectType: it.subjectType,
        detailPath: it.detailPath || ''
      }));
    } catch (e) {
      console.error('searchMovies error:', e);
      return [];
    }
  },

  // Movie detail & robust episodes extractor
  async getMovieDetail(detailPath) {
    if (!detailPath) return null;
    try {
      const data = await fetchH5(`/detail?detailPath=${encodeURIComponent(detailPath)}`);
      const episodes = [];
      const pushEp = (se, ep, extra) => {
        if (ep == null) return;
        episodes.push({ se: Number(se) || 1, ep: Number(ep), ...(extra || {}) });
      };

      const roots = [data, data?.resource].filter(Boolean);
      for (const root of roots) {
        const seasonLists = [root.seasonList, root.seasons].filter(Array.isArray);
        for (const seasons of seasonLists) {
          seasons.forEach((s, i) => {
            const se = Number(s.se ?? s.season ?? s.seasonNum) || i + 1;
            const eps = s.episodes || s.episodeList || s.list;
            if (Array.isArray(eps)) {
              eps.forEach((e) => {
                const ep = e && (e.ep ?? e.episode ?? e.episodeNum);
                pushEp(se, ep, e && { title: e.title || e.name || `Episode ${ep}` });
              });
            } else if (typeof s.allEp === 'string' && s.allEp) {
              const m = /^(\d+)\s*-\s*(\d+)$/.exec(s.allEp.trim());
              const from = m ? Number(m[1]) : 1;
              const to = m ? Number(m[2]) : Number(s.maxEp || 0);
              for (let e = from; e <= to; e++) pushEp(se, e, { title: `Episode ${e}` });
            } else if (Number(s.maxEp) > 0) {
              for (let e = 1; e <= Number(s.maxEp); e++) pushEp(se, e, { title: `Episode ${e}` });
            }
          });
        }
        for (const key of ['episodeList', 'episodes', 'videoList', 'videos']) {
          if (Array.isArray(root[key])) {
            root[key].forEach((e) => {
              const ep = e && (e.ep ?? e.episode ?? e.episodeNum);
              pushEp(1, ep, e && { title: e.title || e.name || `Episode ${ep}` });
            });
          }
        }
      }

      const seen = new Set();
      const unique = episodes
        .filter((e) => {
          const k = `${e.se}:${e.ep}`;
          if (seen.has(k) || !e.ep) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => a.se - b.se || a.ep - b.ep);

      return { ...data, episodes: unique };
    } catch (e) {
      console.error('getMovieDetail error:', e);
      return null;
    }
  },

  // Real Movie stream links via GET /subject/download
  async getMovieLinks(subjectId, detailPath = '', se = 0, ep = 0) {
    try {
      const params = new URLSearchParams({
        subjectId: String(subjectId || ''),
        se: String(se || 0),
        ep: String(ep || 0),
        detailPath: String(detailPath || '')
      });
      const data = await fetchH5(`/subject/download?${params.toString()}`);
      const list = data?.downloads || [];
      return list
        .filter(d => d && d.url && !d.vipLocked && !d.vip_locked)
        .map(d => ({
          quality: d.resolution ? `${d.resolution}p ${d.format || 'HD'}` : (d.quality || 'HD'),
          url: d.url || d.downloadUrl || '',
          resolution: d.resolution || 0,
          codec: d.codecName || '',
          size: d.size ? `${(Number(d.size) / (1024 * 1024)).toFixed(0)} MB` : ''
        }))
        .filter(x => !!x.url)
        .sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
    } catch (e) {
      console.error('getMovieLinks error:', e);
      return [];
    }
  }
};
