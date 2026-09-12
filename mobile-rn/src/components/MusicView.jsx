import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { Play, Heart, Flame, Globe, Sparkles, Tv, Radio, Headphones, Music } from 'lucide-react-native';
import { T } from '../theme';

const CATEGORIES = [
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'hindi', label: 'Hindi Hits', icon: Sparkles },
  { id: 'english', label: 'English Pop', icon: Globe },
  { id: 'anime', label: 'Anime OST', icon: Tv },
  { id: 'bangla', label: 'Bangla', icon: Radio },
  { id: 'lofi', label: 'Lofi Chill', icon: Headphones },
];

const { width } = Dimensions.get('window');
const CARD_W = (width - 32 - 12) / 2;

export default function MusicView({
  songs,
  loading,
  activeCategory,
  onSelectCategory,
  onPlaySong,
  onToggleLike,
  isLiked,
}) {
  return (
    <View style={S.page}>
      <View style={S.titleWrap}>
        <View style={S.titleRow}>
          <View style={S.indicator} />
          <Text style={S.h2}>Music Stream</Text>
        </View>
        <Text style={S.subtitle}>High quality 320kbps audio streaming & background player</Text>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={c => c.id}
        contentContainerStyle={S.pills}
        renderItem={({ item }) => {
          const Icon = item.icon;
          const isActive = activeCategory === item.id;
          return (
            <TouchableOpacity
              style={[S.pill, isActive && S.pillActive]}
              onPress={() => onSelectCategory(item.id)}
              activeOpacity={0.7}
            >
              <Icon size={14} color={isActive ? T.bg : T.sub} />
              <Text style={[S.pillText, isActive && S.pillTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={songs}
        keyExtractor={(s, i) => s.id || String(i)}
        numColumns={2}
        contentContainerStyle={S.grid}
        ListEmptyComponent={
          loading ? (
            <View style={S.loadingState}>
              <ActivityIndicator color={T.accent} />
              <Text style={S.loadingText}>Discovering music…</Text>
            </View>
          ) : (
            <View style={S.emptyState}>
              <Music size={40} color={T.sub} />
              <Text style={S.emptyText}>No tracks found. Try a different search query!</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const liked = isLiked(item);
          return (
            <TouchableOpacity
              style={[S.card, { marginRight: index % 2 === 0 ? 12 : 0 }]}
              activeOpacity={0.8}
              onPress={() => onPlaySong(item, songs, index)}
            >
              <View>
                <Image
                  source={{ uri: item.image || undefined }}
                  style={S.thumb}
                  defaultSource={undefined}
                />
                <View style={S.thumbGradient} />
                <TouchableOpacity
                  style={[S.likeBtn, liked && S.likeBtnActive]}
                  onPress={() => onToggleLike(item)}
                  hitSlop={6}
                >
                  <Heart size={15} color={liked ? T.pink : '#fff'} fill={liked ? T.pink : 'none'} />
                </TouchableOpacity>
                <View style={S.playOverlay}>
                  <Play size={16} color="#fff" fill="#fff" />
                </View>
              </View>
              <View style={S.cardInfo}>
                <Text style={S.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={S.cardSub} numberOfLines={1}>{item.artist}</Text>
              </View>
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
  pills: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
  },
  pillActive: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
  pillText: {
    color: T.sub,
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: T.bg,
  },
  grid: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    width: CARD_W,
    marginBottom: 14,
    backgroundColor: T.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: CARD_W * 0.9,
    backgroundColor: T.panel2,
  },
  thumbGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,7,16,0.15)',
  },
  likeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(11,7,16,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeBtnActive: {
    backgroundColor: 'rgba(11,7,16,0.8)',
  },
  playOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(6,182,212,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    padding: 10,
    gap: 2,
  },
  cardTitle: {
    color: T.text,
    fontSize: 13,
    fontWeight: '700',
  },
  cardSub: {
    color: T.sub,
    fontSize: 11,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 60,
  },
  loadingText: {
    color: T.sub,
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 60,
  },
  emptyText: {
    color: T.sub,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
