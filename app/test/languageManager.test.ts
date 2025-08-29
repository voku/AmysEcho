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

  it('allows registering and using a new language', () => {
    LanguageManager.addLanguage('es', { gestures: { hello: 'Hola' } });
    LanguageManager.setLanguage('es');
    expect(LanguageManager.getGestureLabel('hello')).toBe('Hola');
  });
});
