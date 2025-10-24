import { StackActions } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import type { RootStackParamList } from './types';

/**
 * Pops the stack back to an existing route if it is present.
 *
 * Returns `true` when the route already existed in the stack (and is now
 * focused) or `false` when the route was not found, so callers can push it.
 */
export function popToExistingRoute<RouteName extends keyof RootStackParamList>(
  navigation: StackNavigationProp<RootStackParamList>,
  routeName: RouteName,
): boolean {
  const state = navigation.getState();

  if (!state || state.type !== 'stack') {
    return false;
  }

  const targetIndex = state.routes.findIndex((route) => route.name === routeName);

  if (targetIndex === -1) {
    return false;
  }

  const routesToPop = state.index - targetIndex;

  if (routesToPop > 0) {
    navigation.dispatch(StackActions.pop(routesToPop));
  }

  return true;
}
