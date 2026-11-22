/**
 * Board data: which concepts one child's board shows, in which order and with
 * which German wording. Pure logic over `ProfileStore`; no DOM.
 *
 * Layout, all inside one profile:
 *
 *   profile.conceptIds             the board: concept ids in display order
 *   data "concept.<conceptId>"     { version: 1, labelDe, speechDe }                 the wording of a catalogue concept on this board
 *                                  { version: 1, labelDe, speechDe, custom: true }   a concept of this profile only
 *
 * The wording of a catalogue concept is copied into the profile when the
 * concept is chosen (`setBoardConcepts`), so a board does not change when a
 * later catalogue changes a sentence or drops a concept. An entry without
 * `custom` under an id the current catalogue does not have is therefore the
 * stored wording of a dropped ("retired") concept, and a valid board member.
 *
 * A custom concept has no symbol yet (symbol images are a later card).
 *
 * Writes are strict: anything that is not valid is rejected and nothing is
 * stored. Reads are tolerant: `resolveBoard` never throws for a bad concept
 * entry; it reports a typed problem instead. An id that cannot be resolved is
 * left off the board and is never shown as some other concept.
 *
 * Every function addresses exactly one profile through `store.get(id)`,
 * `store.setConceptIds(id, ...)` and `store.data(id)`, so nothing written for
 * one profile is visible through another.
 *
 * Atomicity: each function makes at most one store write, except
 * `setBoardConcepts` and `removeCustomConcept` (see there). Checks that read before
 * they write (`setBoardConcepts`, `setWording`, ...) are not one step with
 * that write; a caregiver screen should not run two of these at the same time
 * for the same profile.
 */
import type { ProfileV1 } from "./profiles/profile.js";
import type { ProfileStore } from "./profiles/store.js";

export const BOARD_ENTRY_VERSION = 1;
/** Longest label, counted in code points after NFC and trim. */
export const MAX_LABEL_LENGTH = 40;
/** Longest spoken sentence, counted in code points after NFC and trim. */
export const MAX_SPEECH_LENGTH = 200;
/** Longest concept id this module writes; "concept." plus the id still fits a data name. */
export const MAX_BOARD_CONCEPT_ID_LENGTH = 40;
const DATA_NAME_PREFIX = "concept.";
const BOARD_CONCEPT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Control characters, line and paragraph separators, and unpaired surrogates. */
const CONTROL_CHARACTERS = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;
// The same rule as for display names in profile.ts: invisible format
// characters can reorder or hide text, so they are rejected, except a
// zero-width (non-)joiner between two visible characters.
const FORMAT_CHARACTER = /^\p{Cf}$/u;
const WHITESPACE = /^\s$/u;
const ZERO_WIDTH_NON_JOINER = 0x200c;
const ZERO_WIDTH_JOINER = 0x200d;

/** What the catalogue has to offer per concept; `ConceptV1` fits. */
export interface CatalogueConcept {
  readonly id: string;
  readonly labelDe: string;
  readonly speechDe: string;
  readonly symbolPath: string;
}

export interface Wording {
  readonly labelDe: string;
  readonly speechDe: string;
}

export interface BoardEntry extends Wording {
  readonly id: string;
  /** Null for a concept without a symbol; render it as text only. */
  readonly symbolPath: string | null;
  /**
   * "catalogue": a concept of the current catalogue. "custom": a concept of
   * this profile only. "retired": chosen from an earlier catalogue that had
   * it; shown from the wording stored then, without a symbol.
   */
  readonly source: "catalogue" | "custom" | "retired";
}

/**
 * - "unknown-concept": the id is not in the catalogue and the profile has no
 *   entry for it. Left off the board.
 * - "damaged-custom-concept": the profile's entry for this id (a custom or a
 *   retired concept) cannot be read and the catalogue does not know the id.
 *   Left off the board.
 * - "damaged-wording": the profile's wording for a catalogue concept cannot be
 *   read. The board shows the catalogue wording.
 * - "custom-shadows-catalogue": the profile has a custom concept under an id
 *   the catalogue (now) uses too. The board shows the profile's own concept,
 *   as text, and not the catalogue concept.
 */
