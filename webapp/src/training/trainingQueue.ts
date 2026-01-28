export const BUNDLE_KEY_PREFIX = 'trainingBundles:';
const DB_NAME = 'training-bundles';
const DB_VERSION = 1;
const METADATA_STORE = 'bundles';
const DATA_STORE = 'bundleData';
const BROADCAST_CHANNEL = 'training-bundles-updates';

type BundleStorage = 'idb' | 'opfs';

export type PersistedBundleStatus = 'pending' | 'uploading' | 'failed';

export interface PersistedTrainingBundle {
  key: string;
  profileId: string;
  label: string;
  capturedAt: string;
  source: string;
  queuedAt: string;
  framesCount: number;
  clipBytes?: number;
  stillBytes?: number;
  zipBytes: number;
  storage: BundleStorage;
  status: PersistedBundleStatus;
  lastError?: string;
  attempts: number;
}

type StoredTrainingBundle = PersistedTrainingBundle & {
  opfsPath?: string;
};

type BundleParams = {
  profileId: string;
  label: string;
  capturedAt: string;
  source: string;
  framesCount: number;
  clipBytes?: number;
  stillBytes?: number;
  zip: Uint8Array;
};

const subscribers = new Set<() => void>();
let broadcastChannel: BroadcastChannel | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let opfsRootPromise: Promise<FileSystemDirectoryHandle | null> | null = null;
let broadcastCleanupRegistered = false;

function registerBroadcastCleanup() {
  if (broadcastCleanupRegistered || typeof window === 'undefined') return;
  broadcastCleanupRegistered = true;
  const cleanup = () => {
    if (broadcastChannel) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  };
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
}

function notifyBundleChange() {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      if (!broadcastChannel) {
        broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
        registerBroadcastCleanup();
      }
      broadcastChannel.postMessage({ type: 'changed' });
      return;
    } catch (error) {
      console.warn('BroadcastChannel konnte nicht initialisiert werden', error);
    }
  }

  subscribers.forEach((fn) => fn());
}

export function subscribeToBundleUpdates(callback: () => void): () => void {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    const handler = () => callback();
    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }

  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

function buildBundleKey(profileId: string): string {
  const timestamp = Date.now().toString(36);
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 8);
  return `${BUNDLE_KEY_PREFIX}${profileId}:${timestamp}:${random}`;
}

function getIndexedDb(): IDBFactory | null {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsRootPromise) {
    opfsRootPromise = (async () => {
      if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
        return null;
      }
      try {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle(DB_NAME, { create: true });
      } catch (error) {
        console.warn('OPFS nicht verfügbar, weiche auf IndexedDB aus', error);
        return null;
      }
    })();
  }
  return opfsRootPromise;
}

function bufferFrom(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB-Fehler'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen'));
  });
}

async function openDb(): Promise<IDBDatabase> {
  const factory = getIndexedDb();
  if (!factory) {
    throw new Error('Offline-Speicher nicht verfügbar. Bitte einen aktuellen Browser verwenden.');
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DATA_STORE)) {
          db.createObjectStore(DATA_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden'));
    });
  }

  return dbPromise;
}

async function persistBundle(
  db: IDBDatabase,
  record: StoredTrainingBundle,
  zipData?: Uint8Array,
): Promise<void> {
  const tx = db.transaction([METADATA_STORE, DATA_STORE], 'readwrite');
  const metadataStore = tx.objectStore(METADATA_STORE);
  const dataStore = tx.objectStore(DATA_STORE);
  metadataStore.put(record);
  if (record.storage === 'idb' && zipData) {
    dataStore.put(bufferFrom(zipData), record.key);
  }
  await txDone(tx);
}

