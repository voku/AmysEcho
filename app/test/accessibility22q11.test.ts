import { HandStabilityAssistant } from '../webview/core/HandStabilityAssistant';
import { PartialGestureDetector, GestureSizeNormalizer } from '../webview/gestureProcessing';
import { ErrorRecoveryManager } from '../webview/utils/ErrorRecoveryManager';

const makeHand = (transform: (index: number, point: number[]) => number[] = (_i, point) => point) => {
  const base = Array.from({ length: 21 }, (_, i) => [i * 0.5, i * 0.2, 0]);
  return base.map((point, index) => transform(index, point));
};

describe('22q11 Accessibility Support', () => {
  it('HandStabilityAssistant detects instability and provides calming feedback', () => {
    const assistant = new HandStabilityAssistant();

    const calmHand = makeHand();
    const stable = assistant.analyzeStability([calmHand]);
    expect(stable.isStable).toBe(true);

    const jitterHand = makeHand((index, point) => {
      const jitter = index % 2 === 0 ? 0.5 : -0.5;
      return [point[0] + jitter, point[1] + jitter, point[2]];
    });

    const unstable = assistant.analyzeStability([jitterHand]);
    expect(unstable.isStable).toBe(false);
    expect(unstable.feedback).toContain('ruhig');
  });

  it('GestureSizeNormalizer keeps hand sizes within caregiver tolerance', () => {
    const normalizer = new GestureSizeNormalizer();
    const referenceHand = makeHand();
    normalizer.normalizeHandSize([referenceHand]); // establish reference

    const largerHand = makeHand((index, point) => [point[0] * 2, point[1] * 2, point[2]]);
    const [normalizedLarge] = normalizer.normalizeHandSize([largerHand]);

    const size = (hand: number[][]) => {
      const wrist = hand[0];
      const middle = hand[12];
      return Math.sqrt(
        (middle[0] - wrist[0]) ** 2 +
        (middle[1] - wrist[1]) ** 2 +
        (middle[2] - wrist[2]) ** 2,
      );
    };

    const refSize = size(referenceHand);
    const normSize = size(normalizedLarge);
    const { tolerance, maxScale } = normalizer.getTolerance();
    const expectedMaxRatio = Math.max(maxScale, 1 / (1 - tolerance));

    expect(normSize / refSize).toBeLessThanOrEqual(expectedMaxRatio + 1e-5);
    expect(Math.abs(normSize - refSize)).toBeLessThanOrEqual(refSize * (expectedMaxRatio - 1) + 1e-5);
  });

  it('PartialGestureDetector encourages partial fists for 22q11 practice', () => {
    const detector = new PartialGestureDetector();
    const partialFist = makeHand((index, point) => {
      const tips = [8, 12, 16, 20];
      const joints = [6, 10, 14, 18];
      if (tips.includes(index)) {
        const jointIndex = joints[tips.indexOf(index)];
        // Curl first two fingers only
        if (index === 8 || index === 12) {
          return [point[0], point[1] + 1, point[2]]; // tip below joint
        }
        return [point[0], point[1] - 1, point[2]]; // tip above joint (extended)
      }
      if (joints.includes(index)) {
        return [point[0], point[1], point[2]];
      }
      return point;
    });

    const analysis = detector.analyzePartialCompletion([partialFist], 'fist');
    expect(analysis.isPartial).toBe(true);
    expect(analysis.feedback).toContain('Faust');
    expect(detector.shouldRecognizePartial(analysis.completion, analysis.confidence)).toBe(true);
  });

  it('ErrorRecoveryManager surfaces gentle retry guidance', () => {
    const manager = new ErrorRecoveryManager();
    const error = new Error('Network timeout while fetching model');
    const info = manager.getErrorInfo(error, 'network');

    expect(info.userMessage).toContain('Verbindungsproblem');
    expect(info.userMessage).not.toContain('Error');
    expect(info.suggestedAction).toBe('retry_with_backoff');
  });
});
