import { test } from 'node:test';
import assert from 'node:assert/strict';
// Node 18's ESM loader doesn't resolve extensionless TypeScript files when
// importing from CommonJS packages, so include the `.ts` extension explicitly.
// Some tools compile the `app` package as CommonJS, so grab the export from the
// module namespace to work regardless of module format.
import * as model from '../../app/src/model.ts';
// Support both CommonJS and ES module builds of the app by checking the
// namespace object as well as a possible default export.
const gestureModel =
  model.gestureModel ?? (model.default && model.default.gestureModel);

function selectGesture(model, gestureId) {
  const gestures = model?.gestures ?? [];
  if (gestures.some((g) => g.id === gestureId)) {
    return {
      screen: 'Training',
      params: { gestureLabel: gestureId, isPractice: true },
    };
  }
  return undefined;
}

test('selecting a valid gesture navigates to training with practice flag', () => {
  const nav = selectGesture(gestureModel, 'hello');
  assert.deepEqual(nav, {
    screen: 'Training',
    params: { gestureLabel: 'hello', isPractice: true },
  });
});