async function ensureStorage(): Promise<IDBDatabase> {
  try {
    const db = await openDb();
    return db;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Offline-Speicher konnte nicht initialisiert werden: ${reason}`);
  }
}

async function loadBundleRecord(db: IDBDatabase, key: string): Promise<StoredTrainingBundle | null> {
  const tx = db.transaction(METADATA_STORE, 'readonly');
  const store = tx.objectStore(METADATA_STORE);
  const record = (await requestToPromise(store.get(key))) as StoredTrainingBundle | undefined;
  await txDone(tx);
  return record ?? null;
}

async function readZipData(db: IDBDatabase, record: StoredTrainingBundle): Promise<Uint8Array | null> {
  if (record.storage === 'opfs' && record.opfsPath) {
    const opfsRoot = await getOpfsRoot();
    if (!opfsRoot) return null;
    try {
      const file = await opfsRoot.getFileHandle(record.opfsPath);
      const blob = await (await file.getFile()).arrayBuffer();
      return new Uint8Array(blob);
    } catch (error) {
      console.warn('Konnte gespeichertes OPFS-Bundle nicht lesen', error);
      return null;
    }
  }

  const tx = db.transaction(DATA_STORE, 'readonly');
  const dataStore = tx.objectStore(DATA_STORE);
  const buffer = (await requestToPromise(dataStore.get(record.key))) as ArrayBuffer | undefined;
  await txDone(tx);
  if (!buffer) return null;
  return new Uint8Array(buffer);
}

export async function enqueuePersistedBundle(params: BundleParams): Promise<PersistedTrainingBundle | null> {
  const db = await ensureStorage();
  const opfsRoot = await getOpfsRoot();
  const key = buildBundleKey(params.profileId);

  const record: StoredTrainingBundle = {
    key,
    profileId: params.profileId,
    label: params.label,
    capturedAt: params.capturedAt,
    source: params.source,
    queuedAt: new Date().toISOString(),
    framesCount: params.framesCount,
    ...(typeof params.clipBytes === 'number' ? { clipBytes: params.clipBytes } : {}),
    ...(typeof params.stillBytes === 'number' ? { stillBytes: params.stillBytes } : {}),
    zipBytes: params.zip.byteLength,
    storage: opfsRoot ? 'opfs' : 'idb',
    status: 'pending',
    attempts: 0,
  };

  if (opfsRoot) {
    const file = await opfsRoot.getFileHandle(key, { create: true });
    const writable = await file.createWritable();
    await writable.write(bufferFrom(params.zip));
    await writable.close();
    record.opfsPath = key;
    await persistBundle(db, record);
  } else {
    await persistBundle(db, record, params.zip);
  }

  notifyBundleChange();
  return record;
}

export async function listQueuedBundles(profileId?: string): Promise<PersistedTrainingBundle[]> {
  const db = await ensureStorage();
  const tx = db.transaction(METADATA_STORE, 'readonly');
  const store = tx.objectStore(METADATA_STORE);
  const records = (await requestToPromise(store.getAll())) as StoredTrainingBundle[];
  await txDone(tx);

  const filtered = profileId
    ? records.filter((record) => record.key.startsWith(`${BUNDLE_KEY_PREFIX}${profileId}:`))
    : records;

  return filtered.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function readBundleData(key: string): Promise<Uint8Array | null> {
  const db = await ensureStorage();
  const record = await loadBundleRecord(db, key);
  if (!record) return null;
  return readZipData(db, record);
}

export async function removeQueuedBundle(key: string): Promise<void> {
  const db = await ensureStorage();
  const tx = db.transaction([METADATA_STORE, DATA_STORE], 'readwrite');
  const metadataStore = tx.objectStore(METADATA_STORE);
  const dataStore = tx.objectStore(DATA_STORE);
  metadataStore.delete(key);
  dataStore.delete(key);
  await txDone(tx);

  const opfsRoot = await getOpfsRoot();
  if (opfsRoot) {
    try {
      await opfsRoot.removeEntry(key);
    } catch {
      // Datei existiert eventuell nicht im OPFS (z. B. nur in IndexedDB gespeichert)
    }
  }

  notifyBundleChange();
}

async function updateBundle(
  key: string,
  updater: (bundle: StoredTrainingBundle) => StoredTrainingBundle,
): Promise<void> {
  const db = await ensureStorage();
  const current = await loadBundleRecord(db, key);
  if (!current) return;
  const updated = updater(current);
  await persistBundle(db, updated);
  notifyBundleChange();
}

export async function markBundleFailed(key: string, error: string): Promise<void> {
  await updateBundle(key, (bundle) => ({
    ...bundle,
    status: 'failed',
    lastError: error,
    attempts: bundle.attempts + 1,
  }));
}

export async function markBundleUploading(key: string): Promise<void> {
  await updateBundle(key, (bundle) => {
    const { lastError: _, ...rest } = bundle;
    return {
      ...rest,
      status: 'uploading' as const,
      attempts: bundle.attempts + 1,
    };
  });
}

export async function clearBundleStoreForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  opfsRootPromise = null;
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Konnte Testdatenbank nicht löschen'));
    });
  }
}
