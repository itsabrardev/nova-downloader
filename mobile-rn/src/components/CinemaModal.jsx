import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, Modal, StyleSheet, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Star,
  Sparkles,
  Tv,
  Film,
} from 'lucide-react-native';
import { T, formatTime } from '../theme';

const { width } = Dimensions.get('window');

export default function CinemaModal({
  visible,
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
}) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBuffering(!!videoUrl);
  }, [videoUrl]);

  if (!movie) return null;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.resume();
      setIsPlaying(true);
    }
  };

  const skipSeconds = (seconds) => {
    if (!videoRef.current) return;
    videoRef.current.seek(Math.max(0, Math.min(duration, currentTime + seconds)));
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={S.modal}>
        <View style={S.header}>
          <TouchableOpacity style={S.backBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={16} color={T.text} />
            <Text style={S.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle} numberOfLines={1}>{movie.title}</Text>
        </View>

        {/* 16:9 Video Player */}
        <View style={S.videoWrap}>
          {videoUrl ? (
            <>
              <Video
                ref={videoRef}
                source={{ uri: videoUrl }}
                style={S.video}
                resizeMode="contain"
                playInBackground={false}
                muted={isMuted}
                paused={!isPlaying}
                onLoad={(d) => {
                  setDuration(d.duration || 0);
                  setBuffering(false);
                  setIsPlaying(true);
                }}
                onProgress={(d) => setCurrentTime(d.currentTime || 0)}
                onEnd={() => setIsPlaying(false)}
                onError={(e) => {
                  setBuffering(false);
                  console.warn('Video error:', e);
                }}
                headers={{
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                  Referer: 'https://videodownloader.site/',
                }}
              />
              {buffering && (
                <View style={S.bufferOverlay}>
                  <ActivityIndicator color={T.accent} />
                  <Text style={S.bufferText}>Connecting to CDN stream…</Text>
                </View>
              )}
              <TouchableOpacity style={S.centerPlay} onPress={togglePlay} activeOpacity={0.8}>
                {isPlaying
                  ? <Pause size={28} color="#fff" fill="#fff" />
                  : <Play size={28} color="#fff" fill="#fff" />}
              </TouchableOpacity>
              <View style={S.videoControls}>
                <View style={S.seekBar}>
                  <View style={[S.seekFill, { width: `${progressPercent}%` }]} />
                </View>
                <View style={S.ctrlRow}>
                  <View style={S.ctrlLeft}>
                    <TouchableOpacity onPress={togglePlay} hitSlop={6}>
                      {isPlaying
                        ? <Pause size={18} color="#fff" fill="#fff" />
                        : <Play size={18} color="#fff" fill="#fff" />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => skipSeconds(-10)} hitSlop={6}>
                      <RotateCcw size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => skipSeconds(10)} hitSlop={6}>
                      <RotateCw size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsMuted(!isMuted)} hitSlop={6}>
                      {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
                    </TouchableOpacity>
                    <Text style={S.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
                  </View>
                  <Maximize2 size={18} color="#fff" />
                </View>
              </View>
            </>
          ) : (
            <View style={S.bufferOverlay}>
              <ActivityIndicator color={T.accent} />
              <Text style={S.bufferText}>Connecting to CDN stream…</Text>
            </View>
          )}
        </View>

        <ScrollView style={S.meta} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={S.metaHeader}>
            <Text style={S.title}>{movie.title}</Text>
            <View style={S.tags}>
              <View style={S.badgeRating}>
                <Star size={11} color={T.gold} fill={T.gold} />
                <Text style={S.badgeRatingText}>{movie.rating || '8.8'}</Text>
              </View>
              {!!movie.year && <View style={S.badgeYear}><Text style={S.badgeYearText}>{movie.year}</Text></View>}
              <View style={S.badgeType}>
                {movie.subjectType === 2 ? <Tv size={11} color={T.accent} /> : <Film size={11} color={T.accent} />}
                <Text style={S.badgeTypeText}>{movie.subjectType === 2 ? 'Series' : 'Movie'}</Text>
              </View>
            </View>
          </View>

          {qualities.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionLabel}>Quality:</Text>
              <View style={S.qualityRow}>
                {qualities.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[S.qualityPill, q.url === currentQualityUrl && S.qualityPillActive]}
                    onPress={() => onSelectQuality(q.url)}
                  >
                    <Text style={[S.qualityText, q.url === currentQualityUrl && { color: T.bg }]}>
                      {q.quality}
                    </Text>
                    {!!q.size && <Text style={[S.qualitySize, q.url === currentQualityUrl && { color: T.bg }]}>{q.size}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {episodes.length > 0 && (
            <View style={S.section}>
              <Text style={S.sectionLabel}>Episodes ({episodes.length}):</Text>
              <View style={S.epRow}>
                {episodes.map(ep => (
                  <TouchableOpacity
                    key={`${ep.se}-${ep.ep}`}
                    style={[
                      S.epPill,
                      currentEpisode && currentEpisode.ep === ep.ep && currentEpisode.se === ep.se && S.epPillActive,
                    ]}
                    onPress={() => onSelectEpisode(ep)}
                  >
                    <Text style={[
                      S.epText,
                      currentEpisode && currentEpisode.ep === ep.ep && currentEpisode.se === ep.se && { color: T.bg },
                    ]}>
                      {ep.se > 1 ? `S${ep.se} ` : ''}EP {ep.ep}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={S.downloadAction} onPress={onDownload} disabled={!videoUrl} activeOpacity={0.8}>
            <Download size={16} color={T.accent} />
            <Text style={S.downloadActionText}>Download MP4</Text>
          </TouchableOpacity>

          {recommendations.length > 0 && (
            <View style={S.recSection}>
              <View style={S.recHeader}>
                <Sparkles size={15} color={T.accent} />
                <Text style={S.recTitle}>More Like This</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={recommendations.slice(0, 10)}
                keyExtractor={(m, i) => m.id || String(i)}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={S.recCard} onPress={() => onSelectMovie && onSelectMovie(item)} activeOpacity={0.8}>
                    <Image source={{ uri: item.image || undefined }} style={S.recThumb} />
                    <View style={S.recPlay}>
                      <Play size={14} color="#fff" fill="#fff" />
                    </View>
                    <Text style={S.recText} numberOfLines={1}>{item.title}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: T.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 36,
  },
  backText: {
    color: T.text,
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    color: T.text,
    fontSize: 14,
    fontWeight: '700',
  },
  videoWrap: {
    width,
    height: width * 0.5625,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bufferText: {
    color: T.dim,
    fontSize: 12,
  },
  centerPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,7,16,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seekBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 8,
  },
  seekFill: {
    height: 4,
    backgroundColor: T.accent,
  },
  ctrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctrlLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timeText: {
    color: '#fff',
    fontSize: 11,
  },
  meta: {
    flex: 1,
    paddingHorizontal: 16,
  },
  metaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 10,
  },
  title: {
    flex: 1,
    color: T.text,
    fontSize: 18,
    fontWeight: '800',
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeRatingText: {
    color: T.gold,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeYear: {
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeYearText: {
    color: T.dim,
    fontSize: 11,
  },
  badgeType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeTypeText: {
    color: T.accent,
    fontSize: 11,
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    color: T.sub,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  qualityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  qualityPillActive: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
  qualityText: {
    color: T.text,
    fontSize: 12,
    fontWeight: '600',
  },
  qualitySize: {
    color: T.sub,
    fontSize: 10,
  },
  epRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  epPill: {
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  epPillActive: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
  epText: {
    color: T.text,
    fontSize: 12,
    fontWeight: '600',
  },
  downloadAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 16,
  },
  downloadActionText: {
    color: T.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  recSection: {
    marginTop: 4,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  recTitle: {
    color: T.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recCard: {
    width: 110,
  },
  recThumb: {
    width: 110,
    height: 155,
    borderRadius: 12,
    backgroundColor: T.panel2,
  },
  recPlay: {
    position: 'absolute',
    bottom: 26,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(6,182,212,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recText: {
    color: T.dim,
    fontSize: 11,
    marginTop: 6,
  },
});
