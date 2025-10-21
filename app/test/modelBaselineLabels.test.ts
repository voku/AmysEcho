import { gestureModel } from '../src/model';
import { DEFAULT_BASELINE_LABELS } from '../src/constants/defaultBaselineLabels';

describe('gesture model baseline coverage', () => {
  it('enthält alle Basis-Gesten des MLP', () => {
    const ids = new Set(gestureModel.gestures.map((gesture) => gesture.id));
    const missing = DEFAULT_BASELINE_LABELS.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });
});
