/**
 * Profile store: several child profiles on one device, each with its own data.
 *
 * Key layout (the only place that builds storage keys):
 *
 *   app/schema                  layout version, written on first use
 *   app/active-profile          id of the profile currently in use
 *   profile/<id>/meta           the ProfileV1 record
 *   profile/<id>/usage          how much data the profile holds (names, bytes)
 *   profile/<id>/data/<name>    data owned by that profile
 *
 * Isolation is structural: ids and data names are checked against fixed
 * patterns before they become part of a key, neither can contain "/", and a
 * data accessor can only build keys below its own `profile/<id>/data/`.
 *
 * Every write that changes a profile's data updates its usage record in the
 * same atomic batch and is refused when the profile would no longer fit into
 * one export. So, within one store instance, a profile that was written
 * through the store can be backed up.
 *
 * Operations of one store instance run one after another. Two browser tabs
 * each have their own instance and are not coordinated with each other. Two
 * instances writing to the same profile at the same time can leave a usage
 * record that is too low or too high, and data beyond the limits. `usage(id)`
 * and `readProfile` (so every export) count again and correct the record.
 */
import { cloneJson, cloneJsonRecord, ownValue } from "./backend.js";
import type { KeyValueBackend } from "./backend.js";
import { PROFILE_VERSION, ProfileFormatError, isProfileId, makeProfile, newProfileId, parseProfile } from "./profile.js";
import type { ProfileV1 } from "./profile.js";

export const STORAGE_SCHEMA_VERSION = 1;
const SCHEMA_KEY = "app/schema";
const ACTIVE_KEY = "app/active-profile";
const PROFILE_ROOT = "profile/";
const DATA_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Most data names one profile, and so one export, may hold. */
export const MAX_EXPORT_DATA_NAMES = 10_000;
/** Largest export, measured as UTF-8 bytes of the document written as compact JSON (64 MiB). */
export const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
/**
 * Bytes of an export set aside for everything that is not data: the fixed
 * fields and the largest possible profile record (40-character name, 500
 * concept ids of 64 characters). The largest such document is just under
 * 34,000 bytes; a test builds it.
 */
export const EXPORT_ENVELOPE_RESERVE = 34 * 1024;
/** Counted per data entry on top of name and value: two quotes, a colon and a comma. */
const ENTRY_OVERHEAD = 4;

export interface ExportLimits {
  readonly maxDataNames?: number;
  /** Limit for a whole export document; must be larger than `EXPORT_ENVELOPE_RESERVE`. */
  readonly maxBytes?: number;
}

export interface ProfileUsage {
  /** Data names stored. */
  readonly names: number;
  /** Counted size of the data: per entry the UTF-8 bytes of the value as compact JSON, the name, and 4. */
  readonly bytes: number;
  readonly maxNames: number;
  /** The most `bytes` may reach: the export limit minus `EXPORT_ENVELOPE_RESERVE`. */
  readonly maxBytes: number;
}

/** No profile with this id is stored (or the value is not a profile id at all). */
export class UnknownProfileError extends Error {}
/** The stored layout is from another app version or not recognisable; nothing was touched. */
export class StorageSchemaError extends Error {}
export class DataNameError extends Error {}
/** The write would make the profile hold more names or bytes than one export may; nothing was written. */
export class ProfileSizeError extends Error {}
/** A profile with the same id already exists and the caller asked not to touch it. */
export class ProfileConflictError extends Error {}
/** `removeDamaged` was asked to delete an entry that is readable; use `remove` for those. */
export class NotDamagedError extends Error {}

export type ConflictMode = "reject" | "replace" | "copy";

/**
 * "unsupported-version": the stored record says it was written by a newer app
 * version; it is probably intact, so update the app instead of deleting it.
 * "unreadable": anything else that cannot be read.
 */
export type DamageKind = "unsupported-version" | "unreadable";

