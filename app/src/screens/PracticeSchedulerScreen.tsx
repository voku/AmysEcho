import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Switch, Pressable } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { addSchedule, listSchedules, removeSchedule, setScheduleEnabled, PracticeSchedule } from '../services/practiceScheduler';
import { gestureModel } from '../model';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';
import { childHaptic } from '../services/feedbackService';
import { childFriendlyStyles } from '../styles/touchTargets';

export default function PracticeSchedulerScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [schedules, setSchedules] = useState<PracticeSchedule[]>([]);
  const [gestureId, setGestureId] = useState(gestureModel.gestures[0]?.id || 'hello');
  const [hour, setHour] = useState('17');
  const [minute, setMinute] = useState('0');
  const [days, setDays] = useState<number[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const load = async () => {
    setSchedules(await listSchedules());
  };

  useEffect(() => {
    load();
    loadProfile().then(setProfile);
  }, []);

  const styles = StyleSheet.create({
    container: { flex: 1, padding: SPACING.lg, backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface },
    title: { fontSize: largeText ? 24 : 20, marginBottom: SPACING.md, color: highContrast ? COLORS.highContrastText : COLORS.text },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
    label: { color: highContrast ? COLORS.highContrastText : COLORS.text, marginRight: SPACING.sm },
    input: { borderWidth: 1, padding: SPACING.xs, minWidth: 50, backgroundColor: COLORS.backgroundStart, color: COLORS.text, marginRight: SPACING.sm },
    listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.xs },
    dayButton: {
      padding: SPACING.xs,
      marginRight: SPACING.xs,
      borderWidth: 1,
      borderRadius: 4,
      borderColor: COLORS.primaryAccent,
      backgroundColor: COLORS.surface,
    },
    dayButtonSelected: { backgroundColor: COLORS.primaryAccent },
    dayButtonText: { color: highContrast ? COLORS.highContrastText : COLORS.text },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.sm,
      borderRadius: RADIUS,
      minWidth: 80,
      alignItems: 'center',
      marginHorizontal: SPACING.xs,
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 14,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 16,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
    gestureButton: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.primaryAccent,
      padding: SPACING.sm,
      borderRadius: RADIUS,
      minWidth: 80,
      alignItems: 'center',
      marginHorizontal: SPACING.xs,
    },
    gestureButtonSelected: {
      backgroundColor: COLORS.primaryAccent,
    },
    gestureButtonHC: {
      borderColor: COLORS.highContrastText,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    gestureButtonSelectedHC: {
      backgroundColor: COLORS.highContrastText,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Übungsplaner</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Geste</Text>
        <FlatList
          data={gestureModel.gestures}
          horizontal
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
             <Pressable
               style={({ pressed }) => [
                 childFriendlyStyles.minTouchTarget,
                 styles.gestureButton,
                 highContrast && styles.gestureButtonHC,
                 gestureId === item.id && (highContrast ? styles.gestureButtonSelectedHC : styles.gestureButtonSelected),
                 pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
               ]}
               onPress={() => {
                 void childHaptic();
                 setGestureId(item.id);
               }}
               accessibilityRole="button"
               accessibilityLabel={`Geste ${item.label} auswählen`}
               accessibilityState={{ selected: gestureId === item.id }}
             >
               <Text style={[
                 styles.buttonText,
                 largeText && styles.buttonTextLarge,
                 highContrast && styles.buttonTextHC,
                 gestureId === item.id && highContrast && { color: COLORS.highContrastBackground },
               ]}>
                 {item.label}
               </Text>
             </Pressable>
           )}
          style={{ maxHeight: 44 }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Zeit (24h)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={hour} onChangeText={setHour} accessibilityLabel="Stunde" />
        <Text style={styles.label}>:</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={minute} onChangeText={setMinute} accessibilityLabel="Minute" />
        <Pressable
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.button,
            highContrast && styles.buttonHC,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          onPress={async () => {
            void childHaptic();
            const h = Math.max(0, Math.min(23, parseInt(hour || '0', 10)));
            const m = Math.max(0, Math.min(59, parseInt(minute || '0', 10)));
            await addSchedule({ gestureId, hour: h, minute: m, daysOfWeek: days, enabled: true } as any);
            setDays([]);
            await load();
          }}
          accessibilityRole="button"
          accessibilityLabel="Plan hinzufügen"
        >
          <Text style={[
            styles.buttonText,
            largeText && styles.buttonTextLarge,
            highContrast && styles.buttonTextHC,
          ]}>
            Hinzufügen
          </Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Tage</Text>
        <FlatList
          data={dayLabels}
          horizontal
          keyExtractor={(d) => d}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() =>
                setDays((prev) =>
                  prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index],
                )
              }
              style={[styles.dayButton, days.includes(index) && styles.dayButtonSelected]}
              accessibilityLabel={item}
              accessibilityState={{ selected: days.includes(index) }}
            >
              <Text style={styles.dayButtonText}>{item}</Text>
            </Pressable>
          )}
          style={{ maxHeight: 44 }}
        />
      </View>

      <FlatList
        data={schedules}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.label}>
              {item.gestureId} @ {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')} (
              {item.daysOfWeek && item.daysOfWeek.length
                ? item.daysOfWeek.map((d) => dayLabels[d]).join(',')
                : 'täglich'})
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch value={item.enabled} onValueChange={async (v) => { await setScheduleEnabled(item.id, v); await load(); }} />
               <Pressable
                 style={({ pressed }) => [
             {
              minWidth: 60,
              minHeight: 60,
              padding: SPACING.sm,
              alignItems: 'center',
              justifyContent: 'center',
            },
                   styles.button,
                   highContrast && styles.buttonHC,
                   pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                 ]}
                 onPress={async () => {
                   void childHaptic();
                   await removeSchedule(item.id);
                   await load();
                 }}
                 accessibilityRole="button"
                 accessibilityLabel="Plan löschen"
               >
                 <Text style={[
                   styles.buttonText,
                   largeText && styles.buttonTextLarge,
                   highContrast && styles.buttonTextHC,
                 ]}>
                   Löschen
                 </Text>
               </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>Keine Pläne</Text>}
      />

      <Pressable
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.button,
          highContrast && styles.buttonHC,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        onPress={() => {
          void childHaptic();
          navigation.goBack();
        }}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          Zurück
        </Text>
      </Pressable>
      {profile && <BottomNav active="schedule" profileId={profile.id} />}
    </View>
  );
}
