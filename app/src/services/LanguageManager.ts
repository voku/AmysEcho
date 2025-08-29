import en from '../../i18n/en.json';
import de from '../../i18n/de.json';

type TranslationMap = Record<string, any>;

const translations: Record<string, TranslationMap> = {
  en,
  de,
};

let current: string = 'de';
const listeners = new Set<() => void>();

function getNested(obj: TranslationMap, path: string[]): any {
  return path.reduce((acc: any, key: string) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export const LanguageManager = {
  getLanguage(): string {
    return current;
  },
  setLanguage(lang: string) {
    if (lang !== current) {
      if (!translations[lang]) translations[lang] = {};
      current = lang;
      listeners.forEach((cb) => cb());
    }
  },
  t(key: string): string {
    const result = getNested(translations[current] || {}, key.split('.'));
    return typeof result === 'string' ? result : key;
  },
  getGestureLabel(id: string): string {
    return LanguageManager.t(`gestures.${id}`);
  },
  addLanguage(lang: string, map: TranslationMap) {
    translations[lang] = map;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
