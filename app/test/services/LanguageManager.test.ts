import { LanguageManager } from '../../src/services/LanguageManager';

describe('LanguageManager', () => {
  beforeEach(() => {
    // Reset to default state
    LanguageManager.setLanguage('de');
  });

  it('returns current language', () => {
    expect(LanguageManager.getLanguage()).toBe('de');
  });

  it('sets language and notifies listeners', () => {
    const listener = jest.fn();
    const unsubscribe = LanguageManager.subscribe(listener);

    LanguageManager.setLanguage('en');
    expect(LanguageManager.getLanguage()).toBe('en');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does not notify listeners when setting same language', () => {
    const listener = jest.fn();
    const unsubscribe = LanguageManager.subscribe(listener);

    LanguageManager.setLanguage('de');
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('translates keys correctly', () => {
    expect(LanguageManager.t('gestures.hello')).toBe('Hallo');
    expect(LanguageManager.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('translates gesture labels', () => {
    expect(LanguageManager.getGestureLabel('hello')).toBe('Hallo');
  });

  it('switches language correctly', () => {
    LanguageManager.setLanguage('en');
    expect(LanguageManager.t('gestures.hello')).toBe('Hello');
  });

  it('adds new language', () => {
    const newTranslations = { gestures: { test: 'Test Translation' } };
    LanguageManager.addLanguage('test', newTranslations);

    LanguageManager.setLanguage('test');
    expect(LanguageManager.t('gestures.test')).toBe('Test Translation');
  });

  it('handles nested translation keys', () => {
    expect(LanguageManager.t('gestures.hello')).toBe('Hallo');
  });

  it('returns key if translation not found', () => {
    expect(LanguageManager.t('missing.translation')).toBe('missing.translation');
  });
});