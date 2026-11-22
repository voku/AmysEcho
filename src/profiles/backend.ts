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

/** Arrays and objects may be nested this many levels inside one stored value. */
export const MAX_JSON_DEPTH = 64;

/**
 * Deep copy of a JSON value: null, booleans, finite numbers, strings, arrays
 * and plain objects of those, nested at most `MAX_JSON_DEPTH` levels.
 *
 * Everything JSON cannot represent exactly throws `JsonValueError` (with the
 * path of the offending part) instead of being dropped or altered, so what is
 * stored is what an export can reproduce. Rejected are:
 *
 * - undefined, functions, symbols, bigints, NaN and infinite numbers;
 * - objects that are not plain (Date, Map, typed arrays, class instances),
 *   and arrays of an Array subclass;
 * - objects with symbol keys, non-enumerable own properties, or getters and
 *   setters (accessors are refused without being called);
 * - arrays with holes, with getters, or with own properties besides their
 *   elements;
 * - nesting deeper than the limit, which also covers cycles.
 *
 * Negative zero is stored as zero. What `JSON.parse` returns is always accepted
 * (up to the depth limit).
 */
export function cloneJson(value: unknown): unknown {
  return copy(value, "value", 0);
}

/**
 * Copies a dictionary of JSON values: `value` itself must be a plain object and
 * each of its properties is copied with `cloneJson`, so the depth limit counts
 * per property and not from the dictionary.
 */
export function cloneJsonRecord(value: unknown, label = "value"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new JsonValueError(`${label} is not an object`);
  return copyObject(value, label, -1);
}

/**
 * The value of an own data property, or undefined when there is none. A getter
 * or setter is refused with `JsonValueError` without being called.
 */
export function ownValue(holder: unknown, name: string): unknown {
  if (typeof holder !== "object" || holder === null) throw new JsonValueError(`cannot read ${name} of a non-object`);
  const property = Object.getOwnPropertyDescriptor(holder, name);
  if (property !== undefined && !("value" in property)) throw new JsonValueError(`${name} is a getter or setter`);
  return property?.value;
}

function copy(value: unknown, path: string, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new JsonValueError(`${path} is not a finite number`);
    return value === 0 ? 0 : value; // JSON has no negative zero
  }
  if (typeof value !== "object") throw new JsonValueError(`${path} is a ${typeof value}, not a JSON value`);
  if (depth >= MAX_JSON_DEPTH) throw new JsonValueError(`${path} is nested deeper than ${MAX_JSON_DEPTH} levels`);
  return Array.isArray(value) ? copyArray(value, path, depth) : copyObject(value, path, depth);
}

function copyArray(value: readonly unknown[], path: string, depth: number): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new JsonValueError(`${path} is not a plain array`);
  const length = value.length;
  const out: unknown[] = new Array(length);
  for (let i = 0; i < length; i += 1) {
    const property = Object.getOwnPropertyDescriptor(value, i);
    if (property === undefined) throw new JsonValueError(`${path}[${i}] is a hole in a sparse array`);
    if (!("value" in property)) throw new JsonValueError(`${path}[${i}] is a getter or setter`);
    if (!property.enumerable) throw new JsonValueError(`${path}[${i}] is not enumerable`);
    const element: unknown = property.value;
    // Numbers are by far the most common element; skip building a path for them.
    out[i] = typeof element === "number" && Number.isFinite(element) && element !== 0 ? element : copy(element, `${path}[${i}]`, depth + 1);
  }
  // Every index is an own property, so anything beyond indices and "length" is extra.
  if (Reflect.ownKeys(value).length !== length + 1) throw new JsonValueError(`${path} is an array with extra properties`);
  return out;
}

function copyObject(value: object, path: string, depth: number): Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new JsonValueError(`${path} is not a plain object`);
  const out: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new JsonValueError(`${path} has a symbol key`);
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (property === undefined || !("value" in property)) throw new JsonValueError(`${path}.${key} is a getter or setter`);
    if (!property.enumerable) throw new JsonValueError(`${path}.${key} is not enumerable`);
    // defineProperty, so that a "__proto__" key stays an ordinary own property.
    Object.defineProperty(out, key, { value: copy(property.value, `${path}.${key}`, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  return out;
}
