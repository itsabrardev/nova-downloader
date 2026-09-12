import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DownloadCloud, CheckCircle2 } from 'lucide-react-native';
import { T } from '../theme';

export default function DownloadsView({ downloads = [] }) {
  return (
    <View style={S.page}>
      <View style={S.titleWrap}>
        <View style={S.titleRow}>
          <View style={[S.indicator, { backgroundColor: T.gold }]} />
          <Text style={S.h2}>Download Manager</Text>
        </View>
        <Text style={S.subtitle}>Saved directly to your phone's Download directory</Text>
      </View>

      {downloads.length === 0 ? (
        <View style={S.empty}>
          <DownloadCloud size={44} color={T.accent} strokeWidth={1.5} />
          <Text style={S.emptyTitle}>No active downloads</Text>
          <Text style={S.emptyDesc}>
            Tap download on any song or video stream to save files locally for offline enjoyment.
          </Text>
        </View>
      ) : (
        <View style={S.list}>
          {downloads.map((d, i) => (
            <View key={i} style={S.item}>
              <CheckCircle2 size={18} color={T.green} />
              <View style={S.itemMeta}>
                <Text style={S.itemTitle} numberOfLines={1}>{d.name}</Text>
                <Text style={S.itemSub}>{d.status || 'Completed'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
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
    marginBottom: 16,
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
    backgroundColor: T.gold,
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
  list: {
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
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
