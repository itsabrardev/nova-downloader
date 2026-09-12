import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  Star,
  Sparkles,
  Tv,
  Film
} from 'lucide-react';

export default function CinemaModal({
  movie,
  videoUrl,
  episodes = [],
  currentEpisode,
  qualities = [],
  currentQualityUrl,
  recommendations = [],
  onSelectEpisode,
  onSelectQuality,
  onSelectMovie,
  onClose,
  onDownload,
  onNativePlay,
  onExternalPlay
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimer = useRef(null);

  // Auto play when videoUrl changes
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [videoUrl]);

  // Fullscreen state listener
  useEffect(() => {
    const handleFSChange = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isFS);
      if (!isFS && window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
        window.AndroidBridge.toggleOrientation(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('webkitfullscreenchange', handleFSChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
      if (window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
        window.AndroidBridge.toggleOrientation(false);
      }
    };
  }, []);

  // Controls auto-hide timer
  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetHideTimer();
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
    resetHideTimer();
  };

  const skipSeconds = (seconds, e) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      resetHideTimer();
    }
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
    resetHideTimer();
  };

  const toggleFullscreen = (e) => {
    if (e) e.stopPropagation();
    const c = containerRef.current;
    if (!c) return;

    if (!isFullscreen) {
      if (c.requestFullscreen) {
        c.requestFullscreen().catch(() => {});
      } else if (videoRef.current?.requestFullscreen) {
        videoRef.current.requestFullscreen().catch(() => {});
      }
      if (window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
        window.AndroidBridge.toggleOrientation(true);
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
      if (window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
        window.AndroidBridge.toggleOrientation(false);
      }
      setIsFullscreen(false);
    }
    resetHideTimer();
  };

  const handleClose = () => {
    if (isFullscreen) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
        window.AndroidBridge.toggleOrientation(false);
      }
    }
    onClose && onClose();
  };

  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!movie) return null;

  return (
    <div className="cinema-modal">
      {/* Top Bar Header */}
      <div className="cinema-header">
        <button className="close-cinema-btn" onClick={handleClose} aria-label="Close">
          <X size={16} />
          <span>Back</span>
        </button>
        <span className="cinema-title" title={movie.title}>{movie.title}</span>
      </div>

      {/* Cyberpunk Custom 16:9 Video Player */}
      <div
        ref={containerRef}
        className={`video-container ${showControls ? 'controls-visible' : 'controls-hidden'} ${isFullscreen ? 'fullscreen-active' : ''}`}
        onClick={resetHideTimer}
        onMouseMove={resetHideTimer}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            playsInline
            autoPlay
            poster={movie.image || ''}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        ) : (
          <div className="video-loading-placeholder">
            <div className="spinner"></div>
            <span>Connecting to CDN stream…</span>
          </div>
        )}

        {/* Custom Video Control Overlay */}
        {videoUrl && (
          <div className="video-player-overlay">
            {/* Center Big Play/Pause Button */}
            <button className="center-play-btn" onClick={togglePlay} aria-label="Play/Pause">
              {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="play-icon-offset" />}
            </button>

            {/* Bottom Controls Bar */}
            <div className="player-bottom-bar" onClick={e => e.stopPropagation()}>
              {/* Scrubbable Progress Bar */}
              <div className="player-progress-wrap">
                <input
                  type="range"
                  className="player-slider"
                  min="0"
                  max={duration || 100}
                  step="0.5"
                  value={currentTime}
                  onChange={handleSeek}
                />
                <div
                  className="player-progress-fill"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>

              {/* Controls Row */}
              <div className="player-controls-row">
                <div className="player-ctrls-left">
                  <button className="player-icon-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <button className="player-icon-btn" onClick={(e) => skipSeconds(-10, e)} title="Rewind 10s">
                    <RotateCcw size={16} />
                  </button>
                  <button className="player-icon-btn" onClick={(e) => skipSeconds(10, e)} title="Forward 10s">
                    <RotateCw size={16} />
                  </button>
                  <button className="player-icon-btn" onClick={toggleMute}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <span className="player-time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="player-ctrls-right">
                  <button className="player-icon-btn" onClick={toggleFullscreen} title="Fullscreen">
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Movie Details & Episodes */}
      <div className="cinema-meta">
        <div className="cinema-info-row">
          <div className="cinema-title-main">{movie.title}</div>
          <div className="cinema-tags">
            <span className="cinema-badge-rating">
              <Star size={11} fill="#fbbf24" stroke="#fbbf24" />
              <span>{movie.rating || '8.8'}</span>
            </span>
            {movie.year && <span className="cinema-badge-year">{movie.year}</span>}
            <span className="cinema-badge-type">
              {movie.subjectType === 2 ? <><Tv size={11} /> Series</> : <><Film size={11} /> Movie</>}
            </span>
          </div>
        </div>

        {/* Quality Selector */}
        {qualities.length > 0 && (
          <div className="quality-selector-row">
            <span className="meta-label">Quality:</span>
            <div className="quality-pills">
              {qualities.map((q, i) => (
                <button
                  key={i}
                  className={`quality-pill ${q.url === currentQualityUrl ? 'active' : ''}`}
                  onClick={() => onSelectQuality(q.url)}
                >
                  <span>{q.quality}</span>
                  {q.size && <span className="quality-size-badge">{q.size}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TV Series Episode Selector */}
        {episodes.length > 0 && (
          <div className="episodes-selector-row">
            <span className="meta-label">Episodes ({episodes.length}):</span>
            <div className="episodes-scroll">
              {episodes.map(ep => (
                <button
                  key={`${ep.se}-${ep.ep}`}
                  className={`ep-pill ${currentEpisode && currentEpisode.ep === ep.ep && currentEpisode.se === ep.se ? 'active' : ''}`}
                  onClick={() => onSelectEpisode(ep)}
                >
                  {ep.se > 1 ? `S${ep.se} ` : ''}EP {ep.ep}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="cinema-actions-row">
          <button className="btn-primary cinema-action-btn" onClick={toggleFullscreen} disabled={!videoUrl}>
            <Maximize2 size={16} />
            <span>Watch Fullscreen</span>
          </button>
          <button className="btn-secondary cinema-action-btn" onClick={onDownload} disabled={!videoUrl}>
            <Download size={16} />
            <span>Download MP4</span>
          </button>
          <button className="btn-secondary cinema-action-btn" onClick={onExternalPlay} disabled={!videoUrl} title="Open in VLC / MX Player">
            <ExternalLink size={16} />
            <span>External</span>
          </button>
        </div>

        {/* More Like This / Recommended Titles */}
        {recommendations.length > 0 && (
          <div className="cinema-recommendations-section">
            <div className="rec-header">
              <Sparkles size={15} stroke="#06b6d4" />
              <span className="rec-title">More Like This</span>
            </div>
            <div className="rec-scroll">
              {recommendations.slice(0, 10).map((m, idx) => (
                <div
                  key={m.id || idx}
                  className="rec-card"
                  onClick={() => onSelectMovie && onSelectMovie(m)}
                >
                  <div className="rec-thumb-wrap">
                    <img src={m.image || ''} alt={m.title} loading="lazy" />
                    <div className="rec-play-overlay">
                      <Play size={14} fill="currentColor" />
                    </div>
                  </div>
                  <div className="rec-title-text" title={m.title}>{m.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
