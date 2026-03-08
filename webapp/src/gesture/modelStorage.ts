const DB_NAME = 'mlp-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';

interface StoredModel {
  profileId: string;
  b64: string;
  meta: {
    version: string | null;
    source: 'profile' | 'global';
    profileId: string | null;
  };
  cachedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB not supported in this environment');
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'profileId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open MLP models database'));
    });
  }
  return dbPromise;
}

export async function saveCachedModel(
  profileId: string,
  model: { b64: string; meta: any }
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: StoredModel = {
      profileId: profileId || 'global',
      b64: model.b64,
      meta: model.meta,
      cachedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[MLP] Failed to cache model for offline use', error);
  }
}

export async function getCachedModel(profileId: string): Promise<{ b64: string; meta: any } | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const record = await new Promise<StoredModel | undefined>((resolve, reject) => {
      const request = store.get(profileId || 'global');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (record) {
      console.info('[MLP] Loaded cached model from IndexedDB', {
        profileId: record.profileId,
        version: record.meta.version,
        cachedAt: record.cachedAt,
      });
      return { b64: record.b64, meta: record.meta };
    }
    return null;
  } catch (error) {
    console.warn('[MLP] Failed to read cached model', error);
    return null;
  }
}

export async function clearModelCacheForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
