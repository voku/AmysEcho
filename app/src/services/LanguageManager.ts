import en from '../../i18n/en.json';
import de from '../../i18n/de.json';

type Language = 'en' | 'de';

type TranslationMap = Record<string, any>;

const translations: Record<Language, TranslationMap> = {
  en,
  de,
};

let current: Language = 'de';

function getNested(obj: TranslationMap, path: string[]): any {
  return path.reduce((acc: any, key: string) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export const LanguageManager = {
  getLanguage(): Language {
    return current;
  },
  setLanguage(lang: Language) {
    if (translations[lang]) {
      current = lang;
    }
  },
  t(key: string): string {
    const result = getNested(translations[current], key.split('.'));
    return typeof result === 'string' ? result : key;
  },
  getGestureLabel(id: string): string {
    return LanguageManager.t(`gestures.${id}`);
  },
};
