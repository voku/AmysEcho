import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

export function SymbolCard({
  gesture, confidence, onShowDgs,
}: { gesture: string; confidence: number; onShowDgs: () => void }) {
  const map: Record<string, any> = {
    OPEN_PALM: require('../../assets/symbols/open_palm.png'),
    CLOSED_FIST: require('../../assets/symbols/closed_fist.png'),
    THUMB_UP: require('../../assets/symbols/thumb_up.png'),
  };

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onShowDgs(); }}
      accessibilityLabel={`Symbol ${gesture}, ${Math.round(confidence * 100)} Prozent sicher. Doppeltippen für DGS Video.`}
    >
      <Image source={map[gesture] ?? map.OPEN_PALM} style={s.img} />
      <Text style={s.title}>{gesture.replace('_', ' ')}</Text>
      <Text style={s.sub}>{Math.round(confidence * 100)}%</Text>
      <Text style={s.hint}>Tippen für DGS‑Video</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center', minWidth: 180 },
  img: { width: 80, height: 80, marginBottom: 8 },
  title: { fontWeight: '700', fontSize: 18, textTransform: 'capitalize' },
  sub: { opacity: 0.7 },
  hint: { fontSize: 12, color: '#3498db' },
});
