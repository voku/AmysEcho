/**
 * The backup file (card NG-58): one profile export (backup.ts), encrypted with
 * a password the caregiver chooses (owner decision of 2026-11-25), so that a
 * device can be replaced without losing the child's board, taught gestures and
 * demo clips, and a file that is lost or shared by mistake does not show them.
 *
 * Only the browser's own Web Crypto is used, no library:
 *
 * - the key: PBKDF2 with SHA-256 over the password (NFC), a random 16-byte salt
 *   and `BACKUP_ITERATIONS` rounds, giving a 256-bit AES key;
 * - the content: AES-GCM with a random 12-byte IV over the UTF-8 JSON of the
 *   export. GCM's tag means a wrong password or a changed file is refused, never
 *   half read.
 *
 * The file itself is JSON:
 *
 *   { "format": "amys-echo-backup", "version": 1,
 *     "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": n, "salt": base64 },
 *     "cipher": { "name": "AES-GCM", "iv": base64 }, "data": base64 }
 *
 * Nothing about the child is readable without the password: no name, no date of
 * the export (it is inside the encrypted part). A lost password cannot be
 * recovered; the caregiver area says so.
 */
import { ExportFormatError, parseProfileExport } from "./backup.js";
import type { ProfileExportV1 } from "./backup.js";

export const BACKUP_FILE_FORMAT = "amys-echo-backup";
export const BACKUP_FILE_VERSION = 1;
/** PBKDF2 rounds: slow enough to make guessing expensive, about a second on a phone. */
export const BACKUP_ITERATIONS = 600_000;
/** Fewer rounds than this in a file are refused: a file must not weaken the key derivation. */
export const MIN_BACKUP_ITERATIONS = 100_000;
/** More rounds than this are refused too: a crafted file must not keep a phone busy for long (about 3 x the default). */
export const MAX_BACKUP_ITERATIONS = 2_000_000;
/** The shortest password, counted in characters. */
export const MIN_BACKUP_PASSWORD_LENGTH = 8;
/** The file name a backup is saved under; it names neither the child nor the profile. */
export const BACKUP_FILE_EXTENSION = ".amysecho";

/** Why a backup file could not be read: "format" (not a backup file of this app or version), "password" (wrong password, or the file was changed). */
export class BackupFileError extends Error {
  readonly reason: "format" | "password";

  constructor(reason: "format" | "password", message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface BackupFileOptions {
  /** Other rounds than `BACKUP_ITERATIONS`; meant for tests (still at least `MIN_BACKUP_ITERATIONS`). */
  readonly iterations?: number;
  /** The Web Crypto to use; default `globalThis.crypto`. */
  readonly crypto?: Crypto;
}

function cryptoOf(options: BackupFileOptions): Crypto {
  const found = options.crypto ?? (globalThis as { crypto?: Crypto }).crypto;
  if (found === undefined || found.subtle === undefined) throw new Error("this browser has no Web Crypto");
  return found;
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) text += String.fromCharCode(...bytes.subarray(at, at + chunk));
  return btoa(text);
}

function fromBase64(text: unknown, what: string): Uint8Array {
  if (typeof text !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new BackupFileError("format", `${what} is not base64`);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(subtle: SubtleCrypto, password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Whether a password is long enough for a backup (`MIN_BACKUP_PASSWORD_LENGTH` characters). */
export function isBackupPassword(password: unknown): password is string {
  return typeof password === "string" && [...password.normalize("NFC")].length >= MIN_BACKUP_PASSWORD_LENGTH;
}

/** Encrypts one profile export into the text of a backup file. */
export async function encryptBackup(document: ProfileExportV1, password: string, options: BackupFileOptions = {}): Promise<string> {
  if (!isBackupPassword(password)) throw new RangeError(`a backup password has at least ${MIN_BACKUP_PASSWORD_LENGTH} characters`);
  const iterations = options.iterations ?? BACKUP_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < MIN_BACKUP_ITERATIONS || iterations > MAX_BACKUP_ITERATIONS) throw new RangeError("iterations out of range");
  const crypto = cryptoOf(options);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(crypto.subtle, password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(document));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain));
  return JSON.stringify({
    format: BACKUP_FILE_FORMAT,
    version: BACKUP_FILE_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    data: toBase64(sealed),
  });
}

function field(record: Record<string, unknown>, name: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, name) ? record[name] : undefined;
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BackupFileError("format", `${what} is not an object`);
  return value as Record<string, unknown>;
}

/**
 * Reads the text of a backup file with its password and returns the checked
 * profile export (`parseProfileExport`). Throws `BackupFileError("format")` for
 * anything that is not a version-1 backup file of this app (and for an export
 * inside that is not readable), `BackupFileError("password")` when the password
 * is wrong or the file was changed.
 */
export async function decryptBackup(text: string, password: string, options: BackupFileOptions = {}): Promise<ProfileExportV1> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFileError("format", "not JSON");
  }
  const file = object(parsed, "the file");
  if (field(file, "format") !== BACKUP_FILE_FORMAT) throw new BackupFileError("format", "not a backup file of this app");
  if (field(file, "version") !== BACKUP_FILE_VERSION) throw new BackupFileError("format", "unsupported backup version");
  const kdf = object(field(file, "kdf"), "kdf");
  const cipher = object(field(file, "cipher"), "cipher");
  if (field(kdf, "name") !== "PBKDF2" || field(kdf, "hash") !== "SHA-256" || field(cipher, "name") !== "AES-GCM") throw new BackupFileError("format", "unknown algorithm");
  const iterations = field(kdf, "iterations");
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < MIN_BACKUP_ITERATIONS || iterations > MAX_BACKUP_ITERATIONS) {
    throw new BackupFileError("format", "iterations out of range");
  }
  const salt = fromBase64(field(kdf, "salt"), "salt");
  const iv = fromBase64(field(cipher, "iv"), "iv");
  const sealed = fromBase64(field(file, "data"), "data");
  if (salt.length !== 16 || iv.length !== 12 || sealed.length < 16) throw new BackupFileError("format", "wrong sizes");
  const crypto = cryptoOf(options);
  const key = await deriveKey(crypto.subtle, password, salt, iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, sealed as BufferSource);
  } catch {
    throw new BackupFileError("password", "wrong password or changed file");
  }
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw new BackupFileError("format", "the content is not JSON");
  }
  try {
    return parseProfileExport(document);
  } catch (error) {
    if (error instanceof ExportFormatError) throw new BackupFileError("format", `the profile inside is not readable: ${error.message}`);
    throw error;
  }
}

/** The file name of a backup made at `date`: the local day only, never the child's name. */
export function backupFileName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = Number.isNaN(date.getTime()) ? "" : `-${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `amys-echo-sicherung${day}${BACKUP_FILE_EXTENSION}`;
}
