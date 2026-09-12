import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, Heart, DownloadCloud, AlertCircle } from 'lucide-react-native';
import { T } from '../theme';

export default function Toast({ message }) {
  if (!message) return null;

  const m = message.toLowerCase();
  let Icon = CheckCircle2;
  let color = T.green;
  if (m.includes('favorite') || m.includes('liked')) {
    Icon = Heart;
    color = T.pink;
  } else if (m.includes('download')) {
    Icon = DownloadCloud;
    color = T.accent;
  } else if (m.includes('error') || m.includes('no ')) {
    Icon = AlertCircle;
    color = T.orange;
  }

  return (
    <View style={S.toast}>
      <Icon size={16} color={color} />
      <Text style={S.text} numberOfLines={2}>{message}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.panel,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: {
    flex: 1,
    color: T.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
