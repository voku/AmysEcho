import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { SPACING, COLORS, DEFAULT_RADIUS } from '../constants/ui';
import type { DebugLogEntry, ToastDescriptor } from '../context/MessageContext';

interface ErrorMessageProps {
  toasts: ToastDescriptor[];
  onDismissToast: (id: string) => void;
  onClearToasts: () => void;
  onToggleDebug: () => void;
  isDebugVisible: boolean;
  logEntries: DebugLogEntry[];
}

const toneStyles = {
  info: {
    backgroundColor: 'rgba(59, 130, 246, 0.95)',
    borderColor: 'rgba(37, 99, 235, 0.95)',
    icon: 'ℹ️',
  },
  success: {
    backgroundColor: 'rgba(74, 222, 128, 0.95)',
    borderColor: 'rgba(34, 197, 94, 0.95)',
    icon: '✅',
  },
  warning: {
    backgroundColor: 'rgba(251, 191, 36, 0.95)',
    borderColor: 'rgba(217, 119, 6, 0.95)',
    icon: '⚠️',
  },
  error: {
    backgroundColor: 'rgba(248, 113, 113, 0.95)',
    borderColor: 'rgba(239, 68, 68, 0.95)',
    icon: '⛔',
  },
} as const;

export default function ErrorMessage({
  toasts,
  onDismissToast,
  onClearToasts,
  onToggleDebug,
  isDebugVisible,
  logEntries,
}: ErrorMessageProps) {
  const { largeText } = useAccessibility();

  React.useEffect(() => {
    if (toasts.length > 0 && Platform.OS === 'web') {
      const lastToast = toasts[toasts.length - 1];
      if (lastToast) {
        AccessibilityInfo.announceForAccessibility?.(lastToast.message);
      }
    }
  }, [toasts]);

  const fontSize = largeText ? 18 : 16;

  if (toasts.length === 0 && !isDebugVisible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View pointerEvents="box-none" style={styles.toastContainer}>
        {toasts.map((toast) => {
          const tone = toneStyles[toast.tone];
          return (
            <View key={toast.id} style={[styles.toast, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              <Text style={[styles.icon, { fontSize }]}>{tone.icon}</Text>
              <Text style={[styles.toastText, { fontSize }]}>{toast.message}</Text>
              <Pressable
                accessibilityHint="Toast ausblenden"
                accessibilityLabel="Schließen"
                onPress={() => onDismissToast(toast.id)}
                style={styles.dismissButton}
              >
                <Text style={[styles.dismissText, { fontSize }]}>&times;</Text>
              </Pressable>
            </View>
          );
        })}
        {logEntries.length > 0 && (
          <Pressable style={styles.debugButton} onPress={onToggleDebug} accessibilityRole="button">
            <Text style={[styles.debugText, { fontSize: largeText ? 14 : 12 }]}>
              {isDebugVisible ? 'Debug-Protokoll schließen' : `Debug-Protokoll (${logEntries.length})`}
            </Text>
          </Pressable>
        )}
        {toasts.length > 1 && (
          <Pressable style={styles.clearAllButton} onPress={onClearToasts} accessibilityRole="button">
            <Text style={[styles.debugText, { fontSize: largeText ? 14 : 12 }]}>Alle ausblenden</Text>
          </Pressable>
        )}
      </View>
      {isDebugVisible && (
        <View style={styles.debugOverlay} pointerEvents="box-none">
          <View style={styles.debugPanel}>
            <View style={styles.debugHeader}>
              <Text style={[styles.debugTitle, { fontSize: largeText ? 18 : 16 }]}>Debug-Protokoll</Text>
              <Pressable onPress={onToggleDebug} accessibilityRole="button" style={styles.debugCloseButton}>
                <Text style={[styles.dismissText, { fontSize: largeText ? 18 : 16 }]}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.debugScroll} contentContainerStyle={styles.debugScrollContent}>
              {logEntries.map((entry) => {
                const tone = toneStyles[entry.tone];
                const timestamp = new Date(entry.timestamp).toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
                return (
                  <View
                    key={entry.id}
                    style={[styles.debugEntry, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}
                  >
                    <Text style={[styles.debugEntryText, { fontSize: largeText ? 16 : 14 }]}>
                      {timestamp} – {tone.icon} {entry.message}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    elevation: 999,
    zIndex: 999,
  },
  toastContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
    pointerEvents: 'box-none',
  },
  toast: {
    minHeight: 48,
    borderRadius: DEFAULT_RADIUS,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  toastText: {
    flex: 1,
    color: COLORS.highContrastText,
  },
  dismissButton: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  dismissText: {
    color: COLORS.highContrastText,
    fontWeight: '600',
  },
  debugButton: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.overlayBadgeBackground,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: DEFAULT_RADIUS,
  },
  clearAllButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.overlayBadgeBackground,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: DEFAULT_RADIUS,
  },
  debugText: {
    color: COLORS.overlayBadgeText,
    fontWeight: '600',
  },
  debugOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  debugPanel: {
    backgroundColor: COLORS.overlaySurface,
    borderColor: COLORS.overlayBorder,
    borderWidth: 1,
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
    maxHeight: '70%',
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  debugTitle: {
    color: COLORS.overlayText,
    fontWeight: '700',
  },
  debugCloseButton: {
    padding: SPACING.xs,
  },
  debugScroll: {
    maxHeight: '100%',
  },
  debugScrollContent: {
    gap: SPACING.xs,
  },
  debugEntry: {
    borderRadius: DEFAULT_RADIUS,
    borderWidth: 1,
    padding: SPACING.sm,
  },
  debugEntryText: {
    color: COLORS.highContrastText,
  },
});