export type BoardProblemKind = "unknown-concept" | "damaged-custom-concept" | "damaged-wording" | "custom-shadows-catalogue";

export interface BoardProblem {
  readonly kind: BoardProblemKind;
  readonly conceptId: string;
  /**
   * Only for the two "damaged" kinds. "unsupported-version": a newer app
   * version wrote the entry and it is probably intact. "unreadable": the rest.
   */
  readonly damage?: "unsupported-version" | "unreadable";
}

export interface ResolvedBoard {
  readonly profile: ProfileV1;
  /** In `profile.conceptIds` order, without the ids reported as left off. */
  readonly entries: readonly BoardEntry[];
  readonly problems: readonly BoardProblem[];
}

export interface CustomConcept extends Wording {
  readonly id: string;
}

export interface CustomConceptListing {
  /** Every readable custom concept of the profile, on the board or not, sorted by id. */
  readonly concepts: readonly CustomConcept[];
  /** Concept ids whose stored entry cannot be read (custom concept or wording; the entry does not say which). */
  readonly unreadableIds: readonly string[];
}

export type BoardDataErrorKind =
  | "invalid-concept-id"
  | "invalid-text"
  | "unknown-concept"
  | "duplicate-concept"
  | "catalogue-collision"
  | "custom-concept"
  | "retired-concept"
  | "catalogue-concept";

/** Caregiver input was refused; nothing was written. `kind` says why. */
export class BoardDataError extends Error {
  readonly kind: BoardDataErrorKind;

