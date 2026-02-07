import { describe, expect, it, beforeEach } from 'vitest';
import {
  addMetacomMemoryItem,
  clearMetacomMemory,
  loadMetacomMemory,
} from './metacomMemoryService';

describe('metacomMemoryService', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores and loads memory items per profile', () => {
    const profileId = 'profile-1';
    addMetacomMemoryItem(profileId, { id: 'metacom_ja', label: 'Ja', emoji: '👍' });
    addMetacomMemoryItem(profileId, { id: 'metacom_nein', label: 'Nein', emoji: '👎' });

    const items = loadMetacomMemory(profileId);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('metacom_nein');
  });

  it('clears memory items', () => {
    const profileId = 'profile-2';
    addMetacomMemoryItem(profileId, { id: 'metacom_danke', label: 'Danke', emoji: '💛' });
    clearMetacomMemory(profileId);

    expect(loadMetacomMemory(profileId)).toEqual([]);
  });
});
