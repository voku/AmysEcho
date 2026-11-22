/**
 * Profile store: several child profiles on one device, each with its own data.
 *
 * Key layout (the only place that builds storage keys):
 *
 *   app/schema                  layout version, written on first use
 *   app/active-profile          id of the profile currently in use
 *   profile/<id>/meta           the ProfileV1 record
 *   profile/<id>/data/<name>    data owned by that profile
 *
 * Isolation is structural: ids and data names are checked against fixed
 * patterns before they become part of a key, neither can contain "/", and a
 * data accessor can only build keys below its own `profile/<id>/data/`.
 *
 * Operations of one store instance run one after another. Two browser tabs
 * each have their own instance and are not coordinated with each other.
 */
import { cloneJson } from "./backend.js";
import type { KeyValueBackend } from "./backend.js";
import { ProfileFormatError, isProfileId, makeProfile, newProfileId, parseProfile } from "./profile.js";
import type { ProfileV1 } from "./profile.js";

export const STORAGE_SCHEMA_VERSION = 1;
const SCHEMA_KEY = "app/schema";
const ACTIVE_KEY = "app/active-profile";
const PROFILE_ROOT = "profile/";
const DATA_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** No profile with this id is stored (or the value is not a profile id at all). */
export class UnknownProfileError extends Error {}
/** The stored layout is from another app version or not recognisable; nothing was touched. */
export class StorageSchemaError extends Error {}
export class DataNameError extends Error {}
/** A profile with the same id already exists and the caller asked not to touch it. */
export class ProfileConflictError extends Error {}

export type ConflictMode = "reject" | "replace" | "copy";

export interface DamagedProfile {
  /** The id segment of the storage key; not guaranteed to be a well-formed id. */
  readonly id: string;
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
  set(name: string, value: unknown): Promise<void>;
  delete(name: string): Promise<void>;
  names(): Promise<string[]>;
}

export function isDataName(value: unknown): value is string {
  return typeof value === "string" && DATA_NAME_PATTERN.test(value);
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
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(backend: KeyValueBackend) {
    this.#backend = backend;
  }

  /** Fails closed with `StorageSchemaError` on an unknown layout, without writing anything. */
  static async open(backend: KeyValueBackend): Promise<ProfileStore> {
    const schema = await backend.get(SCHEMA_KEY);
    if (schema === undefined) {
      if ((await backend.keys("")).length > 0) throw new StorageSchemaError("storage holds data but no schema marker");
      await backend.write({ set: { [SCHEMA_KEY]: STORAGE_SCHEMA_VERSION } });
    } else if (schema !== STORAGE_SCHEMA_VERSION) {
      throw new StorageSchemaError(`unsupported storage schema ${JSON.stringify(schema)}; this app version reads schema ${STORAGE_SCHEMA_VERSION}`);
    }
    return new ProfileStore(backend);
  }

  list(): Promise<ProfileListing> {
    return this.#exclusive(async () => {
      const segments = new Set<string>();
      const keys = await this.#backend.keys(PROFILE_ROOT);
      for (const key of keys) segments.add(key.slice(PROFILE_ROOT.length).split("/", 1)[0] ?? "");
      const profiles: ProfileV1[] = [];
      const damaged: DamagedProfile[] = [];
      for (const id of segments) {
        try {
          if (!isProfileId(id)) throw new ProfileFormatError("storage key does not contain a profile id");
          profiles.push(await this.#readMeta(id));
        } catch (error) {
          if (!(error instanceof ProfileFormatError) && !(error instanceof UnknownProfileError)) throw error;
          damaged.push({ id, reason: error instanceof UnknownProfileError ? "profile record is missing" : error.message });
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
      await this.#backend.write({ set: { [`${profilePrefix(profile.id)}meta`]: profile } });
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

  /** The active profile id, or null when none is set or it no longer names a stored profile. */
  getActive(): Promise<string | null> {
    return this.#exclusive(async () => {
      const id = await this.#backend.get(ACTIVE_KEY);
      return isProfileId(id) && (await this.#exists(id)) ? id : null;
    });
  }

  setActive(id: string | null): Promise<void> {
    return this.#exclusive(async () => {
      if (id === null) return this.#backend.write({ delete: [ACTIVE_KEY] });
      await this.#requireExisting(id);
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
        await this.#backend.write({ set: { [key]: copy } });
      }),
      delete: (name) => this.#exclusive(async () => {
        const key = dataKey(prefix, name);
        await this.#requireExisting(id);
        await this.#backend.write({ delete: [key] });
      }),
      names: () => this.#exclusive(async () => {
        await this.#requireExisting(id);
        return (await this.#backend.keys(dataPrefix)).map((key) => key.slice(dataPrefix.length));
      }),
    };
  }

  /** The profile record and all of its data, read as one step. Used by export. */
  readProfile(id: string): Promise<ProfileContents> {
    return this.#exclusive(async () => {
      const profile = await this.#readMeta(id);
      const dataPrefix = `${profilePrefix(id)}data/`;
      const data: Record<string, unknown> = {};
      for (const key of await this.#backend.keys(dataPrefix)) {
        const value = await this.#backend.get(key);
        if (value !== undefined) Object.defineProperty(data, key.slice(dataPrefix.length), { value, enumerable: true, writable: true, configurable: true });
      }
      return { profile, data };
    });
  }

  /**
   * Writes a whole profile (record plus data) in one atomic batch. Used by
   * import. Everything is checked before the write, so a rejected call changes
   * nothing. When a profile with the same id exists: "reject" throws
   * `ProfileConflictError`; "replace" removes all of its keys in the same
   * batch; "copy" stores the incoming profile under a new random id.
   */
  restoreProfile(contents: ProfileContents, onConflict: ConflictMode = "reject"): Promise<ProfileV1> {
    return this.#exclusive(async () => {
      if (onConflict !== "reject" && onConflict !== "replace" && onConflict !== "copy") throw new TypeError("unknown conflict mode");
      let profile = parseProfile(contents.profile);
      const names = Object.keys(contents.data);
      for (const name of names) dataKey("", name);
      const data = cloneJson(contents.data) as Record<string, unknown>;
      let stale = await this.#backend.keys(profilePrefix(profile.id));
      if (stale.length > 0 && onConflict === "reject") throw new ProfileConflictError("a profile with this id already exists");
      if (stale.length > 0 && onConflict === "copy") {
        profile = makeProfile(await this.#unusedId(), profile.displayName, profile.conceptIds);
        stale = [];
      }
      const prefix = profilePrefix(profile.id);
      const set: Record<string, unknown> = { [`${prefix}meta`]: profile };
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

  async #readMeta(id: string): Promise<ProfileV1> {
    const raw = await this.#backend.get(`${profilePrefix(id)}meta`);
    if (raw === undefined) throw new UnknownProfileError("no such profile");
    const profile = parseProfile(raw);
    if (profile.id !== id) throw new ProfileFormatError("stored profile record carries a different id than its storage key");
    return profile;
  }

  async #exists(id: string): Promise<boolean> {
    return (await this.#backend.get(`${profilePrefix(id)}meta`)) !== undefined;
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