export interface DamagedProfile {
  /** The id segment of the storage key; not guaranteed to be a well-formed id. Pass it to `removeDamaged` unchanged. */
  readonly id: string;
  readonly kind: DamageKind;
  /** Free text for logs and support; not for deciding what to offer. */
  readonly reason: string;
}

export interface ProfileListing {
  readonly profiles: readonly ProfileV1[];
  /** Stored profiles that could not be read. Never dropped silently: tell the caregiver. */
  readonly damaged: readonly DamagedProfile[];
}

export interface ProfileContents {
  readonly profile: ProfileV1;
  readonly data: Record<string, unknown>;
}

/** Data of exactly one profile. Values are JSON values; reads return private copies. */
export interface ProfileData {
  get(name: string): Promise<unknown | undefined>;
  /**
   * Rejects with `ProfileSizeError`, changing nothing, when the profile would
   * outgrow one export. A write that adds neither a name nor bytes is always
   * accepted, so a profile that is over the limit can be made smaller.
   */
  set(name: string, value: unknown): Promise<void>;
  delete(name: string): Promise<void>;
  names(): Promise<string[]>;
}

export function isDataName(value: unknown): value is string {
  return typeof value === "string" && DATA_NAME_PATTERN.test(value);
}

/**
 * Private copy of a name-to-value dictionary of profile data. Throws
 * `JsonValueError` when it is not a plain object of JSON values and
 * `DataNameError` for a bad name. Each value has the same limits as in
 * `data(id).set`, so whatever was stored can be exported and restored.
 */
export function cloneProfileData(data: unknown): Record<string, unknown> {
  const copy = cloneJsonRecord(data, "data");
  for (const name of Object.keys(copy)) dataKey("", name);
  return copy;
}

export function utf8Length(text: string): number {
  let bytes = text.length;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    // Two surrogates together are 4 bytes, so each counts 2; other units above 0x7ff are 3 bytes.
    if (unit > 0x7f) bytes += unit > 0x7ff && (unit < 0xd800 || unit > 0xdfff) ? 2 : 1;
  }
  return bytes;
}

/**
 * Counted size of one data entry. Summed over a profile and with
 * `EXPORT_ENVELOPE_RESERVE` added, it is never less than the bytes of the
 * export document, which holds each entry as `"name":value,`.
 */
function entryBytes(name: string, value: unknown): number {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    // JSON text beyond the engine's string length limit.
    if (error instanceof RangeError) throw new ProfileSizeError("a value is too large to be written as JSON", { cause: error });
    throw error;
  }
  return utf8Length(text) + name.length + ENTRY_OVERHEAD;
}

/** Counted names and bytes of a validated name-to-value dictionary (see `cloneProfileData`). */
export function measureProfileData(data: Readonly<Record<string, unknown>>): Usage {
  let names = 0;
  let bytes = 0;
  for (const [name, value] of Object.entries(data)) {
    names += 1;
    bytes += entryBytes(name, value);
  }
  return { names, bytes };
}

interface ResolvedLimits {
  readonly maxDataNames: number;
  readonly maxBytes: number;
}

export function resolveLimits(limits: ExportLimits | undefined): ResolvedLimits {
  const maxDataNames = limits?.maxDataNames ?? MAX_EXPORT_DATA_NAMES;
  const maxBytes = limits?.maxBytes ?? MAX_EXPORT_BYTES;
  if (!Number.isSafeInteger(maxDataNames) || maxDataNames < 0) throw new TypeError("maxDataNames must be a non-negative integer");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < EXPORT_ENVELOPE_RESERVE) throw new TypeError(`maxBytes must be an integer of at least ${EXPORT_ENVELOPE_RESERVE}`);
  return { maxDataNames, maxBytes };
}

type Usage = { readonly names: number; readonly bytes: number };

/** Why data of this size does not fit into one export, or null when it fits. */
function sizeProblem(usage: Usage, limits: ExportLimits | undefined): string | null {
  const { maxDataNames, maxBytes } = resolveLimits(limits);
  if (usage.names > maxDataNames) return `${usage.names} data names; the limit is ${maxDataNames}`;
  const budget = maxBytes - EXPORT_ENVELOPE_RESERVE;
  return usage.bytes > budget ? `${usage.bytes} bytes of data; the limit is ${budget}` : null;
}

