import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { LanguageManager } from '../services/LanguageManager';

interface PrivacySettingsProps {
  onClose?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PrivacySettings(_: PrivacySettingsProps) {
  const { largeText, highContrast } = useAccessibility();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [gestureLoggingEnabled, setGestureLoggingEnabled] = useState(true); // Essential for app function
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(false);
  const [dataRetentionDays, setDataRetentionDays] = useState(30);

  const handleSaveSettings = () => {
    // In real app, save to storage
    Alert.alert(
      LanguageManager.t('privacy.settings_saved'),
      LanguageManager.t('privacy.settings_saved_desc')
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.backgroundStart,
    },
    header: {
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.surface : COLORS.primaryAccent,
      alignItems: 'center',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      padding: SPACING.md,
    },
    section: {
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
    },
    settingItem: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    settingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    settingTitle: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    settingDescription: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginTop: SPACING.xs,
    },
    toggleContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      padding: 2,
      justifyContent: 'center',
    },
    toggleEnabled: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    toggleDisabled: {
      backgroundColor: highContrast ? COLORS.border : COLORS.textMuted,
    },
    toggleKnob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'white',
    },
    toggleKnobEnabled: {
      alignSelf: 'flex-end',
    },
    toggleKnobDisabled: {
      alignSelf: 'flex-start',
    },
    essentialBadge: {
      backgroundColor: highContrast ? COLORS.primaryAccent : '#FFF3CD',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS,
      marginLeft: SPACING.sm,
    },
    essentialText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : '#856404',
      fontWeight: 'bold',
    },
    retentionContainer: {
      marginTop: SPACING.sm,
    },
    retentionOptions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
    },
    retentionOption: {
      flex: 1,
      alignItems: 'center',
      padding: SPACING.sm,
      marginHorizontal: SPACING.xs,
      borderRadius: RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    retentionOptionSelected: {
      backgroundColor: highContrast ? COLORS.primaryAccent : COLORS.primaryAccent,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    retentionText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    retentionTextSelected: {
      color: highContrast ? COLORS.highContrastBackground : 'white',
    },
    saveButton: {
      backgroundColor: highContrast ? COLORS.primaryAccent : COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    saveButtonText: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
    },
    privacyNotice: {
      backgroundColor: highContrast ? COLORS.surface : '#E3F2FD',
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginTop: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : '#2196F3',
    },
    privacyTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : '#1976D2',
      marginBottom: SPACING.sm,
    },
    privacyText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      lineHeight: largeText ? 18 : 16,
    },
  });

  const Toggle = ({ value, onValueChange, disabled = false }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
  }) => (
    <Pressable
      style={[
        styles.toggle,
        value ? styles.toggleEnabled : styles.toggleDisabled,
      ]}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={[
        styles.toggleKnob,
        value ? styles.toggleKnobEnabled : styles.toggleKnobDisabled,
      ]} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{LanguageManager.t('privacy.title')}</Text>
        <Text style={styles.subtitle}>{LanguageManager.t('privacy.subtitle')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LanguageManager.t('privacy.data_collection')}</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingTitle}>{LanguageManager.t('privacy.gesture_logging')}</Text>
              <View style={styles.essentialBadge}>
                <Text style={styles.essentialText}>{LanguageManager.t('privacy.essential')}</Text>
              </View>
              <View style={styles.toggleContainer}>
                <Toggle
                  value={gestureLoggingEnabled}
                  onValueChange={setGestureLoggingEnabled}
                  disabled={true} // Essential feature
                />
              </View>
            </View>
            <Text style={styles.settingDescription}>
              {LanguageManager.t('privacy.gesture_logging_desc')}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingTitle}>{LanguageManager.t('privacy.analytics')}</Text>
              <View style={styles.toggleContainer}>
                <Toggle
                  value={analyticsEnabled}
                  onValueChange={setAnalyticsEnabled}
                />
              </View>
            </View>
            <Text style={styles.settingDescription}>
              {LanguageManager.t('privacy.analytics_desc')}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingTitle}>{LanguageManager.t('privacy.cloud_backup')}</Text>
              <View style={styles.toggleContainer}>
                <Toggle
                  value={cloudBackupEnabled}
                  onValueChange={setCloudBackupEnabled}
                />
              </View>
            </View>
            <Text style={styles.settingDescription}>
              {LanguageManager.t('privacy.cloud_backup_desc')}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LanguageManager.t('privacy.data_retention')}</Text>

          <View style={styles.settingItem}>
            <Text style={styles.settingTitle}>{LanguageManager.t('privacy.retention_period')}</Text>
            <Text style={styles.settingDescription}>
              {LanguageManager.t('privacy.retention_desc')}
            </Text>

            <View style={styles.retentionContainer}>
              <View style={styles.retentionOptions}>
                {[7, 30, 90].map((days) => (
                  <Pressable
                    key={days}
                    style={[
                      styles.retentionOption,
                      dataRetentionDays === days && styles.retentionOptionSelected,
                    ]}
                    onPress={() => setDataRetentionDays(days)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: dataRetentionDays === days }}
                  >
                    <Text style={[
                      styles.retentionText,
                      dataRetentionDays === days && styles.retentionTextSelected,
                    ]}>
                      {days} {LanguageManager.t('privacy.days')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.privacyNotice}>
          <Text style={styles.privacyTitle}>{LanguageManager.t('privacy.privacy_notice')}</Text>
          <Text style={styles.privacyText}>
            {LanguageManager.t('privacy.privacy_notice_text')}
          </Text>
        </View>

        <Pressable
          style={styles.saveButton}
          onPress={handleSaveSettings}
          accessibilityRole="button"
          accessibilityLabel={LanguageManager.t('privacy.save_settings')}
        >
          <Text style={styles.saveButtonText}>{LanguageManager.t('privacy.save_settings')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}