import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { Play, Star, Flame, Tv, Zap, Shield, Rocket, Film } from 'lucide-react-native';
import { T } from '../theme';

const GENRES = [
  { id: 'popular', label: 'Trending', icon: Flame },
  { id: 'anime', label: 'Anime', icon: Tv },
  { id: 'action', label: 'Action', icon: Zap },
  { id: 'superhero', label: 'Superhero', icon: Shield },
  { id: 'scifi', label: 'Sci-Fi', icon: Rocket },
];

const { width } = Dimensions.get('window');
const CARD_W = (width - 32 - 12) / 2;

export default function MoviesView({ movies, loading, activeGenre, onSelectGenre, onOpenMovie }) {
  return (
    <View style={S.page}>
      <View style={S.titleWrap}>
        <View style={S.titleRow}>
          <View style={S.indicator} />
          <Text style={S.h2}>Movies & Series</Text>
        </View>
        <Text style={S.subtitle}>Direct stream & ultra-fast download in 1080p Full HD</Text>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={GENRES}
        keyExtractor={g => g.id}
        contentContainerStyle={S.pills}
        renderItem={({ item }) => {
          const Icon = item.icon;
          const isActive = activeGenre === item.id;
          return (
            <TouchableOpacity
              style={[S.pill, isActive && S.pillActive]}
              onPress={() => onSelectGenre(item.id)}
              activeOpacity={0.7}
            >
              <Icon size={14} color={isActive ? T.bg : T.sub} />
              <Text style={[S.pillText, isActive && S.pillTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={movies}
        keyExtractor={(m, i) => m.id || String(i)}
        numColumns={2}
        contentContainerStyle={S.grid}
        ListEmptyComponent={
          loading ? (
            <View style={S.loadingState}>
              <ActivityIndicator color={T.accent} />
              <Text style={S.loadingText}>Loading cinema catalog…</Text>
            </View>
          ) : (
            <View style={S.emptyState}>
              <Film size={40} color={T.sub} />
              <Text style={S.emptyText}>No titles found. Try searching a different movie or anime name!</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[S.card, { marginRight: 0 }]}
            activeOpacity={0.8}
            onPress={() => onOpenMovie(item)}
          >
            <View style={{ width: CARD_W }}>
              <Image source={{ uri: item.image || undefined }} style={S.thumb} />
              <View style={S.thumbGradient} />
              <View style={S.ratingBadge}>
                <Star size={11} color={T.gold} fill={T.gold} />
                <Text style={S.ratingText}>{item.rating || '8.8'}</Text>
              </View>
              {!!item.year && (
                <View style={S.yearBadge}>
                  <Text style={S.yearText}>{item.year}</Text>
                </View>
              )}
              <View style={S.playOverlay}>
                <Play size={16} color="#fff" fill="#fff" />
              </View>
            </View>
            <View style={S.cardInfo}>
              <Text style={S.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={S.cardSub}>{item.year || 'Cinema'} • {item.subjectType === 2 ? 'TV Series' : 'Movie'}</Text>
            </View>
          </TouchableOpacity>
        )}
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
    marginBottom: 14,
    backgroundColor: T.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: CARD_W * 1.1,
    backgroundColor: T.panel2,
  },
  thumbGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,7,16,0.1)',
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,7,16,0.75)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingText: {
    color: T.gold,
    fontSize: 10,
    fontWeight: '700',
  },
  yearBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(11,7,16,0.75)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  yearText: {
    color: T.dim,
    fontSize: 10,
    fontWeight: '600',
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
    width: CARD_W,
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
