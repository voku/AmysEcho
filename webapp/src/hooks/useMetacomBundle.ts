import { useEffect, useMemo, useState } from 'react';
import type { MetacomBoardDefinition } from '../types/metacom';
import {
  METACOM_BUNDLE_UPDATED_EVENT,
  getMetacomSymbols,
  loadMetacomBoards,
  fetchMetacomBundleFromServer,
  storeMetacomBundle,
} from '../services/metacomBundleService';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';
import { useAppState } from './useAppState';
import { useApiConfig } from './useApiConfig';

type UseMetacomBundleOptions = {
  vocabularySet?: MetacomVocabularySet;
};

export function useMetacomBundle(options: UseMetacomBundleOptions = {}) {
  const { vocabularySet } = options;
  const { profileId } = useAppState();
  const { apiToken } = useApiConfig();

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
    if (!profileId || !apiToken) return;

    const syncFromServer = async () => {
      const serverBundle = await fetchMetacomBundleFromServer(profileId, apiToken);
      if (serverBundle) {
        storeMetacomBundle(JSON.stringify(serverBundle));
      }
    };

    void syncFromServer();
  }, [profileId, apiToken]);

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
