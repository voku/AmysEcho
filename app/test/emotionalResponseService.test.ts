import { emotionalResponseService } from '../src/services/emotionalResponseService';
import { Emotion } from '../src/services/emotionDetectionService';
import { ENCOURAGEMENT } from '../src/services/emotionalResponseService';

describe('EmotionalResponseService', () => {
  test.each<Emotion>(['happy', 'excited', 'calm', 'frustrated'])('returns German encouragement for %s', (emotion) => {
    const message = emotionalResponseService.getEncouragement(emotion);
    expect(ENCOURAGEMENT[emotion]).toContain(message);
  });

  test('creates caregiver alert when frustration detected', () => {
    const alert = emotionalResponseService.getCaregiverAlert('happy', 'frustrated');
    expect(alert).toBe('Betreuerhinweis: Amy wirkt frustriert.');
  });

  test('creates caregiver alert when previous null and current frustrated', () => {
    const alert = emotionalResponseService.getCaregiverAlert(null, 'frustrated');
    expect(alert).toBe('Betreuerhinweis: Amy wirkt frustriert.');
  });

  test('no alert when emotion unchanged', () => {
    const alert = emotionalResponseService.getCaregiverAlert('happy', 'happy');
    expect(alert).toBeNull();
  });

  test('no alert when remaining frustrated', () => {
    const alert = emotionalResponseService.getCaregiverAlert('frustrated', 'frustrated');
    expect(alert).toBeNull();
  });

  test('no alert on non-frustrated transition', () => {
    const alert = emotionalResponseService.getCaregiverAlert('happy', 'calm');
    expect(alert).toBeNull();
  });
});
