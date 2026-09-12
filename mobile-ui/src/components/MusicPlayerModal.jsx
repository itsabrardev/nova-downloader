import React from 'react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Heart,
  Download,
  Shuffle,
  Repeat,
  Sparkles
} from 'lucide-react';

export default function MusicPlayerModal({
  song,
  isPlaying,
  currentTime = 0,
  duration = 0,
  isLiked = false,
  isShuffle = false,
  isRepeat = false,
  onTogglePlay,
  onSeek,
  onSkip,
  onNext,
  onPrev,
  onToggleLike,
  onToggleShuffle,
  onToggleRepeat,
  onDownload,
  onClose
}) {
  if (!song) return null;

  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="music-player-modal">
      {/* Background Ambient Glow */}
      <div
        className="ambient-bg"
        style={{ backgroundImage: `url(${song.image || ''})` }}
      />
      <div className="ambient-overlay" />

      {/* Top Header Bar */}
      <div className="player-modal-header">
        <button className="icon-btn-round" onClick={onClose} aria-label="Minimize player">
          <ChevronDown size={22} />
        </button>
        <div className="header-meta">
          <span className="now-playing-label">NOW PLAYING</span>
          <span className="now-playing-album" title={song.album || 'Cyberpunk Audio'}>
            {song.album || 'Cyberpunk Audio'}
          </span>
        </div>
        <button
          className={`icon-btn-round ${isLiked ? 'liked-active' : ''}`}
          onClick={onToggleLike}
          aria-label="Like song"
        >
          <Heart size={20} fill={isLiked ? '#ec4899' : 'none'} color={isLiked ? '#ec4899' : 'white'} />
        </button>
      </div>

      {/* Main Artwork Container */}
      <div className="player-modal-body">
        <div className={`art-container ${isPlaying ? 'art-playing' : ''}`}>
          <div className="art-glow-ring" />
          <img
            className="art-image"
            src={song.image || ''}
            alt={song.name}
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%238b5cf6" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
            }}
          />
        </div>

        {/* Title & Artist Info */}
        <div className="track-details">
          <div className="track-title-wrap">
            <h2 className="track-title" title={song.name}>{song.name}</h2>
            <p className="track-artist" title={song.artist}>{song.artist}</p>
          </div>
          <div className="audio-badge">
            <Sparkles size={12} className="sparkle-icon" />
            <span>320kbps HD Audio</span>
          </div>
        </div>

        {/* Scrubbable Timeline Progress Bar (Age-Piche kora) */}
        <div className="timeline-section">
          <div className="progress-slider-wrap">
            <input
              type="range"
              className="player-slider"
              min="0"
              max={duration || 100}
              step="0.5"
              value={currentTime}
              onChange={(e) => onSeek && onSeek(parseFloat(e.target.value))}
            />
            <div
              className="player-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="time-row">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls Row */}
        <div className="controls-section">
          <div className="secondary-controls">
            <button
              className={`ctrl-btn-sub ${isShuffle ? 'active-ctrl' : ''}`}
              onClick={onToggleShuffle}
              title="Shuffle"
            >
              <Shuffle size={18} />
            </button>
            <button
              className="ctrl-btn-sub"
              onClick={() => onSkip && onSkip(-10)}
              title="Rewind 10 seconds"
            >
              <RotateCcw size={20} />
            </button>
          </div>

          <div className="primary-controls">
            <button className="ctrl-btn-skip" onClick={onPrev} title="Previous Track">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button className="ctrl-btn-play-main" onClick={onTogglePlay} title="Play/Pause">
              {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="play-icon-offset" />}
            </button>
            <button className="ctrl-btn-skip" onClick={onNext} title="Next Track">
              <SkipForward size={24} fill="currentColor" />
            </button>
          </div>

          <div className="secondary-controls">
            <button
              className="ctrl-btn-sub"
              onClick={() => onSkip && onSkip(10)}
              title="Forward 10 seconds"
            >
              <RotateCw size={20} />
            </button>
            <button
              className={`ctrl-btn-sub ${isRepeat ? 'active-ctrl' : ''}`}
              onClick={onToggleRepeat}
              title="Repeat"
            >
              <Repeat size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Download Action */}
        <div className="modal-bottom-actions">
          <button className="bottom-action-btn" onClick={onDownload}>
            <Download size={16} />
            <span>Download 320k MP3</span>
          </button>
        </div>
      </div>
    </div>
  );
}
