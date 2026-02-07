import { useEffect, useMemo, useState } from 'react';
import type { MetacomBoardDefinition } from '../types/metacom';
import {
  METACOM_BUNDLE_UPDATED_EVENT,
  getMetacomSymbols,
  loadMetacomBoards,
} from '../services/metacomBundleService';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';

type UseMetacomBundleOptions = {
  vocabularySet?: MetacomVocabularySet;
};

export function useMetacomBundle(options: UseMetacomBundleOptions = {}) {
  const { vocabularySet } = options;
  const loadOptions = useMemo(() => {
    const next: UseMetacomBundleOptions = {};
    if (vocabularySet) {
      next.vocabularySet = vocabularySet;
    }
    return next;
  }, [vocabularySet]);
  const [boards, setBoards] = useState<Record<string, MetacomBoardDefinition>>(() =>
    loadMetacomBoards(loadOptions),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBoards(loadMetacomBoards(loadOptions));
    const handleUpdate = () => {
      setBoards(loadMetacomBoards(loadOptions));
    };
    window.addEventListener(METACOM_BUNDLE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(METACOM_BUNDLE_UPDATED_EVENT, handleUpdate);
  }, [loadOptions]);

  const symbols = useMemo(() => getMetacomSymbols(boards), [boards]);

  return { boards, symbols };
}
