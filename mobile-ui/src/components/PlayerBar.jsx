import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Download, Heart, Music } from 'lucide-react';

export default function PlayerBar({
  currentSong,
  isPlaying,
  currentTime = 0,
  duration = 0,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleLike,
  isLiked,
  onDownload,
  onOpenModal
}) {
  if (!currentSong) return null;
  const liked = isLiked(currentSong);
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mobile-player-bar" onClick={onOpenModal}>
      {/* Top Thin Realtime Progress Line */}
      <div className="pb-progress-line-bg">
        <div
          className="pb-progress-line-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="pb-left">
        <div className="pb-art-wrap">
          {currentSong.image ? (
            <img
              src={currentSong.image}
              alt=""
              className={`pb-art ${isPlaying ? 'playing' : ''}`}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="pb-art-placeholder">
              <Music size={18} />
            </div>
          )}
        </div>
        <div className="pb-info">
          <div className="pb-title">{currentSong.name || 'Unknown Track'}</div>
          <div className="pb-artist">{currentSong.artist || 'Nova Music'}</div>
        </div>
        {/* Live Audio Visualizer Wave */}
        <div className="pb-mini-wave" style={{ opacity: isPlaying ? 1 : 0.3 }}>
          <span></span><span></span><span></span><span></span>
        </div>
      </div>

      <div className="pb-controls" onClick={(e) => e.stopPropagation()}>
        <button className="pb-btn pb-btn-like" onClick={onToggleLike} title="Like Song">
          <Heart size={16} fill={liked ? '#ec4899' : 'none'} stroke={liked ? '#ec4899' : 'currentColor'} />
        </button>
        <button className="pb-btn" onClick={onPrev} title="Previous">
          <SkipBack size={16} fill="currentColor" />
        </button>
        <button className="pb-btn pb-play-btn" onClick={onTogglePlay} title="Play / Pause">
          {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className="pb-btn" onClick={onNext} title="Next">
          <SkipForward size={16} fill="currentColor" />
        </button>
        <button className="pb-btn pb-btn-dl" onClick={onDownload} title="Download MP3">
          <Download size={16} />
        </button>
      </div>
    </div>
  );
}
