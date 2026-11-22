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
import { DataNameError, cloneProfileData } from "./store.js";
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
/** The document has more data names or is larger than the limits allow. */
export class ExportSizeError extends ExportFormatError {}

/** Most data names one export may hold. */
export const MAX_EXPORT_DATA_NAMES = 10_000;
/** Largest export, measured as UTF-8 bytes of the document written as compact JSON (64 MiB). */
export const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

export interface ExportLimits {
  readonly maxDataNames?: number;
  readonly maxBytes?: number;
}

export interface ExportOptions {
  /** Clock for `exportedAt`; defaults to the system time. */
  readonly now?: () => Date;
  /** Lower limits for tests. Use the same on export and import. */
  readonly limits?: ExportLimits;
}

export interface ImportOptions {
  /** What to do when a profile with the same id is already stored. Default "reject". */
  readonly onConflict?: ConflictMode;
  /** Lower limits for tests. Use the same on export and import. */
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

function utf8Length(text: string): number {
  let bytes = text.length;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    // Two surrogates together are 4 bytes, so each counts 2; other units above 0x7ff are 3 bytes.
    if (unit > 0x7f) bytes += unit > 0x7ff && (unit < 0xd800 || unit > 0xdfff) ? 2 : 1;
  }
  return bytes;
}

/** `document` must already be a validated copy: plain JSON values only. */
function checkSize(document: ProfileExportV1, limits: ExportLimits | undefined): void {
  const maxDataNames = limits?.maxDataNames ?? MAX_EXPORT_DATA_NAMES;
  const maxBytes = limits?.maxBytes ?? MAX_EXPORT_BYTES;
  const names = Object.keys(document.data).length;
  if (names > maxDataNames) throw new ExportSizeError(`export holds ${names} data names; the limit is ${maxDataNames}`);
  let text: string;
  try {
    text = JSON.stringify(document);
  } catch (error) {
    if (error instanceof RangeError) throw new ExportSizeError(`export is larger than ${maxBytes} bytes`, { cause: error });
    throw error;
  }
  if (text.length > maxBytes || utf8Length(text) > maxBytes) throw new ExportSizeError(`export is larger than ${maxBytes} bytes`);
}

/**
 * Rejects with `ExportSizeError` instead of producing a document that
 * `importProfile` would refuse for its size.
 */
export async function exportProfile(store: ProfileStore, id: string, options: ExportOptions = {}): Promise<ProfileExportV1> {
  const { profile, data } = await store.readProfile(id);
  const exportedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!isUtcTimestamp(exportedAt)) throw new ExportFormatError("the clock gave a date outside the years 0000 to 9999");
  const document: ProfileExportV1 = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, profile, data };
  checkSize(document, options.limits);
  return document;
}

/**
 * Checks the whole document without touching any store and returns a private,
 * normalised copy. Throws `ExportFormatError` on anything unexpected, and its
 * subclass `ExportSizeError` when the document is over the limits.
 */
export function parseProfileExport(document: unknown, limits?: ExportLimits): ProfileExportV1 {
  if (typeof document !== "object" || document === null || Array.isArray(document)) throw new ExportFormatError("export must be a JSON object");
  // Own data properties only; a getter is refused without being called.
  const field = (name: string): unknown => {
    const property = Object.getOwnPropertyDescriptor(document, name);
    if (property !== undefined && !("value" in property)) throw new ExportFormatError(`${name} is a getter or setter`);
    return property?.value;
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
  const maxDataNames = limits?.maxDataNames ?? MAX_EXPORT_DATA_NAMES;
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
  checkSize(parsed, limits);
  return parsed;
}

/**
 * Validates the whole document first (format, content, size limits), then
 * writes profile and data in one atomic batch. A rejected or failed import
 * leaves the store unchanged. Returns the stored profile; with "copy" on a
 * conflict its id is new.
 */
export async function importProfile(store: ProfileStore, document: unknown, options: ImportOptions = {}): Promise<ProfileV1> {
  const parsed = parseProfileExport(document, options.limits);
  return store.restoreProfile({ profile: parsed.profile, data: parsed.data }, options.onConflict ?? "reject");
}