  constructor(kind: BoardDataErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function isBoardConceptId(value: unknown): value is string {
  return typeof value === "string" && BOARD_CONCEPT_ID_PATTERN.test(value);
}

function requireConceptId(value: unknown): string {
  if (!isBoardConceptId(value)) {
    throw new BoardDataError("invalid-concept-id", `concept ids are 1 to ${MAX_BOARD_CONCEPT_ID_LENGTH} characters of a-z, 0-9 and '-', starting with a letter or digit`);
  }
  return value;
}

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

function normalizeText(input: unknown, field: string, maxLength: number): string {
  if (typeof input !== "string") throw new BoardDataError("invalid-text", `${field} must be a string`);
  const normalized = input.normalize("NFC");
  // Checked before trimming: trim() would quietly drop a leading byte order mark.
  if (hasForbiddenFormatCharacter(normalized)) throw new BoardDataError("invalid-text", `${field} must not contain control or invisible format characters`);
  const text = normalized.trim();
  if (CONTROL_CHARACTERS.test(text)) throw new BoardDataError("invalid-text", `${field} must not contain control or invisible format characters`);
  const length = [...text].length;
  if (length < 1 || length > maxLength) throw new BoardDataError("invalid-text", `${field} must have 1 to ${maxLength} characters`);
  return text;
}

/** Brings caregiver input into the stored form (NFC, trimmed) and checks it. */
export function normalizeWording(input: { readonly labelDe: unknown; readonly speechDe: unknown }): Wording {
  if (typeof input !== "object" || input === null) throw new BoardDataError("invalid-text", "wording must be an object with labelDe and speechDe");
  return {
    labelDe: normalizeText(input.labelDe, "labelDe", MAX_LABEL_LENGTH),
    speechDe: normalizeText(input.speechDe, "speechDe", MAX_SPEECH_LENGTH),
  };
}

type StoredEntry =
  | { readonly state: "missing" }
  | { readonly state: "damaged"; readonly damage: "unsupported-version" | "unreadable" }
  | { readonly state: "ok"; readonly wording: Wording; readonly custom: boolean };

/** Strict reader for one stored entry: exact fields, known version, text already in stored form. */
function readEntry(value: unknown): StoredEntry {
  if (value === undefined) return { state: "missing" };
  const unreadable: StoredEntry = { state: "damaged", damage: "unreadable" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return unreadable;
  const record = value as Record<string, unknown>;
  const version = record["version"];
  if (version !== BOARD_ENTRY_VERSION) {
    return typeof version === "number" && version > BOARD_ENTRY_VERSION ? { state: "damaged", damage: "unsupported-version" } : unreadable;
  }
  const custom = Object.hasOwn(record, "custom");
  if (custom && record["custom"] !== true) return unreadable;
  const expected = custom ? ["custom", "labelDe", "speechDe", "version"] : ["labelDe", "speechDe", "version"];
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) return unreadable;
  // Stored text is in its final form, so it has at most two UTF-16 units per
  // counted character. Anything longer is refused here, before the costly
  // normalisation looks at every character of it.
  const tooLong = (text: unknown, maxLength: number): boolean => typeof text === "string" && text.length > 2 * maxLength;
  if (tooLong(record["labelDe"], MAX_LABEL_LENGTH) || tooLong(record["speechDe"], MAX_SPEECH_LENGTH)) return unreadable;
  try {
    const wording = normalizeWording({ labelDe: record["labelDe"], speechDe: record["speechDe"] });
    if (wording.labelDe !== record["labelDe"] || wording.speechDe !== record["speechDe"]) return unreadable;
    return { state: "ok", wording, custom };
  } catch (error) {
    if (error instanceof BoardDataError) return unreadable;
    throw error;
  }
}

function dataName(conceptId: string): string {
  return `${DATA_NAME_PREFIX}${conceptId}`;
}

function inCatalogue(catalogue: readonly CatalogueConcept[], id: string): CatalogueConcept | null {
  return catalogue.find((concept) => concept.id === id) ?? null;
}

async function readStored(store: ProfileStore, profileId: string, conceptId: string): Promise<StoredEntry> {
  // An id this module could not have written has no entry; do not build a data name from it.
  if (!isBoardConceptId(conceptId)) return { state: "missing" };
  return readEntry(await store.data(profileId).get(dataName(conceptId)));
}

/**
 * The board of one profile: its concepts in `conceptIds` order, with the
 * wording stored in the profile. Rejects only when the profile itself cannot
 * be read (`UnknownProfileError`, `ProfileFormatError`) or storage fails; a
 * bad concept entry becomes a `BoardProblem`.
 *
 * Per id, the profile's stored entry decides before the catalogue does:
 *
 * - a custom entry is shown as stored, without a symbol;
 * - a stored wording is shown as stored; the symbol is the current
 *   catalogue's, and when the catalogue no longer has the id the concept is
 *   still shown, as text ("retired");
 * - without an entry (a board from before wording was copied on choosing) the
 *   current catalogue wording is shown.
 */
export async function resolveBoard(store: ProfileStore, profileId: string, catalogue: readonly CatalogueConcept[]): Promise<ResolvedBoard> {
  const profile = await store.get(profileId);
  const entries: BoardEntry[] = [];
  const problems: BoardProblem[] = [];
  for (const id of profile.conceptIds) {
    const known = inCatalogue(catalogue, id);
    const stored = await readStored(store, profileId, id);
    if (stored.state === "ok" && stored.custom) {
      if (known !== null) problems.push({ kind: "custom-shadows-catalogue", conceptId: id });
      entries.push({ id, ...stored.wording, symbolPath: null, source: "custom" });
    } else if (known !== null) {
      if (stored.state === "damaged") problems.push({ kind: "damaged-wording", conceptId: id, damage: stored.damage });
      const wording: Wording = stored.state === "ok" ? stored.wording : { labelDe: known.labelDe, speechDe: known.speechDe };
      entries.push({ id, ...wording, symbolPath: known.symbolPath, source: "catalogue" });
    } else if (stored.state === "ok") {
      // The wording was copied when the concept was chosen; the catalogue has dropped the id since.
      entries.push({ id, ...stored.wording, symbolPath: null, source: "retired" });
    } else if (stored.state === "damaged") {
      problems.push({ kind: "damaged-custom-concept", conceptId: id, damage: stored.damage });
    } else {
      problems.push({ kind: "unknown-concept", conceptId: id });
    }
  }
  return { profile, entries, problems };
}

/** Every custom concept the profile owns, whether it is on the board or not. */
export async function listCustomConcepts(store: ProfileStore, profileId: string): Promise<CustomConceptListing> {
  const data = store.data(profileId);
  const concepts: CustomConcept[] = [];
  const unreadableIds: string[] = [];
  for (const name of (await data.names()).sort()) {
    if (!name.startsWith(DATA_NAME_PREFIX)) continue;
    const id = name.slice(DATA_NAME_PREFIX.length);
    const stored = isBoardConceptId(id) ? readEntry(await data.get(name)) : ({ state: "damaged", damage: "unreadable" } as const);
    if (stored.state === "damaged") unreadableIds.push(id);
    if (stored.state === "ok" && stored.custom) concepts.push({ id, ...stored.wording });
  }
  return { concepts, unreadableIds };
}

/**
 * Sets which concepts the board shows and in which order, and copies the
 * current catalogue wording into the profile for every chosen catalogue
 * concept that has no stored entry yet. From then on the board shows the
 * stored wording, whatever a later catalogue says.
 *
 * Every id must be a catalogue concept or have a readable entry in this
 * profile (a custom concept, or the stored wording of a concept the catalogue
 * has dropped); duplicates are refused. Everything is checked before the
 * first write.
 *
 * Store writes: one per wording to copy, then one for `conceptIds`, in that
 * order. The store's public API has no write that covers a data entry and the
 * profile record together (short of rewriting the whole profile), so this is
 * not one atomic step. If a write fails, the board is as it was before the
 * call and resolves; wordings copied so far stay stored and are harmless:
 * for a concept that is on the board they equal what the board showed, for
 * one that is not they are not shown. Calling again finishes the job.
 */
export async function setBoardConcepts(store: ProfileStore, profileId: string, ids: readonly string[], catalogue: readonly CatalogueConcept[]): Promise<ProfileV1> {
  if (!Array.isArray(ids)) throw new BoardDataError("invalid-concept-id", "ids must be an array of concept ids");
  const seen = new Set<string>();
  const copies: { readonly id: string; readonly wording: Wording }[] = [];
  for (const id of ids as readonly unknown[]) {
    if (typeof id !== "string") throw new BoardDataError("invalid-concept-id", "a concept id must be a string");
    if (seen.has(id)) throw new BoardDataError("duplicate-concept", `concept "${id}" is listed twice`);
    seen.add(id);
    const known = inCatalogue(catalogue, id);
    if (known === null) requireConceptId(id);
    const stored = await readStored(store, profileId, id);
    if (known === null) {
      if (stored.state !== "ok") throw new BoardDataError("unknown-concept", `"${id}" is not a catalogue concept and this profile has no readable entry for it`);
    } else if (stored.state === "missing" && isBoardConceptId(id)) {
      copies.push({ id, wording: normalizeWording(known) });
    }
  }
  const data = store.data(profileId);
  for (const copy of copies) await data.set(dataName(copy.id), { version: BOARD_ENTRY_VERSION, ...copy.wording });
  return store.setConceptIds(profileId, ids);
}

/**
 * Rewords a concept for this profile. A custom concept stays custom; any
 * other concept gets (or keeps) a stored wording. The id must be a catalogue
 * concept or have a readable entry in this profile; otherwise it is refused
 * with "unknown-concept". One store write.
 */
export async function setWording(
  store: ProfileStore, profileId: string, conceptId: string, wording: { readonly labelDe: unknown; readonly speechDe: unknown },
  catalogue: readonly CatalogueConcept[],
): Promise<Wording> {
  const id = requireConceptId(conceptId);
  const text = normalizeWording(wording);
  const stored = await readStored(store, profileId, id);
  const custom = stored.state === "ok" && stored.custom;
  if (stored.state !== "ok" && inCatalogue(catalogue, id) === null) {
    throw new BoardDataError("unknown-concept", `"${id}" is not a catalogue concept and this profile has no readable entry for it`);
  }
  await store.data(profileId).set(dataName(id), custom ? { version: BOARD_ENTRY_VERSION, ...text, custom: true } : { version: BOARD_ENTRY_VERSION, ...text });
  return text;
}

/**
 * Takes back the profile's own wording for a catalogue concept. One store write.
 *
 * - A catalogue concept that is on the board gets the current catalogue
 *   wording stored again, so the board keeps a stored wording.
 * - A catalogue concept that is not on the board, and an unreadable entry
 *   under any id, is deleted. Clearing what is not there is fine.
 * - A custom concept is refused ("custom-concept"), and so is the readable
 *   stored wording of a concept the catalogue has dropped ("retired-concept"):
 *   that wording is all there is of the concept. Use `removeCustomConcept`.
 */
export async function clearWording(store: ProfileStore, profileId: string, conceptId: string, catalogue: readonly CatalogueConcept[]): Promise<void> {
  const id = requireConceptId(conceptId);
  const stored = await readStored(store, profileId, id);
  if (stored.state === "ok" && stored.custom) throw new BoardDataError("custom-concept", `"${id}" is a custom concept; remove it instead of clearing its wording`);
  const known = inCatalogue(catalogue, id);
  if (known === null && stored.state === "ok") throw new BoardDataError("retired-concept", `"${id}" is no longer in the catalogue; its stored wording cannot be cleared, only removed`);
  const data = store.data(profileId);
  if (known !== null && (await store.get(profileId)).conceptIds.includes(id)) {
    await data.set(dataName(id), { version: BOARD_ENTRY_VERSION, ...normalizeWording(known) });
  } else {
    await data.delete(dataName(id));
  }
}

/**
 * Creates or replaces a custom concept of this profile. The id must not be a
 * catalogue id ("catalogue-collision"). The concept is not put on the board;
 * add its id with `setBoardConcepts`. One store write.
 */
export async function putCustomConcept(
  store: ProfileStore, profileId: string, conceptId: string, wording: { readonly labelDe: unknown; readonly speechDe: unknown },
  catalogue: readonly CatalogueConcept[],
): Promise<CustomConcept> {
  const id = requireConceptId(conceptId);
  if (inCatalogue(catalogue, id) !== null) throw new BoardDataError("catalogue-collision", `"${id}" is a catalogue concept; choose another id`);
  const text = normalizeWording(wording);
  await store.data(profileId).set(dataName(id), { version: BOARD_ENTRY_VERSION, ...text, custom: true });
  return { id, ...text };
}

/**
 * Removes a concept that only this profile has: a custom concept, or the
 * stored wording of a concept the catalogue has dropped. It is taken off the
 * board and out of the profile's data. Also works for an id that is not in
 * the catalogue and whose entry is unreadable or missing, so a board can be
 * cleaned up. A catalogue concept is refused ("catalogue-concept").
 *
 * Two store writes, in this order:
 *
 *   1. take the id out of `conceptIds` (skipped when it is not on the board);
 *   2. delete the data entry.
 *
 * If the second write fails, the board no longer names the concept and
 * resolves without a problem; the entry is still listed by
 * `listCustomConcepts`, and calling this function again finishes the job. The
 * other order could leave an id on the board with nothing behind it.
 */
export async function removeCustomConcept(store: ProfileStore, profileId: string, conceptId: string, catalogue: readonly CatalogueConcept[]): Promise<void> {
  const id = requireConceptId(conceptId);
  const stored = await readStored(store, profileId, id);
  if (inCatalogue(catalogue, id) !== null && !(stored.state === "ok" && stored.custom)) {
    throw new BoardDataError("catalogue-concept", `"${id}" is a catalogue concept, not a custom one`);
  }
  const profile = await store.get(profileId);
  if (profile.conceptIds.includes(id)) await store.setConceptIds(profileId, profile.conceptIds.filter((other) => other !== id));
  await store.data(profileId).delete(dataName(id));
}
