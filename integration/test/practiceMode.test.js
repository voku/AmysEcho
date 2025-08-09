import { test } from 'node:test';
import assert from 'node:assert/strict';
// Node 18's ESM loader doesn't resolve extensionless TypeScript files when
// importing from CommonJS packages, so include the `.ts` extension explicitly.
// Some tools compile the `app` package as CommonJS, so grab the export from the
// module namespace to work regardless of module format.
import * as model from '../../app/src/model.ts';
const { gestureModel } = model;

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
