import { Emotion } from './emotionDetectionService';

const ENCOURAGEMENT: Record<Emotion, string[]> = {
  happy: ['Prima gemacht!', 'Toll!'],
  excited: ['Wow, das macht Spaß!', 'Super Energie!'],
  calm: ['Ganz ruhig, gut so.', 'Sehr schön, ruhig und klar.'],
  frustrated: ['Alles gut, wir probieren es nochmal.']
};

class EmotionalResponseService {
  getEncouragement(emotion: Emotion): string {
    const options = ENCOURAGEMENT[emotion];
    if (!options || options.length === 0) {
      return 'Du machst das super!';
    }
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex] ?? 'Du machst das super!';
  }

  /**
   * Returns a caregiver alert when the emotional state changes to a
   * potentially negative state.
   */
  getCaregiverAlert(previous: Emotion | null, current: Emotion): string | null {
    if (current === 'frustrated' && previous !== 'frustrated') {
      return 'Betreuerhinweis: Amy wirkt frustriert.';
    }
    return null;
  }
}

export const emotionalResponseService = new EmotionalResponseService();
export { ENCOURAGEMENT };
