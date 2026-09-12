import React from 'react';
import { View, Text, TouchableOpacity, Image, Modal, StyleSheet, Dimensions } from 'react-native';
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
  Sparkles,
} from 'lucide-react-native';
import { T, formatTime } from '../theme';

const { width } = Dimensions.get('window');
const ART_SIZE = Math.min(width - 90, 300);

export default function MusicPlayerModal({
  visible,
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
  onClose,
}) {
  if (!song) return null;

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={S.modal}>
        <View style={S.header}>
          <TouchableOpacity onPress={onClose} style={S.roundBtn} hitSlop={8}>
            <ChevronDown size={22} color={T.text} />
          </TouchableOpacity>
          <View style={S.headerMeta}>
            <Text style={S.nowPlaying}>NOW PLAYING</Text>
            <Text style={S.album} numberOfLines={1}>{song.album || 'Cyberpunk Audio'}</Text>
          </View>
          <TouchableOpacity onPress={onToggleLike} style={S.roundBtn} hitSlop={8}>
            <Heart size={20} color={isLiked ? T.pink : T.text} fill={isLiked ? T.pink : 'none'} />
          </TouchableOpacity>
        </View>

        <View style={S.body}>
          <View style={[S.artWrap, isPlaying && S.artPlaying]}>
            {song.image ? (
              <Image source={{ uri: song.image }} style={S.art} />
            ) : (
              <View style={[S.art, S.artEmpty]}>
                <Sparkles size={40} color={T.accent2} />
              </View>
            )}
          </View>

          <View style={S.details}>
            <Text style={S.trackTitle} numberOfLines={2}>{song.name}</Text>
            <Text style={S.trackArtist} numberOfLines={1}>{song.artist}</Text>
            <View style={S.badge}>
              <Sparkles size={12} color={T.accent2} />
              <Text style={S.badgeText}>320kbps HD Audio</Text>
            </View>
          </View>

          {/* Seek bar: tap-to-seek viaPanResponder-free press zones */}
          <View style={S.timeline}>
            <View style={S.sliderBg}>
              <View style={[S.sliderFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={S.timeRow}>
              <Text style={S.time}>{formatTime(currentTime)}</Text>
              <Text style={S.time}>{formatTime(duration)}</Text>
            </View>
          </View>

          <View style={S.controlsRow}>
            <TouchableOpacity style={S.subCtrl} onPress={onToggleShuffle} hitSlop={6}>
              <Shuffle size={18} color={isShuffle ? T.accent : T.sub} />
            </TouchableOpacity>
            <TouchableOpacity style={S.subCtrl} onPress={() => onSeek && onSeek(Math.max(0, currentTime - 10))} hitSlop={6}>
              <RotateCcw size={20} color={T.sub} />
            </TouchableOpacity>

            <TouchableOpacity style={S.skipBtn} onPress={onPrev} hitSlop={6}>
              <SkipBack size={24} color={T.text} fill={T.text} />
            </TouchableOpacity>
            <TouchableOpacity style={S.playMain} onPress={onTogglePlay}>
              {isPlaying
                ? <Pause size={30} color="#fff" fill="#fff" />
                : <Play size={30} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
            </TouchableOpacity>
            <TouchableOpacity style={S.skipBtn} onPress={onNext} hitSlop={6}>
              <SkipForward size={24} color={T.text} fill={T.text} />
            </TouchableOpacity>

            <TouchableOpacity style={S.subCtrl} onPress={() => onSeek && onSeek(Math.min(duration || 1e9, currentTime + 10))} hitSlop={6}>
              <RotateCw size={20} color={T.sub} />
            </TouchableOpacity>
            <TouchableOpacity style={S.subCtrl} onPress={onToggleRepeat} hitSlop={6}>
              <Repeat size={18} color={isRepeat ? T.accent : T.sub} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={S.downloadBtn} onPress={onDownload}>
            <Download size={16} color={T.accent} />
            <Text style={S.downloadText}>Download 320k MP3</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: T.bg,
    paddingTop: 52,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMeta: {
    alignItems: 'center',
    gap: 2,
  },
  nowPlaying: {
    color: T.sub,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  album: {
    color: T.text,
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 18,
  },
  artWrap: {
    width: ART_SIZE + 16,
    height: ART_SIZE + 16,
    borderRadius: (ART_SIZE + 16) / 2,
    backgroundColor: T.panel2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artPlaying: {
    borderColor: T.accent,
    shadowColor: T.accent,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  art: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: ART_SIZE / 2,
  },
  artEmpty: {
    backgroundColor: T.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    alignItems: 'center',
    marginTop: 22,
    gap: 4,
  },
  trackTitle: {
    color: T.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  trackArtist: {
    color: T.sub,
    fontSize: 13,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  badgeText: {
    color: T.accent2,
    fontSize: 10,
    fontWeight: '700',
  },
  timeline: {
    width: '100%',
    marginTop: 26,
  },
  sliderBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: T.panel,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  sliderFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: T.accent,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  time: {
    color: T.sub,
    fontSize: 11,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 26,
    flexWrap: 'wrap',
  },
  subCtrl: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playMain: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    marginTop: 28,
    marginBottom: 30,
  },
  downloadText: {
    color: T.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
