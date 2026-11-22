/**
 * The storage seam for profile data: a small asynchronous key-value interface.
 *
 * Everything above this file (profile store, export, restore) is written
 * against `KeyValueBackend` only, so the same logic runs on the in-memory
 * backend used by the tests and on the IndexedDB backend used in the browser.
 */

export interface WriteBatch {
  /** Keys to create or overwrite. */
  readonly set?: Readonly<Record<string, unknown>>;
  /** Keys to remove; removing a missing key is not an error. */
  readonly delete?: readonly string[];
}

export interface KeyValueBackend {
  /** The stored value as a private copy, or `undefined` when the key is absent. */
  get(key: string): Promise<unknown | undefined>;
  /** Every stored key that starts with `prefix`, sorted. */
  keys(prefix: string): Promise<string[]>;
  /**
   * Atomic: either every set and delete of the batch is applied or none is.
   * Deletes are applied before sets. Values must be JSON values (see `cloneJson`).
   */
  write(batch: WriteBatch): Promise<void>;
}

/** A value that JSON cannot represent exactly was offered for storage. */
export class JsonValueError extends Error {}

const MAX_DEPTH = 64;

/**
 * Deep copy of a JSON value: null, booleans, finite numbers, strings, arrays
 * and plain objects of those. Anything else (undefined, NaN, Date, Map, class
 * instances, sparse arrays, cycles) throws `JsonValueError` instead of being
 * altered silently, so what is stored is what an export can reproduce.
 */
export function cloneJson(value: unknown): unknown {
  return copy(value, "value", 0);
}

function copy(value: unknown, path: string, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new JsonValueError(`${path} is not a finite number`);
    return value === 0 ? 0 : value; // JSON has no negative zero
  }
  if (typeof value !== "object") throw new JsonValueError(`${path} is a ${typeof value}, not a JSON value`);
  if (depth >= MAX_DEPTH) throw new JsonValueError(`${path} is nested deeper than ${MAX_DEPTH} levels`);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) throw new JsonValueError(`${path}[${i}] is a hole in a sparse array`);
      out.push(copy(value[i], `${path}[${i}]`, depth + 1));
    }
    return out;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new JsonValueError(`${path} is not a plain object`);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new JsonValueError(`${path} has symbol keys`);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, copy(child, `${path}.${key}`, depth + 1)]),
  );
}
