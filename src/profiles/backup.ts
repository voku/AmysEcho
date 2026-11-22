/**
 * Versioned export and restore of one profile.
 *
 * An export is a plain JSON document holding the profile record and all of its
 * data. It is not encrypted and, once handed to a caregiver, is outside the
 * app's control: deleting the profile later does not delete exported copies.
 */
import { JsonValueError, cloneJson } from "./backend.js";
import { ProfileFormatError, parseProfile } from "./profile.js";
import type { ProfileV1 } from "./profile.js";
import { isDataName } from "./store.js";
import type { ConflictMode, ProfileStore } from "./store.js";

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

export interface ExportOptions {
  /** Clock for `exportedAt`; defaults to the system time. */
  readonly now?: () => Date;
}

export interface ImportOptions {
  /** What to do when a profile with the same id is already stored. Default "reject". */
  readonly onConflict?: ConflictMode;
}

const EXPORTED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DOCUMENT_FIELDS = ["data", "exportedAt", "format", "profile", "version"];

export async function exportProfile(store: ProfileStore, id: string, options: ExportOptions = {}): Promise<ProfileExportV1> {
  const { profile, data } = await store.readProfile(id);
  const exportedAt = (options.now ?? (() => new Date()))().toISOString();
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, profile, data };
}

/**
 * Checks the whole document without touching any store and returns a private,
 * normalised copy. Throws `ExportFormatError` on anything unexpected.
 */
export function parseProfileExport(document: unknown): ProfileExportV1 {
  if (typeof document !== "object" || document === null || Array.isArray(document)) throw new ExportFormatError("export must be a JSON object");
  const record = document as Record<string, unknown>;
  if (record["format"] !== EXPORT_FORMAT) throw new ExportFormatError("not an Amy's Echo profile export");
  if (record["version"] !== EXPORT_VERSION) throw new ExportFormatError("unsupported export version");
  const fields = Object.keys(record).sort();
  if (fields.length !== DOCUMENT_FIELDS.length || fields.some((field, i) => field !== DOCUMENT_FIELDS[i])) {
    throw new ExportFormatError("export must have exactly the fields format, version, exportedAt, profile, data");
  }
  const exportedAt = record["exportedAt"];
  if (typeof exportedAt !== "string" || !EXPORTED_AT_PATTERN.test(exportedAt) || Number.isNaN(Date.parse(exportedAt))) {
    throw new ExportFormatError("exportedAt is not an ISO 8601 UTC timestamp");
  }
  const rawData = record["data"];
  if (typeof rawData !== "object" || rawData === null || Array.isArray(rawData)) throw new ExportFormatError("data must be an object");
  try {
    const profile = parseProfile(record["profile"]);
    for (const name of Object.keys(rawData)) {
      if (!isDataName(name)) throw new ExportFormatError("data contains an invalid name");
    }
    const data = cloneJson(rawData) as Record<string, unknown>;
    return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, profile, data };
  } catch (error) {
    if (error instanceof ExportFormatError) throw error;
    if (error instanceof JsonValueError || error instanceof ProfileFormatError) throw new ExportFormatError(`invalid export: ${error.message}`, { cause: error });
    throw error;
  }
}

/**
 * Validates the whole document first, then writes profile and data in one
 * atomic batch. A rejected or failed import leaves the store unchanged.
 * Returns the stored profile; with "copy" on a conflict its id is new.
 */
export async function importProfile(store: ProfileStore, document: unknown, options: ImportOptions = {}): Promise<ProfileV1> {
  const parsed = parseProfileExport(document);
  return store.restoreProfile({ profile: parsed.profile, data: parsed.data }, options.onConflict ?? "reject");
}
