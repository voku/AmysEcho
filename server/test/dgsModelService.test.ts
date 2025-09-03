import { normalize as normalizeServer } from '../src/services/dgsModelService';
import { normalize as normalizeClient } from '../../app/src/services/offlineClassifier';

describe('dgsModelService normalize', () => {
  test('translates and scales each hand independently', () => {
    const left: [number, number, number][] = Array.from({ length: 21 }, () => [0, 0, 0]);
    left[1] = [2, 0, 0];
    const right: [number, number, number][] = Array.from({ length: 21 }, () => [10, 0, 0]);
    right[1] = [11, 0, 0];
    const norm = normalizeServer(left.concat(right));
    expect(norm[1][0]).toBeCloseTo(1, 5); // left hand tip
    expect(norm[21][0]).toBeCloseTo(0, 5); // right wrist becomes origin
    expect(norm[22][0]).toBeCloseTo(1, 5); // right hand tip
  });

  test('pads single hand to 42 landmarks', () => {
    const hand: [number, number, number][] = Array.from({ length: 21 }, () => [0, 0, 0]);
    const norm = normalizeServer(hand);
    expect(norm).toHaveLength(42);
    for (let i = 21; i < 42; i++) {
      expect(norm[i]).toEqual([0, 0, 0]);
    }
  });

  test('matches app normalizer', () => {
    const mk = (n: number): [number, number, number][] =>
      Array.from({ length: n }, (_, i) => [i, i + 0.5, -i] as [number, number, number]);
    const cases: [string, [number, number, number][]][] = [
      ['empty', [] as [number, number, number][]],
      ['one hand', mk(21)],
      ['two hands', mk(42)],
      ['extra points', mk(50)],
    ];
    for (const [, input] of cases) {
      const serverOut = normalizeServer(input);
      const clientOut = normalizeClient(input);
      expect(serverOut).toEqual(clientOut);
    }
  });
});
