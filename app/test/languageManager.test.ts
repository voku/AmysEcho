import { LanguageManager } from '../src/services/LanguageManager';

describe('LanguageManager', () => {
  beforeEach(() => {
    LanguageManager.setLanguage('en');
  });

  it('returns English gesture labels by default', () => {
    expect(LanguageManager.getGestureLabel('hello')).toBe('Hello');
  });

  it('returns German gesture labels when language set to de', () => {
    LanguageManager.setLanguage('de');
    expect(LanguageManager.getGestureLabel('hello')).toBe('Hallo');
  });
});
