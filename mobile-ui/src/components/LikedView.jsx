import React, { useState, useRef } from 'react';
import { Play, Shuffle, Heart, ChevronLeft, ChevronRight, Music } from 'lucide-react';

export default function LikedView({ likedSongs, onPlaySong, onToggleLike, currentSong }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);
  const touchStartX = useRef(0);

  const safeActiveIdx = Math.min(Math.max(0, activeIdx), Math.max(0, likedSongs.length - 1));

  const handleNext = () => {
    if (!likedSongs.length) return;
    const next = (safeActiveIdx + 1) % likedSongs.length;
    setActiveIdx(next);
    onPlaySong(likedSongs[next], likedSongs, next);
  };

  const handlePrev = () => {
    if (!likedSongs.length) return;
    const prev = (safeActiveIdx - 1 + likedSongs.length) % likedSongs.length;
    setActiveIdx(prev);
    onPlaySong(likedSongs[prev], likedSongs, prev);
  };

  const handleShuffle = () => {
    if (!likedSongs.length) return;
    setIsShuffling(true);
    const rand = Math.floor(Math.random() * likedSongs.length);
    setTimeout(() => {
      setIsShuffling(false);
      setActiveIdx(rand);
      onPlaySong(likedSongs[rand], likedSongs, rand);
    }, 450);
  };

  if (!likedSongs.length) {
    return (
      <section className="page-view">
        <div className="section-title-wrap">
          <div className="title-row">
            <div className="title-indicator title-indicator-pink" />
            <h2>Favorite Tracks</h2>
          </div>
          <span className="subtitle">0 saved tracks</span>
        </div>
        <div className="empty-state">
          <Heart size={48} className="empty-icon empty-icon-pink" strokeWidth={1.5} />
          <h3 className="empty-title">Your favorite collection is empty</h3>
          <p className="empty-desc">
            Tap the heart icon on any music card or the mini player to build your personal offline-ready playlist!
          </p>
        </div>
      </section>
    );
  }

  const maxVisible = 4;

  return (
    <section className="page-view">
      <div className="section-title-wrap">
        <div className="title-row">
          <div className="title-indicator title-indicator-pink" />
          <h2>Favorite Tracks</h2>
        </div>
        <span className="subtitle">{likedSongs.length} tracks in collection</span>
      </div>

      {/* 3D Coverflow Showcase */}
      <div className="carousel-3d-wrapper">
        <div
          className={`carousel-3d-stage ${isShuffling ? 'shuffling' : ''}`}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const diff = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(diff) > 40) {
              if (diff > 0) handlePrev();
              else handleNext();
            }
          }}
        >
          {likedSongs.map((s, idx) => {
            const offset = idx - safeActiveIdx;
            const absOffset = Math.abs(offset);
            if (absOffset > maxVisible) return null;

            let transform = '';
            let opacity = 1;
            let zIndex = 100 - absOffset * 10;

            if (offset === 0) {
              transform = 'translateX(0px) translateZ(80px) rotateY(0deg) scale(1.08)';
              opacity = 1;
            } else if (offset < 0) {
              const xPos = offset * 95 - 35;
              const zPos = -45 * absOffset;
              transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(38deg) scale(${0.86 - absOffset * 0.04})`;
              opacity = Math.max(0.25, 1 - absOffset * 0.22);
            } else {
              const xPos = offset * 95 + 35;
              const zPos = -45 * absOffset;
              transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(-38deg) scale(${0.86 - absOffset * 0.04})`;
              opacity = Math.max(0.25, 1 - absOffset * 0.22);
            }

            const isActive = offset === 0;

            return (
              <div
                key={s.id || idx}
                className={`glass-card-3d ${isActive ? 'active' : ''}`}
                style={{ transform, opacity, zIndex }}
                onClick={() => {
                  setActiveIdx(idx);
                  onPlaySong(s, likedSongs, idx);
                }}
              >
                <div className="card-3d-art-wrap">
                  <img
                    className="card-3d-art"
                    src={s.image || ''}
                    alt={s.name}
                    onError={e => { e.currentTarget.style.opacity = '0.3'; }}
                  />
                  <button className="card-3d-play-btn" title="Play">
                    <Play size={18} fill="currentColor" />
                  </button>
                </div>
                <div className="card-3d-body">
                  <div className="card-3d-title">{s.name}</div>
                  <div className="card-3d-artist">{s.artist}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Carousel Indicators & Controls */}
        <div className="carousel-3d-controls">
          <button className="c3d-btn" onClick={handlePrev} title="Previous" aria-label="Previous card">
            <ChevronLeft size={16} />
          </button>
          <div className="c3d-indicators">
            {Array.from({ length: Math.min(likedSongs.length, 7) }).map((_, dIdx) => (
              <div
                key={dIdx}
                className={`c3d-dot ${dIdx === (safeActiveIdx % Math.min(likedSongs.length, 7)) ? 'active' : ''}`}
                onClick={() => {
                  setActiveIdx(dIdx);
                  onPlaySong(likedSongs[dIdx], likedSongs, dIdx);
                }}
              />
            ))}
          </div>
          <button className="c3d-btn" onClick={handleNext} title="Next" aria-label="Next card">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="lib-toolbar">
        <button
          className="btn-primary"
          onClick={() => onPlaySong(likedSongs[0], likedSongs, 0)}
        >
          <Play size={15} fill="currentColor" />
          <span>Play All</span>
        </button>
        <button className="btn-secondary" onClick={handleShuffle}>
          <Shuffle size={15} />
          <span>Shuffle</span>
        </button>
      </div>

      {/* Liked Song List */}
      <div className="song-list">
        {likedSongs.map((s, idx) => {
          const isPlayingThis = currentSong && (currentSong.id === s.id || currentSong.name === s.name);
          return (
            <div
              key={s.id || idx}
              className={`list-item ${isPlayingThis ? 'playing' : ''}`}
              onClick={() => {
                setActiveIdx(idx);
                onPlaySong(s, likedSongs, idx);
              }}
            >
              <div className="list-item-left">
                <div className="list-item-thumb">
                  {s.image ? (
                    <img src={s.image} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <Music size={16} />
                  )}
                </div>
                <div className="list-item-meta">
                  <div className="list-item-title">{s.name}</div>
                  <div className="list-item-sub">{s.artist}</div>
                </div>
              </div>

              <div className="list-item-actions">
                <button
                  className="list-item-like-btn liked"
                  onClick={e => {
                    e.stopPropagation();
                    onToggleLike(s);
                  }}
                  title="Remove from favorites"
                  aria-label="Unlike track"
                >
                  <Heart size={17} fill="#ec4899" stroke="#ec4899" />
                </button>
                <div className="list-item-play">
                  <Play size={14} fill="currentColor" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
