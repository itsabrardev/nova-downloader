import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Search, X, RotateCw, Sparkles } from 'lucide-react-native';
import { T } from '../theme';

export default function Header({ activeTab, searchQuery, setSearchQuery, onRefresh }) {
  const getPlaceholder = () => {
    switch (activeTab) {
      case 'movies':
        return 'Search movies, series, anime…';
      case 'liked':
        return 'Search liked songs…';
      case 'library':
        return 'Search offline library…';
      default:
        return 'Search songs, artists, albums…';
    }
  };

  return (
    <View style={S.topBar}>
      <View style={S.topRow}>
        <View style={S.brand}>
          <View style={S.brandLogo}>
            <Sparkles size={16} color={T.accent} />
          </View>
          <View>
            <Text style={S.brandName}>NOVA</Text>
            <Text style={S.brandSub}>STUDIO</Text>
          </View>
        </View>
        <TouchableOpacity style={S.iconBtn} onPress={onRefresh} activeOpacity={0.7}>
          <RotateCw size={17} color={T.text} />
        </TouchableOpacity>
      </View>

      <View style={S.searchBox}>
        <Search size={16} color={T.sub} />
        <TextInput
          style={S.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={getPlaceholder()}
          placeholderTextColor={T.sub}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <X size={15} color={T.sub} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  topBar: {
    paddingTop: 48,
    paddingHorizontal: 16,
    backgroundColor: T.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: T.panel2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: T.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandSub: {
    color: T.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: T.panel2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: T.text,
    fontSize: 14,
    paddingVertical: 0,
  },
});
