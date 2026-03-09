const TRAINED_SIGN_LABELS_KEY = 'webapp:trained-sign-labels';
const TRAINED_LABEL_DESCRIPTORS_KEY = 'webapp:trained-label-descriptors';
const HAS_TRAINED_SIGNS_KEY = 'webapp:has-trained-signs';
const PROGRESS_PREFIX = 'webapp:progress:';
const SYMBOL_CACHE_PREFIX = 'amysecho_symbols_';
const METACOM_MEMORY_PREFIX = 'webapp:metacom-memory:';

export function getTrainedSignStorageKeys(profileId: string | null) {
  if (!profileId) {
    return {
      trainedSignLabels: TRAINED_SIGN_LABELS_KEY,
      trainedLabelDescriptors: TRAINED_LABEL_DESCRIPTORS_KEY,
      hasTrainedSigns: HAS_TRAINED_SIGNS_KEY,
    };
  }

  return {
    trainedSignLabels: `${TRAINED_SIGN_LABELS_KEY}:${profileId}`,
    trainedLabelDescriptors: `${TRAINED_LABEL_DESCRIPTORS_KEY}:${profileId}`,
    hasTrainedSigns: `${HAS_TRAINED_SIGNS_KEY}:${profileId}`,
  };
}

export function listProfileScopedLocalStorageKeys(profileId: string | null): string[] {
  if (!profileId) {
    return [];
  }

  const trainedKeys = getTrainedSignStorageKeys(profileId);
  return [
    trainedKeys.trainedSignLabels,
    trainedKeys.trainedLabelDescriptors,
    trainedKeys.hasTrainedSigns,
    `${PROGRESS_PREFIX}${profileId}`,
    `${SYMBOL_CACHE_PREFIX}${profileId}`,
    `${METACOM_MEMORY_PREFIX}${profileId}`,
  ];
}

export type ProfileLocalDataExport = {
  profileId: string;
  displayName: string | null;
  exportedAt: string;
  storageEntries: Array<{ key: string; value: string }>;
};

export function buildProfileLocalDataExport(
  profileId: string | null,
  displayName: string | null,
): ProfileLocalDataExport | null {
  if (!profileId || typeof window === 'undefined') {
    return null;
  }

  const storageEntries = listProfileScopedLocalStorageKeys(profileId)
    .map((key) => {
      const value = window.localStorage.getItem(key);
      return typeof value === 'string' ? { key, value } : null;
    })
    .filter((entry): entry is { key: string; value: string } => entry !== null);

  return {
    profileId,
    displayName,
    exportedAt: new Date().toISOString(),
    storageEntries,
  };
}

export function clearProfileScopedLocalData(profileId: string | null): void {
  if (!profileId || typeof window === 'undefined') {
    return;
  }

  for (const key of listProfileScopedLocalStorageKeys(profileId)) {
    window.localStorage.removeItem(key);
  }
}
