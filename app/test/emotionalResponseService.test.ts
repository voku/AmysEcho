import { emotionalResponseService } from '../src/services/emotionalResponseService';
import { Emotion } from '../src/services/emotionDetectionService';
import { ENCOURAGEMENT } from '../src/services/emotionalResponseService';

describe('EmotionalResponseService', () => {
  test('returns German encouragement for emotion', () => {
    const message = emotionalResponseService.getEncouragement('happy');
    expect(ENCOURAGEMENT['happy']).toContain(message);
  });

  test('creates caregiver alert when frustration detected', () => {
    const alert = emotionalResponseService.getCaregiverAlert('happy', 'frustrated');
    expect(alert).toBe('Betreuerhinweis: Amy wirkt frustriert.');
  });

  test('no alert when emotion unchanged', () => {
    const alert = emotionalResponseService.getCaregiverAlert('happy', 'happy');
    expect(alert).toBeNull();
  });
});
