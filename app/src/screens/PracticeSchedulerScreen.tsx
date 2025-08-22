import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, FlatList, TextInput, Switch } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import { addSchedule, listSchedules, removeSchedule, setScheduleEnabled, PracticeSchedule } from '../services/practiceScheduler';
import { gestureModel } from '../model';

export default function PracticeSchedulerScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [schedules, setSchedules] = useState<PracticeSchedule[]>([]);
  const [gestureId, setGestureId] = useState(gestureModel.gestures[0]?.id || 'hello');
  const [hour, setHour] = useState('17');
  const [minute, setMinute] = useState('0');

  const load = async () => {
    setSchedules(await listSchedules());
  };

  useEffect(() => {
    load();
  }, []);

  const styles = StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg, backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface },
    title: { fontSize: largeText ? 24 : 20, marginBottom: SPACING.md, color: highContrast ? COLORS.highContrastText : COLORS.text },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
    label: { color: highContrast ? COLORS.highContrastText : COLORS.text, marginRight: SPACING.sm },
    input: { borderWidth: 1, padding: SPACING.xs, minWidth: 50, backgroundColor: COLORS.backgroundStart, color: COLORS.text, marginRight: SPACING.sm },
    listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.xs },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Practice Scheduler</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Gesture</Text>
        <FlatList
          data={gestureModel.gestures}
          horizontal
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <Button title={item.label} color={gestureId === item.id ? COLORS.primaryAccent : undefined} onPress={() => setGestureId(item.id)} />
          )}
          style={{ maxHeight: 44 }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Time (24h)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={hour} onChangeText={setHour} accessibilityLabel="Hour" />
        <Text style={styles.label}>:</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={minute} onChangeText={setMinute} accessibilityLabel="Minute" />
        <Button title="Add" onPress={async () => {
          const h = Math.max(0, Math.min(23, parseInt(hour || '0', 10)));
          const m = Math.max(0, Math.min(59, parseInt(minute || '0', 10)));
          await addSchedule({ gestureId, hour: h, minute: m, daysOfWeek: [], enabled: true } as any);
          await load();
        }} accessibilityLabel="Add schedule" />
      </View>

      <FlatList
        data={schedules}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.label}>{item.gestureId} @ {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch value={item.enabled} onValueChange={async (v) => { await setScheduleEnabled(item.id, v); await load(); }} />
              <Button title="Delete" onPress={async () => { await removeSchedule(item.id); await load(); }} accessibilityLabel="Delete schedule" />
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>No schedules</Text>}
      />

      <Button title="Back" onPress={() => navigation.goBack()} accessibilityLabel="Zurück" />
    </View>
  );
}

