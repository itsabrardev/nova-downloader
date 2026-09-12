import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import MusicView from './components/MusicView';
import MoviesView from './components/MoviesView';
import LikedView from './components/LikedView';
import LibraryView from './components/LibraryView';
import DownloadsView from './components/DownloadsView';
import PlayerBar from './components/PlayerBar';
import BottomNav from './components/BottomNav';
import CinemaModal from './components/CinemaModal';
import MusicPlayerModal from './components/MusicPlayerModal';
import Toast from './components/Toast';

import { api } from './services/api';
import { getLikedSongs, isSongLiked, toggleLikeSong, recordActivity, getTopTasteKeywords } from './services/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState('music');
  const [searchQuery, setSearchQuery] = useState('');

  const [musicList, setMusicList] = useState([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('trending');

  const [moviesList, setMoviesList] = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState('popular');

  const [likedList, setLikedList] = useState(getLikedSongs());
  const [offlineList, setOfflineList] = useState([]);
  const [downloadsList, setDownloadsList] = useState([]);

  // Audio Playback State
  const [currentSong, setCurrentSong] = useState(null);
  const [currentQueue, setCurrentQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);

  // Cinema Video State
  const [activeMovie, setActiveMovie] = useState(null);
  const [cinemaVideoUrl, setCinemaVideoUrl] = useState('');
  const [movieEpisodes, setMovieEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [movieQualities, setMovieQualities] = useState([]);
  const [currentQualityUrl, setCurrentQualityUrl] = useState('');

  // Toast State
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  };

  // 1a. Initial Data Fetching — runs ONCE on mount.
  // (This used to re-run on every keystroke / tab switch / modal toggle,
  //  re-firing dozens of API calls and a full MediaStore scan each time.)
  useEffect(() => {
    loadTrendingMusic();
    loadTrendingMovies('popular');
    scanOfflineMusic();
  }, []);

  // 1b. Latest handlers kept in a ref so the once-registered native bridges
  //     always call fresh closures (no stale queue/repeat state).
  const latestHandlers = useRef({});
  useEffect(() => {
    latestHandlers.current = {
      onNativeMusicEvent: (event, position = 0, dur = 0) => {
        if (event === 'play' || event === 'prepared') {
          setIsPlaying(true);
          if (dur > 0) setDuration(dur / 1000);
        } else if (event === 'pause') {
          setIsPlaying(false);
        } else if (event === 'ended') {
          if (isRepeat) {
            handleSeekMusic(0);
            handleTogglePlay();
          } else {
            handleNextSong();
          }
        } else if (event === 'next') {
          handleNextSong();
        } else if (event === 'prev') {
          handlePrevSong();
        }
        if (position > 0) setCurrentTime(position / 1000);
        if (dur > 0) setDuration(dur / 1000);
      },
      handleBackPress: () => {
        if (isMusicModalOpen) {
          setIsMusicModalOpen(false);
          return true;
        }
        if (activeMovie) {
          handleCloseCinema();
          return true;
        }
        if (searchQuery) {
          setSearchQuery('');
          return true;
        }
        if (activeTab !== 'music') {
          setActiveTab('music');
          return true;
        }
        return false;
      }
    };
  });

  // 1c. Native bridge receivers — registered once, delegate through the ref.
  useEffect(() => {
    window.onNativeMusicEvent = (event, position, dur) => {
      if (latestHandlers.current.onNativeMusicEvent) {
        latestHandlers.current.onNativeMusicEvent(event, position, dur);
      }
    };
    window.handleBackPress = () => {
      return latestHandlers.current.handleBackPress
        ? latestHandlers.current.handleBackPress()
        : false;
    };
    window.__onOfflineMusicResult = (res) => {
      setOfflineList(Array.isArray(res) ? res : []);
    };
    return () => {
      window.onNativeMusicEvent = null;
      window.handleBackPress = null;
      window.__onOfflineMusicResult = null;
    };
  }, []);

  // Sync HTML5 audio time when on web or non-bridge environment
  useEffect(() => {
    if (!window.AndroidBridge) {
      if (!window.htmlAudio) window.htmlAudio = new Audio();
      const audio = window.htmlAudio;

      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleLoadedMeta = () => setDuration(audio.duration || 0);
      const handleEnded = () => {
        if (isRepeat) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        } else {
          handleNextSong();
        }
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMeta);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMeta);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [isRepeat]);

  const loadTrendingMusic = async () => {
    setMusicLoading(true);
    const list = await api.getTrending('trending');
    setMusicList(list);
    setMusicLoading(false);
  };

  const loadTrendingMovies = async (genre = 'popular') => {
    setMoviesLoading(true);
    const list = await api.searchMovies(genre);
    setMoviesList(list);
    setMoviesLoading(false);
  };

  const scanOfflineMusic = () => {
    const bridge = window.AndroidBridge;
    // Async scan on a Java worker thread → resolves via window.__onOfflineMusicResult
    if (bridge && typeof bridge.scanOfflineMusicAsync === 'function') {
      bridge.scanOfflineMusicAsync();
    } else if (bridge && typeof bridge.scanOfflineMusic === 'function') {
      try {
        const raw = bridge.scanOfflineMusic();
        const parsed = JSON.parse(raw || '[]');
        setOfflineList(parsed);
      } catch (e) {
        console.warn('Offline scan error:', e);
      }
    }
  };

  // 2. Debounced Contextual Search Handler
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const q = searchQuery.trim();
    const timer = setTimeout(async () => {
      if (!q) {
        if (activeTab === 'movies') loadTrendingMovies(activeGenre);
        else handleSelectCategory(activeCategory);
        return;
      }

      if (activeTab === 'movies') {
        setMoviesLoading(true);
        const res = await api.searchMovies(q);
        setMoviesList(res);
        setMoviesLoading(false);
      } else {
        setMusicLoading(true);
        const res = await api.searchMusic(q);
        setMusicList(res);
        setMusicLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  // 3. Category / Genre Selection with Taste Personalization
  const handleSelectCategory = async (cat) => {
    setActiveCategory(cat);
    setMusicLoading(true);
    const list = await api.getCategoryTracks(cat);
    setMusicList(list);
    setMusicLoading(false);
  };

  const handleSelectGenre = async (genre) => {
    setActiveGenre(genre);
    loadTrendingMovies(genre);
  };

  // 4. Music Playback Controls & Seeking
  const handlePlaySong = (song, queue = [], idx = 0) => {
    if (!song) return;
    setCurrentSong(song);
    setCurrentQueue(queue.length ? queue : [song]);
    setCurrentIndex(idx);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(song.durationSec || 0);

    // Record activity for smart recommendations
    recordActivity(song, 'music');

    if (window.AndroidBridge && window.AndroidBridge.playMusic) {
      window.AndroidBridge.playMusic(song.streamUrl || '', song.name, song.artist, song.image || '');
    } else {
      if (!window.htmlAudio) window.htmlAudio = new Audio();
      if (song.streamUrl) {
        window.htmlAudio.src = song.streamUrl;
        window.htmlAudio.play().catch(() => {});
      }
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (window.AndroidBridge && window.AndroidBridge.pauseMusic) window.AndroidBridge.pauseMusic();
      else if (window.htmlAudio) window.htmlAudio.pause();
      setIsPlaying(false);
    } else {
      if (window.AndroidBridge && window.AndroidBridge.resumeMusic) window.AndroidBridge.resumeMusic();
      else if (window.htmlAudio) window.htmlAudio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeekMusic = (newSec) => {
    setCurrentTime(newSec);
    if (window.AndroidBridge && window.AndroidBridge.seekMusic) {
      window.AndroidBridge.seekMusic(Math.round(newSec * 1000));
    } else if (window.htmlAudio) {
      window.htmlAudio.currentTime = newSec;
    }
  };

  const handleSkipMusic = (deltaSec) => {
    const target = Math.max(0, Math.min(duration || 100, currentTime + deltaSec));
    handleSeekMusic(target);
  };

  const handleNextSong = () => {
    if (!currentQueue.length) return;
    let next;
    if (isShuffle) {
      next = Math.floor(Math.random() * currentQueue.length);
    } else {
      next = (currentIndex + 1) % currentQueue.length;
    }
    handlePlaySong(currentQueue[next], currentQueue, next);
  };

  const handlePrevSong = () => {
    if (!currentQueue.length) return;
    const prev = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    handlePlaySong(currentQueue[prev], currentQueue, prev);
  };

  const handleToggleLike = (song) => {
    const target = song || currentSong;
    if (!target) return;
    const { isLiked: nowLiked, updatedList } = toggleLikeSong(target);
    setLikedList([...updatedList]);
    showToast(nowLiked ? `Added "${target.name}" to favorites` : `Removed "${target.name}" from favorites`);
  };

  const handleDownloadSong = () => {
    if (!currentSong) {
      showToast('No active track to download');
      return;
    }
    const clean = `${currentSong.artist} - ${currentSong.name}`.replace(/[/\\?%*:|"<>]/g, '');
    const filename = `${clean}.mp3`;
    const targetUrl = currentSong.streamUrl || '';

    if (window.AndroidBridge && window.AndroidBridge.downloadFile) {
      window.AndroidBridge.downloadFile(targetUrl, filename, currentSong.name, 'audio/mp3');
      showToast(`Downloading: ${currentSong.name}`);
    } else {
      showToast('Download started');
    }
  };

  // 5. Cinema Movie Player & Recommendations
  const handleOpenMovie = async (movie) => {
    setActiveMovie(movie);
    showToast(`Loading: ${movie.title}…`);

    // Record movie activity for smart recommendations
    recordActivity(movie, 'movie');

    // Pause music if active
    if (isPlaying) {
      if (window.AndroidBridge && window.AndroidBridge.pauseMusic) window.AndroidBridge.pauseMusic();
      else if (window.htmlAudio) window.htmlAudio.pause();
      setIsPlaying(false);
    }

    let currentSe = 0;
    let currentEp = 0;

    if (movie.subjectType === 2 || movie.detailPath) {
      const detail = await api.getMovieDetail(movie.detailPath);
      if (detail && detail.episodes && detail.episodes.length > 0) {
        setMovieEpisodes(detail.episodes);
        setCurrentEpisode(detail.episodes[0]);
        currentSe = detail.episodes[0].se || 1;
        currentEp = detail.episodes[0].ep || 1;
      } else {
        setMovieEpisodes([]);
        currentSe = 0;
        currentEp = 0;
      }
    } else {
      setMovieEpisodes([]);
    }

    loadMovieStream(movie.id || movie.subjectId, movie.detailPath, currentSe, currentEp);
  };

  const loadMovieStream = async (subjectId, detailPath = '', se = 0, ep = 0) => {
    const links = await api.getMovieLinks(subjectId, detailPath, se, ep);
    if (!links || !links.length) {
      showToast('Stream links not ready for this title yet');
      return;
    }
    setMovieQualities(links);
    setCurrentQualityUrl(links[0].url);
    setCinemaVideoUrl(links[0].url);
  };

  const handleCloseCinema = () => {
    setActiveMovie(null);
    setCinemaVideoUrl('');
    setMovieEpisodes([]);
    setMovieQualities([]);
    if (window.AndroidBridge && window.AndroidBridge.toggleOrientation) {
      window.AndroidBridge.toggleOrientation(false);
    }
  };

  const handleDownloadMovie = () => {
    if (!cinemaVideoUrl || !activeMovie) {
      showToast('No active stream to download');
      return;
    }
    const clean = activeMovie.title.replace(/[/\\?%*:|"<>]/g, '');
    const filename = `${clean}.mp4`;
    if (window.AndroidBridge && window.AndroidBridge.downloadFile) {
      window.AndroidBridge.downloadFile(cinemaVideoUrl, filename, activeMovie.title, 'video/mp4');
      showToast(`Downloading: ${filename}`);
    } else {
      showToast('Download started');
    }
  };

  const handleNativePlay = () => {
    if (!cinemaVideoUrl) return;
    if (window.AndroidBridge && window.AndroidBridge.playVideoNative) {
      window.AndroidBridge.playVideoNative(cinemaVideoUrl, activeMovie ? activeMovie.title : 'Movie');
    } else {
      handleExternalPlay();
    }
  };

  const handleExternalPlay = () => {
    if (!cinemaVideoUrl) return;
    if (window.AndroidBridge && window.AndroidBridge.playVideoExternal) {
      window.AndroidBridge.playVideoExternal(cinemaVideoUrl, activeMovie ? activeMovie.title : 'Movie');
    } else {
      window.open(cinemaVideoUrl, '_blank');
    }
  };

  return (
    <div className="app-viewport">
      <Header
        activeTab={activeTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onRefresh={() => {
          if (activeTab === 'movies') loadTrendingMovies(activeGenre);
          else if (activeTab === 'library') scanOfflineMusic();
          else handleSelectCategory(activeCategory);
          showToast('Content refreshed');
        }}
      />

      <main className="content-container">
        {activeTab === 'music' && (
          <MusicView
            songs={musicList}
            loading={musicLoading}
            activeCategory={activeCategory}
            onSelectCategory={handleSelectCategory}
            onPlaySong={handlePlaySong}
            onToggleLike={handleToggleLike}
            isLiked={(song) => isSongLiked(song, likedList)}
          />
        )}

        {activeTab === 'movies' && (
          <MoviesView
            movies={moviesList}
            loading={moviesLoading}
            activeGenre={activeGenre}
            onSelectGenre={handleSelectGenre}
            onOpenMovie={handleOpenMovie}
          />
        )}

        {activeTab === 'liked' && (
          <LikedView
            likedSongs={
              searchQuery.trim()
                ? likedList.filter(s =>
                    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : likedList
            }
            onPlaySong={handlePlaySong}
            onToggleLike={handleToggleLike}
            currentSong={currentSong}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            offlineSongs={
              searchQuery.trim()
                ? offlineList.filter(s =>
                    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : offlineList
            }
            onPlaySong={handlePlaySong}
            onToggleLike={handleToggleLike}
            isLiked={(song) => isSongLiked(song, likedList)}
            onRescan={() => {
              scanOfflineMusic();
              showToast('Device library updated');
            }}
            currentSong={currentSong}
          />
        )}

        {activeTab === 'downloads' && (
          <DownloadsView downloads={downloadsList} />
        )}
      </main>

      {/* Flush Docked Mini Player with Click-to-Expand */}
      <PlayerBar
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={handleTogglePlay}
        onNext={handleNextSong}
        onPrev={handlePrevSong}
        onToggleLike={() => handleToggleLike(currentSong)}
        isLiked={(song) => isSongLiked(song, likedList)}
        onDownload={handleDownloadSong}
        onOpenModal={() => setIsMusicModalOpen(true)}
      />

      {/* SOLID FIXED BOTTOM NAVIGATION BAR */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSearchQuery('');
        }}
      />

      {/* Expandable Fullscreen Music Player Modal (Age-Piche kora) */}
      {isMusicModalOpen && currentSong && (
        <MusicPlayerModal
          song={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          isLiked={isSongLiked(currentSong, likedList)}
          isShuffle={isShuffle}
          isRepeat={isRepeat}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeekMusic}
          onSkip={handleSkipMusic}
          onNext={handleNextSong}
          onPrev={handlePrevSong}
          onToggleLike={() => handleToggleLike(currentSong)}
          onToggleShuffle={() => {
            setIsShuffle(!isShuffle);
            showToast(!isShuffle ? 'Shuffle ON' : 'Shuffle OFF');
          }}
          onToggleRepeat={() => {
            setIsRepeat(!isRepeat);
            showToast(!isRepeat ? 'Repeat ON' : 'Repeat OFF');
          }}
          onDownload={handleDownloadSong}
          onClose={() => setIsMusicModalOpen(false)}
        />
      )}

      {/* Fullscreen Video Cinema Modal with Recommendations */}
      {activeMovie && (
        <CinemaModal
          movie={activeMovie}
          videoUrl={cinemaVideoUrl}
          episodes={movieEpisodes}
          currentEpisode={currentEpisode}
          qualities={movieQualities}
          currentQualityUrl={currentQualityUrl}
          recommendations={moviesList.filter(m => (m.id || m.subjectId) !== (activeMovie.id || activeMovie.subjectId))}
          onSelectEpisode={(ep) => {
            setCurrentEpisode(ep);
            loadMovieStream(activeMovie.id || activeMovie.subjectId, activeMovie.detailPath, ep.se, ep.ep);
          }}
          onSelectQuality={(url) => {
            setCurrentQualityUrl(url);
            setCinemaVideoUrl(url);
          }}
          onSelectMovie={handleOpenMovie}
          onClose={handleCloseCinema}
          onDownload={handleDownloadMovie}
          onNativePlay={handleNativePlay}
          onExternalPlay={handleExternalPlay}
        />
      )}

      {/* Toast Notification */}
      <Toast message={toastMsg} />
    </div>
  );
}
