import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Play, Shuffle, RotateCw, Music2, Heart, HardDrive } from 'lucide-react-native';
import { T } from '../theme';

export default function LibraryView({ offlineSongs, onPlaySong, onToggleLike, isLiked, onRescan, currentSong }) {
  return (
    <View style={S.page}>
      <View style={S.titleWrap}>
        <View style={S.titleRow}>
          <View style={[S.indicator, { backgroundColor: T.accent }]} />
          <Text style={S.h2}>Offline Storage</Text>
        </View>
        <Text style={S.subtitle}>{offlineSongs.length} downloaded tracks on local device</Text>
      </View>

      <View style={S.toolbar}>
        <TouchableOpacity
          style={S.btnPrimary}
          onPress={() => offlineSongs.length && onPlaySong(offlineSongs[0], offlineSongs, 0)}
        >
          <Play size={15} color={T.bg} fill={T.bg} />
          <Text style={S.btnPrimaryText}>Play All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={S.btnSecondary}
          onPress={() => {
            if (!offlineSongs.length) return;
            const shuffled = [...offlineSongs].sort(() => Math.random() - 0.5);
            onPlaySong(shuffled[0], shuffled, 0);
          }}
        >
          <Shuffle size={15} color={T.text} />
          <Text style={S.btnSecondaryText}>Shuffle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.btnSecondary} onPress={onRescan}>
          <RotateCw size={15} color={T.text} />
          <Text style={S.btnSecondaryText}>Rescan</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={offlineSongs}
        keyExtractor={(s, i) => s.id || String(i)}
        contentContainerStyle={S.list}
        ListEmptyComponent={
          <View style={S.empty}>
            <HardDrive size={44} color={T.sub} strokeWidth={1.5} />
            <Text style={S.emptyTitle}>No local audio detected</Text>
            <Text style={S.emptyDesc}>Scan your device storage or download music to listen offline without internet.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const liked = isLiked(item);
          const isPlayingThis = currentSong && (currentSong.id === item.id || currentSong.name === item.name);
          return (
            <TouchableOpacity
              style={[S.item, isPlayingThis && S.itemPlaying]}
              activeOpacity={0.7}
              onPress={() => onPlaySong(item, offlineSongs, index)}
            >
              <View style={S.itemLeft}>
                <View style={S.itemThumb}>
                  <Music2 size={18} color={T.accent} />
                </View>
                <View style={S.itemMeta}>
                  <Text style={[S.itemTitle, isPlayingThis && { color: T.accent }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={S.itemSub} numberOfLines={1}>{item.artist} • {item.format || 'AUDIO'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => onToggleLike(item)} hitSlop={8}>
                <Heart size={17} color={liked ? T.pink : T.sub} fill={liked ? T.pink : 'none'} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const S = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: T.bg,
  },
  titleWrap: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: T.accent,
  },
  h2: {
    color: T.text,
    fontSize: 19,
    fontWeight: '800',
  },
  subtitle: {
    color: T.sub,
    fontSize: 11,
    marginTop: 4,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 13,
    backgroundColor: T.accent,
  },
  btnPrimaryText: {
    color: T.bg,
    fontSize: 12,
    fontWeight: '800',
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 13,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
  },
  btnSecondaryText: {
    color: T.text,
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    color: T.sub,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  itemPlaying: {
    borderColor: T.accent,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  itemThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: T.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: T.text,
    fontSize: 13,
    fontWeight: '700',
  },
  itemSub: {
    color: T.sub,
    fontSize: 11,
  },
});
