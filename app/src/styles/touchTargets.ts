import { StyleSheet, ViewStyle } from 'react-native';
import { COLORS, DEFAULT_RADIUS } from '../constants/ui';

const base: ViewStyle = {
  minWidth: 60,
  minHeight: 60,
  padding: 12,
  alignItems: 'center',
  justifyContent: 'center',
};

export const childFriendlyStyles = StyleSheet.create({
  minTouchTarget: base,
  primaryButton: {
    ...base,
    backgroundColor: COLORS.primaryAccent,
    borderRadius: DEFAULT_RADIUS,
  },
});
