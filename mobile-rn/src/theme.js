// Cyberpunk theme palette (mirrors mobile-ui CSS)
export const T = {
  bg: '#0B0710',
  bgDeep: '#0E071A',
  panel: '#140B22',
  panel2: '#180D2C',
  border: '#24133D',
  accent: '#06B6D4',
  accent2: '#A855F7',
  purple: '#7C3AED',
  pink: '#EC4899',
  gold: '#FBBF24',
  green: '#10B981',
  orange: '#F59E0B',
  text: '#FFFFFF',
  sub: '#8B839C',
  dim: '#CBD5E1',
};

export const formatTime = (sec) => {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
