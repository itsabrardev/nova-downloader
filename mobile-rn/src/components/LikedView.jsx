import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet } from 'react-native';
import { Play, Shuffle, Heart, Music } from 'lucide-react-native';
import { T } from '../theme';

export default function LikedView({ likedSongs, onPlaySong, onToggleLike, currentSong }) {
  if (!likedSongs.length) {
    return (
      <View style={S.page}>
        <View style={S.titleWrap}>
          <View style={S.titleRow}>
            <View style={[S.indicator, { backgroundColor: T.pink }]} />
            <Text style={S.h2}>Favorite Tracks</Text>
          </View>
          <Text style={S.subtitle}>0 saved tracks</Text>
        </View>
        <View style={S.empty}>
          <Heart size={48} color={T.pink} strokeWidth={1.5} />
          <Text style={S.emptyTitle}>Your favorite collection is empty</Text>
          <Text style={S.emptyDesc}>
            Tap the heart icon on any music card or the mini player to build your personal offline-ready playlist!
          </Text>
        </View>
      </View>
    );
  }

  const playShuffle = () => {
    const rand = Math.floor(Math.random() * likedSongs.length);
    onPlaySong(likedSongs[rand], likedSongs, rand);
  };

  return (
    <View style={S.page}>
      <View style={S.titleWrap}>
        <View style={S.titleRow}>
          <View style={[S.indicator, { backgroundColor: T.pink }]} />
          <Text style={S.h2}>Favorite Tracks</Text>
        </View>
        <Text style={S.subtitle}>{likedSongs.length} tracks in collection</Text>
      </View>

      {/* Featured now-playing hero card */}
      <View style={S.heroWrap}>
        <TouchableOpacity
          style={S.heroCard}
          activeOpacity={0.85}
          onPress={() => onPlaySong(likedSongs[0], likedSongs, 0)}
        >
          <Image source={{ uri: likedSongs[0].image || undefined }} style={S.heroArt} />
          <View style={S.heroPlay}>
            <Play size={22} color="#fff" fill="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={S.heroTitle} numberOfLines={1}>{likedSongs[0].name}</Text>
        <Text style={S.heroArtist} numberOfLines={1}>{likedSongs[0].artist}</Text>
      </View>

      <View style={S.toolbar}>
        <TouchableOpacity style={S.btnPrimary} onPress={() => onPlaySong(likedSongs[0], likedSongs, 0)}>
          <Play size={15} color={T.bg} fill={T.bg} />
          <Text style={S.btnPrimaryText}>Play All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.btnSecondary} onPress={playShuffle}>
          <Shuffle size={15} color={T.text} />
          <Text style={S.btnSecondaryText}>Shuffle</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={likedSongs}
        keyExtractor={(s, i) => s.id || String(i)}
        contentContainerStyle={S.list}
        renderItem={({ item, index }) => {
          const isPlayingThis = currentSong && (currentSong.id === item.id || currentSong.name === item.name);
          return (
            <TouchableOpacity
              style={[S.item, isPlayingThis && S.itemPlaying]}
              activeOpacity={0.7}
              onPress={() => onPlaySong(item, likedSongs, index)}
            >
              <View style={S.itemLeft}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={S.itemThumb} />
                ) : (
                  <View style={[S.itemThumb, S.itemThumbEmpty]}>
                    <Music size={16} color={T.sub} />
                  </View>
                )}
                <View style={S.itemMeta}>
                  <Text style={[S.itemTitle, isPlayingThis && { color: T.pink }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={S.itemSub} numberOfLines={1}>{item.artist}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => onToggleLike(item)}
                hitSlop={8}
              >
                <Heart size={17} color={T.pink} fill={T.pink} />
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
    backgroundColor: T.pink,
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
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 80,
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
  heroWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  heroCard: {
    width: 200,
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: T.panel2,
    borderWidth: 1,
    borderColor: T.border,
  },
  heroArt: {
    width: '100%',
    height: '100%',
  },
  heroPlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(236,72,153,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: T.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  heroArtist: {
    color: T.sub,
    fontSize: 12,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 13,
    backgroundColor: T.pink,
  },
  btnPrimaryText: {
    color: T.bg,
    fontSize: 13,
    fontWeight: '800',
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 13,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
  },
  btnSecondaryText: {
    color: T.text,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    borderColor: T.pink,
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
  },
  itemThumbEmpty: {
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