/** Throws `ProfileSizeError` when data of this size does not fit into one export. */
export function checkProfileSize(usage: Usage, limits: ExportLimits | undefined): void {
  const problem = sizeProblem(usage, limits);
  if (problem !== null) throw new ProfileSizeError(problem);
}

function isUsage(value: unknown): value is { names: number; bytes: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { names, bytes } = value as { names?: unknown; bytes?: unknown };
  const isCount = (count: unknown): boolean => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  return Object.keys(value).length === 2 && isCount(names) && isCount(bytes);
}

function profilePrefix(id: string): string {
  if (!isProfileId(id)) throw new UnknownProfileError("not a profile id");
  return `${PROFILE_ROOT}${id}/`;
}

function dataKey(prefix: string, name: string): string {
  if (!isDataName(name)) throw new DataNameError("data names are 1 to 64 characters of a-z, 0-9, '.', '_' and '-', starting with a letter or digit");
  return `${prefix}data/${name}`;
}

export class ProfileStore {
  readonly #backend: KeyValueBackend;
  readonly #limits: ResolvedLimits;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(backend: KeyValueBackend, limits: ResolvedLimits) {
    this.#backend = backend;
    this.#limits = limits;
  }

  /** The size limits this store enforces on writes; export and import use the same unless told otherwise. */
  get limits(): Required<ExportLimits> {
    return this.#limits;
  }

  /**
   * Fails closed with `StorageSchemaError` on an unknown layout, without
   * writing anything. `options.limits` lowers the size limits; meant for tests.
   */
  static async open(backend: KeyValueBackend, options: { readonly limits?: ExportLimits } = {}): Promise<ProfileStore> {
    const limits = resolveLimits(options.limits);
    const schema = await backend.get(SCHEMA_KEY);
    if (schema === undefined) {
      if ((await backend.keys("")).length > 0) throw new StorageSchemaError("storage holds data but no schema marker");
      await backend.write({ set: { [SCHEMA_KEY]: STORAGE_SCHEMA_VERSION } });
    } else if (schema !== STORAGE_SCHEMA_VERSION) {
      throw new StorageSchemaError(`unsupported storage schema ${JSON.stringify(schema)}; this app version reads schema ${STORAGE_SCHEMA_VERSION}`);
    }
    return new ProfileStore(backend, limits);
  }

  list(): Promise<ProfileListing> {
    return this.#exclusive(async () => {
      const segments = new Set<string>();
      const keys = await this.#backend.keys(PROFILE_ROOT);
      for (const key of keys) segments.add(key.slice(PROFILE_ROOT.length).split("/", 1)[0] ?? "");
      const profiles: ProfileV1[] = [];
      const damaged: DamagedProfile[] = [];
      for (const id of segments) {
        if (!isProfileId(id)) {
          damaged.push({ id, kind: "unreadable", reason: "storage key does not contain a profile id" });
          continue;
        }
        const raw = await this.#backend.get(`${profilePrefix(id)}meta`);
        try {
          profiles.push(this.#parseMeta(id, raw));
        } catch (error) {
          if (!(error instanceof ProfileFormatError) && !(error instanceof UnknownProfileError)) throw error;
          const version = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as { version?: unknown }).version : undefined;
          const newer = typeof version === "number" && version > PROFILE_VERSION;
          damaged.push({
            id,
            kind: newer ? "unsupported-version" : "unreadable",
            reason: error instanceof UnknownProfileError ? "profile record is missing" : error.message,
          });
        }
      }
      return { profiles, damaged };
    });
  }

  /** Rejects with `UnknownProfileError`, or `ProfileFormatError` when the stored record is damaged. */
  get(id: string): Promise<ProfileV1> {
    return this.#exclusive(() => this.#readMeta(id));
  }

  create(displayName: string, conceptIds: readonly string[]): Promise<ProfileV1> {
    return this.#exclusive(async () => {
      const profile = makeProfile(await this.#unusedId(), displayName, conceptIds);
      const prefix = profilePrefix(profile.id);
      await this.#backend.write({ set: { [`${prefix}meta`]: profile, [`${prefix}usage`]: { names: 0, bytes: 0 } } });
      return profile;
    });
  }

  rename(id: string, displayName: string): Promise<ProfileV1> {
    return this.#update(id, (current) => makeProfile(current.id, displayName, current.conceptIds));
  }

  setConceptIds(id: string, conceptIds: readonly string[]): Promise<ProfileV1> {
    return this.#update(id, (current) => makeProfile(current.id, current.displayName, conceptIds));
  }

  /**
   * Deletes every key below `profile/<id>/` in one atomic batch, clears the
   * active-profile pointer when it named this profile, then checks that nothing
   * is left. Works on damaged profiles too, so they can be cleaned up.
   */
  remove(id: string): Promise<void> {
    return this.#exclusive(async () => {
      const prefix = profilePrefix(id);
      const owned = await this.#backend.keys(prefix);
      if (owned.length === 0) throw new UnknownProfileError("no such profile");
      const wasActive = (await this.#backend.get(ACTIVE_KEY)) === id;
      await this.#backend.write({ delete: wasActive ? [...owned, ACTIVE_KEY] : owned });
      if ((await this.#backend.keys(prefix)).length > 0) throw new Error("profile data is still present after deletion");
    });
  }

  /**
   * Deletes a stored entry that `list()` reported as damaged, including one
   * whose id segment is not a well-formed id. `segment` is the reported `id`,
   * unchanged; only `profile/<segment>` and keys below `profile/<segment>/`
   * are deleted. A segment containing "/" is refused, and so is a readable
   * profile (`NotDamagedError`).
   */
  removeDamaged(segment: string): Promise<void> {
    return this.#exclusive(async () => {
      if (typeof segment !== "string" || segment.includes("/")) throw new UnknownProfileError("not a storage id segment");
      const entry = `${PROFILE_ROOT}${segment}`;
      const owned = (await this.#backend.keys(entry)).filter((key) => key === entry || key.startsWith(`${entry}/`));
      if (owned.length === 0) throw new UnknownProfileError("no such stored entry");
      if (isProfileId(segment) && (await this.#readable(segment))) throw new NotDamagedError("this profile is readable; use remove");
      const wasActive = (await this.#backend.get(ACTIVE_KEY)) === segment;
      await this.#backend.write({ delete: wasActive ? [...owned, ACTIVE_KEY] : owned });
    });
  }

  /**
   * The active profile id, or null when none is set or it does not name a
   * readable stored profile. A damaged record is reported by `list()`, not here.
   */
  getActive(): Promise<string | null> {
    return this.#exclusive(async () => {
      const id = await this.#backend.get(ACTIVE_KEY);
      return isProfileId(id) && (await this.#readable(id)) ? id : null;
    });
  }

  /** Rejects with `UnknownProfileError`, or `ProfileFormatError` when the stored record is damaged. */
  setActive(id: string | null): Promise<void> {
    return this.#exclusive(async () => {
      if (id === null) return this.#backend.write({ delete: [ACTIVE_KEY] });
      await this.#readMeta(id);
      return this.#backend.write({ set: { [ACTIVE_KEY]: id } });
    });
  }

  /** Accessor for one profile's data. Throws `UnknownProfileError` at once for a malformed id. */
  data(id: string): ProfileData {
    const prefix = profilePrefix(id);
    const dataPrefix = `${prefix}data/`;
    return {
      get: (name) => this.#exclusive(async () => {
        const key = dataKey(prefix, name);
        await this.#requireExisting(id);
        return this.#backend.get(key);
      }),
      set: (name, value) => this.#exclusive(async () => {
        const key = dataKey(prefix, name);
        const copy = cloneJson(value);
        await this.#requireExisting(id);
        let before = await this.#readUsage(id);
        const old = await this.#backend.get(key);
        const addedNames = old === undefined ? 1 : 0;
        const addedBytes = entryBytes(name, copy) - (old === undefined ? 0 : entryBytes(name, old));
        const plan = (from: Usage): Usage => ({ names: from.names + addedNames, bytes: from.bytes + addedBytes });
        let after = plan(before);
        const grows = addedNames > 0 || addedBytes > 0;
        if (grows && (sizeProblem(before, this.#limits) !== null || sizeProblem(after, this.#limits) !== null)) {
          // The stored record may be too high. Refuse only on what is really stored.
          before = await this.#correctUsage(id, await this.#countUsage(id));
          after = plan(before);
          const already = sizeProblem(before, this.#limits);
          if (already !== null) throw new ProfileSizeError(`the profile is already over the limit (${already}); delete entries before adding data`);
          checkProfileSize(after, this.#limits);
        }
        await this.#backend.write({ set: { [key]: copy, [`${prefix}usage`]: after } });
      }),
      delete: (name) => this.#exclusive(async () => {
        const key = dataKey(prefix, name);
        await this.#requireExisting(id);
        const before = await this.#readUsage(id);
        const old = await this.#backend.get(key);
        const after = old === undefined ? before : { names: before.names - 1, bytes: before.bytes - entryBytes(name, old) };
        await this.#backend.write({ delete: [key], set: { [`${prefix}usage`]: after } });
      }),
      names: () => this.#exclusive(async () => {
        await this.#requireExisting(id);
        return (await this.#backend.keys(dataPrefix)).map((key) => key.slice(dataPrefix.length));
      }),
    };
  }

  /**
   * How much data the profile holds and how much it may hold, so that a carer
   * can be warned well before a write is refused. This is the authoritative
   * and slow call: it reads all of the profile's data, counts it, and writes
   * the usage record when the stored one differs. The result can be above the
   * limits (see the note on two store instances at the top of this file).
   */
  usage(id: string): Promise<ProfileUsage> {
    return this.#exclusive(async () => {
      await this.#requireExisting(id);
      const usage = await this.#correctUsage(id, await this.#countUsage(id));
      return { ...usage, maxNames: this.#limits.maxDataNames, maxBytes: this.#limits.maxBytes - EXPORT_ENVELOPE_RESERVE };
    });
  }

  /**
   * The profile record, all of its data and the counted size of that data,
   * read as one step. Used by export. Writes the usage record when the stored
   * one disagrees with the count.
   */
  readProfile(id: string): Promise<ProfileContents & { readonly usage: Usage }> {
    return this.#exclusive(async () => {
      const profile = await this.#readMeta(id);
      const dataPrefix = `${profilePrefix(id)}data/`;
      const data: Record<string, unknown> = {};
      for (const key of await this.#backend.keys(dataPrefix)) {
        const value = await this.#backend.get(key);
        if (value !== undefined) Object.defineProperty(data, key.slice(dataPrefix.length), { value, enumerable: true, writable: true, configurable: true });
      }
      return { profile, data, usage: await this.#correctUsage(id, measureProfileData(data)) };
    });
  }

  /**
   * Writes a whole profile (record plus data) in one atomic batch. Used by
   * import. Everything is checked before the write, so a rejected call changes
   * nothing: `ProfileFormatError` for the record, `JsonValueError` or
   * `DataNameError` for the data, `ProfileSizeError` when it would not fit
   * into one export. Getters are refused, not called.
   * When a profile with the same id exists: "reject" throws
   * `ProfileConflictError`; "replace" removes all of its keys in the same
   * batch; "copy" stores the incoming profile under a new random id.
   */
  restoreProfile(contents: ProfileContents, onConflict: ConflictMode = "reject"): Promise<ProfileV1> {
    return this.#exclusive(async () => {
      if (onConflict !== "reject" && onConflict !== "replace" && onConflict !== "copy") throw new TypeError("unknown conflict mode");
      let profile = parseProfile(cloneJson(ownValue(contents, "profile")));
      const data = cloneProfileData(ownValue(contents, "data"));
      const names = Object.keys(data);
      const usage = measureProfileData(data);
      checkProfileSize(usage, this.#limits);
      let stale = await this.#backend.keys(profilePrefix(profile.id));
      if (stale.length > 0 && onConflict === "reject") throw new ProfileConflictError("a profile with this id already exists");
      if (stale.length > 0 && onConflict === "copy") {
        profile = makeProfile(await this.#unusedId(), profile.displayName, profile.conceptIds);
        stale = [];
      }
      const prefix = profilePrefix(profile.id);
      const set: Record<string, unknown> = { [`${prefix}meta`]: profile, [`${prefix}usage`]: usage };
      for (const name of names) set[dataKey(prefix, name)] = data[name];
      await this.#backend.write({ delete: stale, set });
      return profile;
    });
  }

  #update(id: string, change: (current: ProfileV1) => ProfileV1): Promise<ProfileV1> {
    return this.#exclusive(async () => {
      const next = change(await this.#readMeta(id));
      await this.#backend.write({ set: { [`${profilePrefix(id)}meta`]: next } });
      return next;
    });
  }

  /**
   * The stored usage record, or a fresh count when it is missing or cannot be
   * right (data written before usage was recorded, or a damaged record).
   */
  async #readUsage(id: string): Promise<Usage> {
    const stored = await this.#backend.get(`${profilePrefix(id)}usage`);
    return isUsage(stored) ? { names: stored.names, bytes: stored.bytes } : this.#countUsage(id);
  }

  /**
   * Writes `counted` as the usage record unless exactly that is stored
   * already. Best effort: the callers have read everything they need, so a
   * failing write must not fail them; the next count tries again.
   */
  async #correctUsage(id: string, counted: Usage): Promise<Usage> {
    const key = `${profilePrefix(id)}usage`;
    const stored = await this.#backend.get(key);
    if (!isUsage(stored) || stored.names !== counted.names || stored.bytes !== counted.bytes) {
      await this.#backend.write({ set: { [key]: counted } }).catch(() => undefined);
    }
    return counted;
  }

  async #countUsage(id: string): Promise<Usage> {
    const dataPrefix = `${profilePrefix(id)}data/`;
    let names = 0;
    let bytes = 0;
    for (const key of await this.#backend.keys(dataPrefix)) {
      const value = await this.#backend.get(key);
      if (value === undefined) continue;
      names += 1;
      bytes += entryBytes(key.slice(dataPrefix.length), value);
    }
    return { names, bytes };
  }

  async #readMeta(id: string): Promise<ProfileV1> {
    return this.#parseMeta(id, await this.#backend.get(`${profilePrefix(id)}meta`));
  }

  #parseMeta(id: string, raw: unknown): ProfileV1 {
    if (raw === undefined) throw new UnknownProfileError("no such profile");
    const profile = parseProfile(raw);
    if (profile.id !== id) throw new ProfileFormatError("stored profile record carries a different id than its storage key");
    return profile;
  }

  async #exists(id: string): Promise<boolean> {
    return (await this.#backend.get(`${profilePrefix(id)}meta`)) !== undefined;
  }

  async #readable(id: string): Promise<boolean> {
    try {
      await this.#readMeta(id);
      return true;
    } catch (error) {
      if (error instanceof ProfileFormatError || error instanceof UnknownProfileError) return false;
      throw error;
    }
  }

  async #requireExisting(id: string): Promise<void> {
    if (!(await this.#exists(id))) throw new UnknownProfileError("no such profile");
  }

  async #unusedId(): Promise<string> {
    const id = newProfileId();
    if ((await this.#backend.keys(profilePrefix(id))).length > 0) throw new Error("random profile id collided with a stored profile");
    return id;
  }

  /** Runs tasks strictly one after another, so a read-then-write step is not interleaved with another. */
  #exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task);
    this.#queue = run.catch(() => undefined);
    return run;
  }
}
