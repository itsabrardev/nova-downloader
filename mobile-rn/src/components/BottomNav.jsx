import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Home, Film, Heart, FolderDown, Download } from 'lucide-react-native';
import { T } from '../theme';

const TABS = [
  { id: 'music', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'liked', label: 'Liked', icon: Heart, featured: true },
  { id: 'library', label: 'Offline', icon: FolderDown },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export default function BottomNav({ activeTab, onSelectTab }) {
  return (
    <View style={S.nav}>
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const color = tab.featured ? T.pink : isActive ? T.accent : T.sub;
        return (
          <TouchableOpacity
            key={tab.id}
            style={S.tab}
            onPress={() => onSelectTab(tab.id)}
            activeOpacity={0.7}
          >
            <View style={[S.iconWrap, isActive && S.iconWrapActive, tab.featured && S.iconWrapFeatured]}>
              <Icon size={tab.featured ? 19 : 18} color={color} strokeWidth={isActive ? 2.5 : 2} />
            </View>
            <Text style={[S.label, { color: isActive ? T.accent : T.sub }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: T.bgDeep,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 42,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(6,182,212,0.12)',
  },
  iconWrapFeatured: {
    backgroundColor: 'rgba(236,72,153,0.10)',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
});
