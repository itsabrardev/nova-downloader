import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StatusBar, BackHandler, NativeModules, NativeEventEmitter, StyleSheet } from 'react-native';

import Header from './src/components/Header';
import MusicView from './src/components/MusicView';
import MoviesView from './src/components/MoviesView';
import LikedView from './src/components/LikedView';
import LibraryView from './src/components/LibraryView';
import DownloadsView from './src/components/DownloadsView';
import PlayerBar from './src/components/PlayerBar';
import BottomNav from './src/components/BottomNav';
import CinemaModal from './src/components/CinemaModal';
import MusicPlayerModal from './src/components/MusicPlayerModal';
import Toast from './src/components/Toast';

import { api } from './src/services/api';
import { getLikedSongs, isSongLiked, toggleLikeSong, recordActivity } from './src/services/storage';
import * as Native from './src/services/native';

export default function App() {
  const [activeTab, setActiveTab] = useState('music');
  const [searchQuery, setSearchQuery] = useState('');

  const [musicList, setMusicList] = useState([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('trending');

  const [moviesList, setMoviesList] = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState('popular');

  const [likedList, setLikedList] = useState([]);
  const [offlineList, setOfflineList] = useState([]);
  const [downloadsList] = useState([]);

  // Audio playback state
  const [currentSong, setCurrentSong] = useState(null);
  const [currentQueue, setCurrentQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);

  // Cinema state
  const [activeMovie, setActiveMovie] = useState(null);
  const [cinemaVideoUrl, setCinemaVideoUrl] = useState('');
  const [movieEpisodes, setMovieEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [movieQualities, setMovieQualities] = useState([]);
  const [currentQualityUrl, setCurrentQualityUrl] = useState('');

  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  // Load liked songs on mount
  useEffect(() => {
    (async () => setLikedList(await getLikedSongs()))();
  }, []);

  // Latest handlers kept in a ref so once-registered listeners call fresh closures
  const latest = useRef({});
  useEffect(() => {
    latest.current = {
      next: () => handleNextSong(),
      prev: () => handlePrevSong(),
    };
  });

  // Native music events (position/duration/end) from MusicService
  useEffect(() => {
    const NovaModule = NativeModules.NovaModule;
    if (!NovaModule) return;
    const emitter = new NativeEventEmitter(NovaModule);
    const sub = emitter.addListener('NovaMusicEvent', (e) => {
      const position = (e.position || 0) / 1000;
      const dur = (e.duration || 0) / 1000;
      if (e.event === 'play' || e.event === 'prepared') {
        setIsPlaying(true);
        if (dur > 0) setDuration(dur);
      } else if (e.event === 'pause') {
        setIsPlaying(false);
      } else if (e.event === 'ended') {
        if (isRepeat) {
          handleSeekMusic(0);
          Native.resumeMusic();
        } else {
          latest.current.next();
        }
      } else if (e.event === 'next') {
        latest.current.next();
      } else if (e.event === 'prev') {
        latest.current.prev();
      }
      if (position > 0) setCurrentTime(position);
      if (dur > 0) setDuration(dur);
    });
    return () => sub.remove();
  }, [isRepeat]);

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
    });
    return () => sub.remove();
  }, [isMusicModalOpen, activeMovie, searchQuery, activeTab]);

  // Initial data load — once
  useEffect(() => {
    loadTrendingMusic();
    loadTrendingMovies('popular');
    scanOfflineMusic();
  }, []);

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

  const scanOfflineMusic = async () => {
    const parsed = await Native.scanOfflineMusic();
    setOfflineList(parsed);
  };

  // Debounced search
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

  const handleSelectCategory = async (cat) => {
    setActiveCategory(cat);
    setMusicLoading(true);
    const list = await api.getCategoryTracks(cat);
    setMusicList(list);
    setMusicLoading(false);
  };

  const handleSelectGenre = (genre) => {
    setActiveGenre(genre);
    loadTrendingMovies(genre);
  };

  // Music playback
  const handlePlaySong = (song, queue = [], idx = 0) => {
    if (!song) return;
    setCurrentSong(song);
    setCurrentQueue(queue.length ? queue : [song]);
    setCurrentIndex(idx);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(song.durationSec || 0);

    recordActivity(song, 'music');
    Native.playMusic(song.streamUrl || '', song.name, song.artist, song.image || '');
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      Native.pauseMusic();
      setIsPlaying(false);
    } else {
      Native.resumeMusic();
      setIsPlaying(true);
    }
  };

  const handleSeekMusic = (newSec) => {
    setCurrentTime(newSec);
    Native.seekMusic(Math.round(newSec * 1000));
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

  const handleToggleLike = async (song) => {
    const target = song || currentSong;
    if (!target) return;
    const { isLiked: nowLiked, updatedList } = await toggleLikeSong(target);
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
    Native.downloadFile(currentSong.streamUrl || '', filename, currentSong.name, 'audio/mp3');
    showToast(`Downloading: ${currentSong.name}`);
  };

  // Cinema
  const handleOpenMovie = async (movie) => {
    setActiveMovie(movie);
    showToast(`Loading: ${movie.title}…`);
    recordActivity(movie, 'movie');

    if (isPlaying) {
      Native.pauseMusic();
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
  };

  const handleDownloadMovie = () => {
    if (!cinemaVideoUrl || !activeMovie) {
      showToast('No active stream to download');
      return;
    }
    const clean = activeMovie.title.replace(/[/\\?%*:|"<>]/g, '');
    Native.downloadFile(cinemaVideoUrl, `${clean}.mp4`, activeMovie.title, 'video/mp4');
    showToast(`Downloading: ${clean}.mp4`);
  };

  const checkLiked = useCallback(
    (song) => isSongLiked(song, likedList),
    [likedList]
  );

  return (
    <View style={S.viewport}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0710" />

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

      <View style={S.content}>
        {activeTab === 'music' && (
          <MusicView
            songs={musicList}
            loading={musicLoading}
            activeCategory={activeCategory}
            onSelectCategory={handleSelectCategory}
            onPlaySong={handlePlaySong}
            onToggleLike={handleToggleLike}
            isLiked={checkLiked}
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
                    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (s.artist || '').toLowerCase().includes(searchQuery.toLowerCase()))
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
                    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (s.artist || '').toLowerCase().includes(searchQuery.toLowerCase()))
                : offlineList
            }
            onPlaySong={handlePlaySong}
            onToggleLike={handleToggleLike}
            isLiked={checkLiked}
            onRescan={() => {
              scanOfflineMusic();
              showToast('Device library updated');
            }}
            currentSong={currentSong}
          />
        )}

        {activeTab === 'downloads' && <DownloadsView downloads={downloadsList} />}
      </View>

      <PlayerBar
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={handleTogglePlay}
        onNext={handleNextSong}
        onPrev={handlePrevSong}
        onToggleLike={() => handleToggleLike(currentSong)}
        isLiked={checkLiked}
        onDownload={handleDownloadSong}
        onOpenModal={() => setIsMusicModalOpen(true)}
      />

      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSearchQuery('');
        }}
      />

      <MusicPlayerModal
        visible={isMusicModalOpen && !!currentSong}
        song={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        isLiked={currentSong ? checkLiked(currentSong) : false}
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

      <CinemaModal
        visible={!!activeMovie}
        movie={activeMovie}
        videoUrl={cinemaVideoUrl}
        episodes={movieEpisodes}
        currentEpisode={currentEpisode}
        qualities={movieQualities}
        currentQualityUrl={currentQualityUrl}
        recommendations={moviesList.filter(m => (m.id || m.subjectId) !== (activeMovie?.id || activeMovie?.subjectId))}
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
      />

      <Toast message={toastMsg} />
    </View>
  );
}

const S = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor: '#0B0710',
  },
  content: {
    flex: 1,
  },
});
