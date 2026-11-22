/**
 * ProfileV1: one child's profile record.
 *
 * `id` is random and carries no meaning. `displayName` is the only personal
 * text; a caregiver chooses it (a nickname is fine) and it is stored inside the
 * record only, never in an id or a storage key.
 */

export interface ProfileV1 {
  readonly version: 1;
  readonly id: string;
  readonly displayName: string;
  readonly conceptIds: readonly string[];
}

/** Stored or imported profile data, or caregiver input, is not a valid ProfileV1. */
export class ProfileFormatError extends Error {}

export const PROFILE_VERSION = 1;
export const MAX_DISPLAY_NAME_LENGTH = 40;
export const MAX_CONCEPT_IDS = 500;
const PROFILE_ID_PATTERN = /^[0-9a-f]{32}$/;
const CONCEPT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Control characters plus the line and paragraph separators. */
const CONTROL_CHARACTERS = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/**
 * Format characters are invisible and can reorder or hide text (bidirectional
 * marks, overrides and isolates, zero-width space, byte order mark, soft
 * hyphen, tag characters), so a name could look different from what is stored.
 * They are rejected, with one exception: the zero-width non-joiner and joiner
 * are part of the correct spelling of names in Persian, Sinhala, Bengali and
 * other scripts, and join emoji. Those two are accepted between two visible
 * characters only.
 */
const FORMAT_CHARACTER = /^\p{Cf}$/u;
const WHITESPACE = /^\s$/u;
const ZERO_WIDTH_NON_JOINER = 0x200c;
const ZERO_WIDTH_JOINER = 0x200d;

function hasForbiddenFormatCharacter(text: string): boolean {
  const characters = [...text];
  const isVisible = (character: string | undefined): boolean =>
    character !== undefined && !FORMAT_CHARACTER.test(character) && !WHITESPACE.test(character);
  return characters.some((character, i) => {
    if (!FORMAT_CHARACTER.test(character)) return false;
    const codePoint = character.codePointAt(0);
    if (codePoint !== ZERO_WIDTH_NON_JOINER && codePoint !== ZERO_WIDTH_JOINER) return true;
    return !isVisible(characters[i - 1]) || !isVisible(characters[i + 1]);
  });
}

/** 16 random bytes as 32 lowercase hex characters; no timestamp, nothing derived from the name. */
export function newProfileId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isProfileId(value: unknown): value is string {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value);
}

/**
 * Brings caregiver input into the stored form (Unicode NFC, trimmed) and checks
 * it. The length is counted after that, in characters, not UTF-16 units.
 */
export function normalizeDisplayName(input: unknown): string {
  if (typeof input !== "string") throw new ProfileFormatError("displayName must be a string");
  const normalized = input.normalize("NFC");
  // Checked before trimming: trim() would quietly drop a leading byte order mark.
  if (hasForbiddenFormatCharacter(normalized)) throw new ProfileFormatError("displayName must not contain control or invisible format characters");
  const name = normalized.trim();
  const length = [...name].length;
  if (length < 1 || length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ProfileFormatError(`displayName must have 1 to ${MAX_DISPLAY_NAME_LENGTH} characters`);
  }
  if (CONTROL_CHARACTERS.test(name)) throw new ProfileFormatError("displayName must not contain control or invisible format characters");
  return name;
}

export function normalizeConceptIds(input: unknown): readonly string[] {
  if (!Array.isArray(input)) throw new ProfileFormatError("conceptIds must be an array");
  if (input.length > MAX_CONCEPT_IDS) throw new ProfileFormatError(`conceptIds must have at most ${MAX_CONCEPT_IDS} entries`);
  const ids: string[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const id: unknown = input[i];
    if (typeof id !== "string" || !CONCEPT_ID_PATTERN.test(id)) throw new ProfileFormatError(`conceptIds[${i}] is not a concept id`);
    if (ids.includes(id)) throw new ProfileFormatError(`conceptIds[${i}] is a duplicate`);
    ids.push(id);
  }
  return Object.freeze(ids);
}

export function makeProfile(id: string, displayName: unknown, conceptIds: unknown): ProfileV1 {
  if (!isProfileId(id)) throw new ProfileFormatError("id is not a profile id");
  return Object.freeze({
    version: PROFILE_VERSION,
    id,
    displayName: normalizeDisplayName(displayName),
    conceptIds: normalizeConceptIds(conceptIds),
  });
}

/**
 * Strict reader for stored and imported records. One thing is tolerated: a
 * display name that is valid but not in NFC form (as earlier versions stored
 * it) is returned normalised instead of being rejected.
 *
 * Strict otherwise. Unknown fields and other
 * versions are rejected, so a record written by a later app version is never
 * half-read. The result is a new frozen object.
 */
export function parseProfile(value: unknown): ProfileV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProfileFormatError("profile must be an object");
  const record = value as Record<string, unknown>;
  if (record["version"] !== PROFILE_VERSION) throw new ProfileFormatError("unsupported profile version");
  const expected = ["conceptIds", "displayName", "id", "version"];
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new ProfileFormatError("profile must have exactly the fields version, id, displayName, conceptIds");
  }
  if (!isProfileId(record["id"])) throw new ProfileFormatError("id is not a profile id");
  const profile = makeProfile(record["id"], record["displayName"], record["conceptIds"]);
  if (profile.displayName !== (record["displayName"] as string).normalize("NFC")) throw new ProfileFormatError("displayName has surrounding whitespace");
  return profile;
}
