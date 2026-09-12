import React from 'react';
import { Play, Shuffle, RotateCw, Music2, Heart, HardDrive } from 'lucide-react';

export default function LibraryView({ offlineSongs, onPlaySong, onToggleLike, isLiked, onRescan, currentSong }) {
  return (
    <section className="page-view">
      <div className="section-title-wrap">
        <div className="title-row">
          <div className="title-indicator title-indicator-cyan" />
          <h2>Offline Storage</h2>
        </div>
        <span className="subtitle">{offlineSongs.length} downloaded tracks on local device</span>
      </div>

      <div className="lib-toolbar">
        <button
          className="btn-primary"
          onClick={() => offlineSongs.length && onPlaySong(offlineSongs[0], offlineSongs, 0)}
        >
          <Play size={15} fill="currentColor" />
          <span>Play All</span>
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            if (!offlineSongs.length) return;
            const shuffled = [...offlineSongs].sort(() => Math.random() - 0.5);
            onPlaySong(shuffled[0], shuffled, 0);
          }}
        >
          <Shuffle size={15} />
          <span>Shuffle</span>
        </button>
        <button className="btn-secondary" onClick={onRescan} title="Rescan device storage" aria-label="Rescan">
          <RotateCw size={15} />
          <span>Rescan</span>
        </button>
      </div>

      <div className="song-list">
        {offlineSongs.length === 0 ? (
          <div className="empty-state">
            <HardDrive size={44} className="empty-icon" strokeWidth={1.5} />
            <h3 className="empty-title">No local audio detected</h3>
            <p className="empty-desc">Scan your device storage or download music to listen offline without internet.</p>
          </div>
        ) : (
          offlineSongs.map((s, idx) => {
            const liked = isLiked(s);
            const isPlayingThis = currentSong && (currentSong.id === s.id || currentSong.name === s.name);
            return (
              <div
                key={s.id || idx}
                className={`list-item ${isPlayingThis ? 'playing' : ''}`}
                onClick={() => onPlaySong(s, offlineSongs, idx)}
              >
                <div className="list-item-left">
                  <div className="list-item-thumb">
                    <Music2 size={18} />
                  </div>
                  <div className="list-item-meta">
                    <div className="list-item-title">{s.name}</div>
                    <div className="list-item-sub">{s.artist} • {s.format || 'AUDIO'}</div>
                  </div>
                </div>
                <div className="list-item-actions">
                  <button
                    className={`list-item-like-btn ${liked ? 'liked' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleLike(s);
                    }}
                    title="Like / Favorite"
                    aria-label="Like"
                  >
                    <Heart size={17} fill={liked ? '#ec4899' : 'none'} stroke={liked ? '#ec4899' : '#8b839c'} />
                  </button>
                  <div className="list-item-play">
                    <Play size={14} fill="currentColor" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
