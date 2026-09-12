import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Play, Pause, SkipBack, SkipForward, Download, Heart, Music } from 'lucide-react-native';
import { T } from '../theme';

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
  onOpenModal,
}) {
  if (!currentSong) return null;
  const liked = isLiked(currentSong);
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <TouchableOpacity style={S.bar} onPress={onOpenModal} activeOpacity={0.9}>
      <View style={[S.progressBg]}>
        <View style={[S.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      <View style={S.row}>
        <View style={S.left}>
          {currentSong.image ? (
            <Image source={{ uri: currentSong.image }} style={S.art} />
          ) : (
            <View style={[S.art, S.artEmpty]}>
              <Music size={18} color={T.sub} />
            </View>
          )}
          <View style={S.info}>
            <Text style={S.title} numberOfLines={1}>{currentSong.name || 'Unknown Track'}</Text>
            <Text style={S.artist} numberOfLines={1}>{currentSong.artist || 'Nova Music'}</Text>
          </View>
        </View>

        <View style={S.controls}>
          <TouchableOpacity onPress={onToggleLike} hitSlop={6} style={S.ctrlBtn}>
            <Heart size={16} color={liked ? T.pink : T.text} fill={liked ? T.pink : 'none'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onPrev} hitSlop={6} style={S.ctrlBtn}>
            <SkipBack size={16} color={T.text} fill={T.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onTogglePlay} style={S.playBtn}>
            {isPlaying
              ? <Pause size={17} color="#fff" fill="#fff" />
              : <Play size={17} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} hitSlop={6} style={S.ctrlBtn}>
            <SkipForward size={16} color={T.text} fill={T.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDownload} hitSlop={6} style={S.ctrlBtn}>
            <Download size={16} color={T.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const S = StyleSheet.create({
  bar: {
    backgroundColor: T.bgDeep,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  progressBg: {
    height: 3,
    backgroundColor: T.panel,
    flexDirection: 'row',
  },
  progressFill: {
    height: 3,
    backgroundColor: T.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  art: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: T.panel2,
  },
  artEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: T.text,
    fontSize: 13,
    fontWeight: '700',
  },
  artist: {
    color: T.sub,
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctrlBtn: {
    padding: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
