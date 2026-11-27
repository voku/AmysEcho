/**
 * Browser `KeyValueBackend` over one IndexedDB object store.
 *
 * Node has no IndexedDB, so the Node tests never import this file; it is
 * tested in Chromium instead (test/browser/indexeddb.test.mjs, card NG-14).
 * Safari, Firefox and target devices are not covered (card NG-6). Keep it
 * thin: all profile logic lives in store.ts and backup.ts, which are tested
 * against the in-memory backend.
 *
 * Atomicity comes from IndexedDB itself: each `write` batch is one readwrite
 * transaction, which the browser commits completely or not at all.
 */
import { cloneJson, JsonValueError } from "./backend.js";
import type { KeyValueBackend, WriteBatch } from "./backend.js";

const OBJECT_STORE = "kv";
const DATABASE_VERSION = 1;
/** Sorts after every character a storage key can contain. */
const AFTER_ALL_KEYS = String.fromCharCode(0xffff);

export class StorageUnavailableError extends Error {}

function failure(what: string, cause: unknown): Error {
  const detail = cause instanceof Error ? `: ${cause.name}: ${cause.message}` : "";
  return new Error(`IndexedDB ${what} failed${detail}`, { cause });
}

export function openIndexedDbBackend(databaseName = "amys-echo"): Promise<KeyValueBackend> {
  return new Promise((resolve, reject) => {
    const factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (factory === undefined || factory === null) {
      reject(new StorageUnavailableError("IndexedDB is not available in this browser or browsing mode"));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(databaseName, DATABASE_VERSION);
    } catch (error) {
      reject(new StorageUnavailableError(failure("open", error).message, { cause: error }));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE);
    };
    request.onblocked = () => reject(new Error("IndexedDB open is blocked by another open tab of this app"));
    request.onerror = () => reject(failure("open", request.error));
    request.onsuccess = () => {
      const database = request.result;
      // Let a newer app version upgrade the database instead of blocking it.
      database.onversionchange = () => database.close();
      resolve(new IndexedDbBackend(database));
    };
  });
}

class IndexedDbBackend implements KeyValueBackend {
  readonly #database: IDBDatabase;

  constructor(database: IDBDatabase) {
    this.#database = database;
  }

  get(key: string): Promise<unknown | undefined> {
    return this.#read((store) => store.get(key));
  }

  async keys(prefix: string): Promise<string[]> {
    const range = prefix === "" ? undefined : IDBKeyRange.bound(prefix, `${prefix}${AFTER_ALL_KEYS}`);
    const found = await this.#read((store) => store.getAllKeys(range));
    return found.filter((key): key is string => typeof key === "string" && key.startsWith(prefix)).sort();
  }

  write(batch: WriteBatch): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sets = Object.entries(batch.set ?? {}).map(([key, value]) => [key, cloneJson(value)] as const);
        const transaction = this.#database.transaction(OBJECT_STORE, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure("write", transaction.error));
        transaction.onerror = () => reject(failure("write", transaction.error));
        const store = transaction.objectStore(OBJECT_STORE);
        try {
          for (const key of batch.delete ?? []) store.delete(key);
          for (const [key, value] of sets) store.put(value, key);
        } catch (error) {
          transaction.abort();
          throw error;
        }
      } catch (error) {
        reject(error instanceof JsonValueError ? error : failure("write", error));
      }
    });
  }

  #read<T>(start: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.#database.transaction(OBJECT_STORE, "readonly");
        const request = start(transaction.objectStore(OBJECT_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(failure("read", request.error));
        transaction.onabort = () => reject(failure("read", transaction.error));
      } catch (error) {
        reject(failure("read", error));
      }
    });
  }
}
