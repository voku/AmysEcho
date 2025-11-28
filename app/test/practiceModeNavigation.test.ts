import { gestureModel, GestureModelEntry } from '../src/model';

interface TrainingNav {
  screen: 'Training';
  params: { gestureLabel: string; isPractice: boolean };
}

function selectGesture(
  model: { gestures: GestureModelEntry[] },
  gestureId: string,
): TrainingNav | undefined {
  const gestures = model?.gestures ?? [];
  if (gestures.some((g) => g.id === gestureId)) {
    return {
      screen: 'Training',
      params: { gestureLabel: gestureId, isPractice: true },
    };
  }
  return undefined;
}

describe('practice mode navigation', () => {
  test('selecting a valid gesture navigates to training with practice flag', () => {
    const nav = selectGesture(gestureModel, 'hello');
    expect(nav).toEqual({
      screen: 'Training',
      params: { gestureLabel: 'hello', isPractice: true },
    });
  });
});
