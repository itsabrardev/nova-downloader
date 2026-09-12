// Local storage service for Liked Songs & Smart Personalization Engine
const LIKED_KEY = 'nova_liked_songs';
const HISTORY_KEY = 'nova_play_history';
const PREFS_KEY = 'nova_user_prefs';

export function getLikedSongs() {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveLikedSongs(songs) {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(songs || []));
  } catch (_) {}
}

export function isSongLiked(song, likedList = null) {
  if (!song) return false;
  const list = likedList || getLikedSongs();
  return list.some(s => (s.id && song.id && s.id === song.id) || (s.name === song.name && s.artist === song.artist));
}

export function toggleLikeSong(song) {
  if (!song) return { isLiked: false, updatedList: [] };
  const list = getLikedSongs();
  const idx = list.findIndex(s => (s.id && song.id && s.id === song.id) || (s.name === song.name && s.artist === song.artist));
  let isLiked = false;

  if (idx >= 0) {
    list.splice(idx, 1);
    isLiked = false;
  } else {
    list.unshift({
      id: song.id || `liked_${Date.now()}`,
      name: song.name || 'Unknown Track',
      artist: song.artist || 'Artist',
      image: song.image || '',
      streamUrl: song.streamUrl || '',
      duration: song.duration || 0,
      isOffline: !!song.isOffline,
      filePath: song.filePath || ''
    });
    isLiked = true;
    recordActivity(song, 'music');
  }

  saveLikedSongs(list);
  return { isLiked, updatedList: list };
}

// -------------------------------------------------------------
// Smart Personalization & Activity Tracking
// -------------------------------------------------------------
export function recordActivity(item, type = 'music') {
  if (!item) return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];

    const entry = {
      id: item.id || item.videoId || item.subjectId,
      title: item.name || item.title || 'Unknown',
      subtitle: item.artist || item.year || '',
      image: item.image || '',
      type,
      timestamp: Date.now()
    };

    const filtered = history.filter(h => h.id !== entry.id);
    filtered.unshift(entry);
    if (filtered.length > 50) filtered.pop();

    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));

    // Update Taste Preferences
    updateTastePreferences(item, type);
  } catch (_) {}
}

function updateTastePreferences(item, type) {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : { genres: {}, artists: {}, tags: {} };

    const text = `${item.name || item.title || ''} ${item.artist || ''}`.toLowerCase();

    const tagKeywords = ['artcell', 'coke studio', 'arijit', 'bangla', 'hindi', 'anime', 'rock', 'lofi', 'avengers', 'naruto', 'one piece', 'pop'];
    tagKeywords.forEach(tag => {
      if (text.includes(tag)) {
        prefs.tags[tag] = (prefs.tags[tag] || 0) + 1;
      }
    });

    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

export function getTopTasteKeywords() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return [];
    const prefs = JSON.parse(raw);
    const tags = prefs.tags || {};
    return Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 3);
  } catch (_) {
    return [];
  }
}
