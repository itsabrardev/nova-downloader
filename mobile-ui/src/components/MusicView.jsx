import React from 'react';
import { Play, Heart, Flame, Globe, Sparkles, Tv, Radio, Headphones, Music } from 'lucide-react';

const CATEGORIES = [
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'hindi', label: 'Hindi Hits', icon: Sparkles },
  { id: 'english', label: 'English Pop', icon: Globe },
  { id: 'anime', label: 'Anime OST', icon: Tv },
  { id: 'bangla', label: 'Bangla', icon: Radio },
  { id: 'lofi', label: 'Lofi Chill', icon: Headphones },
];

export default function MusicView({
  songs,
  loading,
  activeCategory,
  onSelectCategory,
  onPlaySong,
  onToggleLike,
  isLiked
}) {
  return (
    <section className="page-view">
      <div className="section-title-wrap">
        <div className="title-row">
          <div className="title-indicator" />
          <h2>Music Stream</h2>
        </div>
        <span className="subtitle">High quality 320kbps audio streaming &amp; background player</span>
      </div>

      <div className="pill-scroll">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              className={`cat-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              <Icon size={14} className="pill-icon" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      <div className="music-grid">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <span>Discovering music…</span>
          </div>
        ) : songs.length === 0 ? (
          <div className="empty-state">
            <Music size={40} className="empty-icon" />
            <p>No tracks found. Try a different search query!</p>
          </div>
        ) : (
          songs.map((song, idx) => {
            const liked = isLiked(song);
            return (
              <div key={song.id || idx} className="card music-card" onClick={() => onPlaySong(song, songs, idx)}>
                <div className="card-thumb-wrap">
                  <img
                    className="card-thumb"
                    src={song.image || ''}
                    alt={song.name}
                    loading="lazy"
                    onError={e => { e.currentTarget.style.opacity = '0.3'; }}
                  />
                  <div className="card-overlay-gradient" />
                  
                  <button
                    className={`card-like-btn ${liked ? 'liked' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleLike(song);
                    }}
                    title={liked ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label="Like track"
                  >
                    <Heart
                      size={15}
                      fill={liked ? '#ec4899' : 'none'}
                      stroke={liked ? '#ec4899' : '#ffffff'}
                      strokeWidth={2.2}
                    />
                  </button>

                  <div className="card-play-overlay">
                    <Play size={16} fill="currentColor" />
                  </div>
                </div>

                <div className="card-info">
                  <div className="card-title" title={song.name}>{song.name}</div>
                  <div className="card-sub" title={song.artist}>{song.artist}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
