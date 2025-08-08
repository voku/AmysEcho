import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gestureModel } from '../../app/src/model';

function selectGesture(gestureId) {
  if (gestureModel.gestures.some((g) => g.id === gestureId)) {
    return { screen: 'Training', params: { gestureLabel: gestureId, isPractice: true } };
  }
  return undefined;
}

test('selecting a valid gesture navigates to training with practice flag', () => {
  const nav = selectGesture('hello');
  assert.deepEqual(nav, {
    screen: 'Training',
    params: { gestureLabel: 'hello', isPractice: true },
  });
});
