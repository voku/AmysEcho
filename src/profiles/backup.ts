/**
 * Versioned export and restore of one profile.
 *
 * An export is a plain JSON document holding the profile record and all of its
 * data. It is not encrypted and, once handed to a caregiver, is outside the
 * app's control: deleting the profile later does not delete exported copies.
 */
import { JsonValueError, cloneJson, ownValue } from "./backend.js";
import { ProfileFormatError, parseProfile } from "./profile.js";
import type { ProfileV1 } from "./profile.js";
import { DataNameError, ProfileSizeError, checkProfileSize, cloneProfileData, measureProfileData, resolveLimits } from "./store.js";
import type { ConflictMode, ExportLimits, ProfileStore } from "./store.js";

export { EXPORT_ENVELOPE_RESERVE, MAX_EXPORT_BYTES, MAX_EXPORT_DATA_NAMES } from "./store.js";
export type { ExportLimits } from "./store.js";

export const EXPORT_FORMAT = "amys-echo-profile";
export const EXPORT_VERSION = 1;

export interface ProfileExportV1 {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: 1;
  /** ISO 8601, UTC, e.g. "2026-01-31T09:30:00.000Z". */
  readonly exportedAt: string;
  readonly profile: ProfileV1;
  readonly data: Record<string, unknown>;
}

/** The document is not a readable version-1 profile export. Nothing was written. */
export class ExportFormatError extends Error {}
/**
 * The document has more data names or more data than the limits allow. The
 * limits are the ones `ProfileStore` enforces on every write (see store.ts),
 * so a profile written through the store never runs into this on export.
 */
export class ExportSizeError extends ExportFormatError {}

export interface ExportOptions {
  /** Clock for `exportedAt`; defaults to the system time. */
  readonly now?: () => Date;
  /** Other limits than the store's own; meant for tests. */
  readonly limits?: ExportLimits;
}

export interface ImportOptions {
  /** What to do when a profile with the same id is already stored. Default "reject". */
  readonly onConflict?: ConflictMode;
  /** Other limits than the store's own; meant for tests. */
  readonly limits?: ExportLimits;
}

const EXPORTED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const DOCUMENT_FIELDS = ["data", "exportedAt", "format", "profile", "version"];

/**
 * A real UTC calendar timestamp, with or without milliseconds. `Date` accepts
 * 31 February and hour 24 by rolling over, so the parsed date has to print
 * back as the same text.
 */
function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !EXPORTED_AT_PATTERN.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === (value.length === 20 ? `${value.slice(0, 19)}.000Z` : value);
}

/** `data` must already be a validated copy: plain JSON values only. */
function checkSize(data: Record<string, unknown>, limits: ExportLimits): void {
  try {
    checkProfileSize(measureProfileData(data), limits);
  } catch (error) {
    if (error instanceof ProfileSizeError) throw new ExportSizeError(`export is too large: ${error.message}`, { cause: error });
    // JSON text beyond the engine's string length limit.
    if (error instanceof RangeError) throw new ExportSizeError("export is too large", { cause: error });
    throw error;
  }
}

/**
 * Rejects with `ExportSizeError` instead of producing a document that
 * `importProfile` would refuse for its size. That can only happen to a profile
 * whose data was not written through `ProfileStore` with these limits.
 */
export async function exportProfile(store: ProfileStore, id: string, options: ExportOptions = {}): Promise<ProfileExportV1> {
  const { profile, data } = await store.readProfile(id);
  const date = (options.now ?? (() => new Date()))();
  const exportedAt = Number.isNaN(date.getTime()) ? "" : date.toISOString();
  if (!isUtcTimestamp(exportedAt)) throw new ExportFormatError("the clock did not give a date in the years 0000 to 9999");
  checkSize(data, options.limits ?? store.limits);
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, profile, data };
}

/**
 * Checks the whole document without touching any store and returns a private,
 * normalised copy. Throws `ExportFormatError` on anything unexpected, and its
 * subclass `ExportSizeError` when the document is over the limits.
 */
export function parseProfileExport(document: unknown, limits: ExportLimits = {}): ProfileExportV1 {
  if (typeof document !== "object" || document === null || Array.isArray(document)) throw new ExportFormatError("export must be a JSON object");
  // Own data properties only; a getter is refused without being called.
  const field = (name: string): unknown => {
    try {
      return ownValue(document, name);
    } catch (error) {
      throw new ExportFormatError(`invalid export: ${name} cannot be read`, { cause: error });
    }
  };
  if (field("format") !== EXPORT_FORMAT) throw new ExportFormatError("not an Amy's Echo profile export");
  if (field("version") !== EXPORT_VERSION) throw new ExportFormatError("unsupported export version");
  const fields = Reflect.ownKeys(document).map(String).sort();
  if (fields.length !== DOCUMENT_FIELDS.length || fields.some((name, i) => name !== DOCUMENT_FIELDS[i])) {
    throw new ExportFormatError("export must have exactly the fields format, version, exportedAt, profile, data");
  }
  const exportedAt = field("exportedAt");
  if (!isUtcTimestamp(exportedAt)) throw new ExportFormatError("exportedAt is not an ISO 8601 UTC timestamp");
  const rawData = field("data");
  if (typeof rawData !== "object" || rawData === null || Array.isArray(rawData)) throw new ExportFormatError("data must be an object");
  // Checked again with the bytes below; this one avoids copying a document with far too many names.
  const { maxDataNames } = resolveLimits(limits);
  if (Object.keys(rawData).length > maxDataNames) throw new ExportSizeError(`export holds more than ${maxDataNames} data names`);
  let parsed: ProfileExportV1;
  try {
    const profile = parseProfile(cloneJson(field("profile")));
    parsed = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, profile, data: cloneProfileData(rawData) };
  } catch (error) {
    if (error instanceof JsonValueError || error instanceof ProfileFormatError || error instanceof DataNameError) {
      throw new ExportFormatError(`invalid export: ${error.message}`, { cause: error });
    }
    throw error;
  }
  checkSize(parsed.data, limits);
  return parsed;
}

/**
 * Validates the whole document first (format, content, size limits), then
 * writes profile and data in one atomic batch. A rejected or failed import
 * leaves the store unchanged. Returns the stored profile; with "copy" on a
 * conflict its id is new.
 */
export async function importProfile(store: ProfileStore, document: unknown, options: ImportOptions = {}): Promise<ProfileV1> {
  const parsed = parseProfileExport(document, options.limits ?? store.limits);
  try {
    return await store.restoreProfile({ profile: parsed.profile, data: parsed.data }, options.onConflict ?? "reject");
  } catch (error) {
    // Only when `options.limits` allow more than the store itself does.
    if (error instanceof ProfileSizeError) throw new ExportSizeError(`export is too large: ${error.message}`, { cause: error });
    throw error;
  }
}
