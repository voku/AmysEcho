import { useEffect, useMemo, useState } from 'react';
import type { MetacomBoardDefinition } from '../types/metacom';
import {
  METACOM_BUNDLE_UPDATED_EVENT,
  getMetacomSymbols,
  loadMetacomBoards,
} from '../services/metacomBundleService';

export function useMetacomBundle() {
  const [boards, setBoards] = useState<Record<string, MetacomBoardDefinition>>(() =>
    loadMetacomBoards(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => {
      setBoards(loadMetacomBoards());
    };
    window.addEventListener(METACOM_BUNDLE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(METACOM_BUNDLE_UPDATED_EVENT, handleUpdate);
  }, []);

  const symbols = useMemo(() => getMetacomSymbols(boards), [boards]);

  return { boards, symbols };
}
