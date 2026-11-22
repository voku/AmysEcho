/**
 * The caregiver area (cards NG-29 and NG-31): a deliberate way in from the
 * child's screen, and inside it a header that says which board the child
 * sees after closing, the profiles as cards (make active, edit, rename,
 * delete), creating a profile, and a board editor of two lists.
 *
 * This module writes into the caregiver region and into the entry element
 * that holds the opening control. Of the board region it only reads
 * `data-startup` and sets `hidden`; the board itself is re-mounted through
 * `app.refreshBoard()`. The child's display name is rendered inside the
 * caregiver region only, and the region is emptied when the area closes.
 *
 * Nothing here is security. The hold gesture is a hurdle for a small child.
 * See docs/caregiver.md.
 */
import type { App } from "./app.js";
import { BoardDataError, resolveBoard, setBoardConcepts } from "./board-data.js";
import type { BoardEntry, CatalogueConcept, ResolvedBoard } from "./board-data.js";
import { MAX_CONCEPT_IDS, MAX_DISPLAY_NAME_LENGTH, ProfileFormatError } from "./profiles/profile.js";
import type { ProfileV1 } from "./profiles/profile.js";
import { ProfileSizeError, UnknownProfileError } from "./profiles/store.js";
import type { ProfileStore } from "./profiles/store.js";
import { STARTUP_WAIT_MS } from "./startup.js";

/** How long the opening control has to be held. A guess; not tried with a child (card NG-14). */
export const HOLD_DURATION_MS = 3000;
/** How often the countdown is redrawn while holding. */
export const HOLD_TICK_MS = 100;

/**
 * How long closing, and "Tafel neu laden", wait for the board to be refreshed
 * before they stop waiting: the bound of a refresh plus a margin. A refresh
 * waits behind start-up, which may never answer, so they need a bound of
 * their own.
 */
export const CLOSE_WAIT_MS = STARTUP_WAIT_MS + 1000;
/** How long the area waits for `app.store()` before it treats storage as unreachable. */
export const STORE_WAIT_MS = STARTUP_WAIT_MS + 1000;
/** The area closes by itself after this long without a pointer or key event inside it. A guess. */
export const IDLE_CLOSE_MS = 2 * 60 * 1000;

/** A board with more showable tiles than this gets a line that says the tiles become small on a phone. */
export const BOARD_COMFORT_MAX = 12;

/**
 * How long "Entfernen" and "Rückgängig" ignore presses after the list was
 * redrawn by one of them: another row, or the next undo, is then where the
 * finger was, and the second tap of a double tap lands there. A press that
 * is ignored starts the time again. A guess.
 */
export const GUARD_MS = 800;
/**
 * How long "Endgültig löschen" has to be held. Deleting cannot be taken back,
 * so no number of taps may do it: a tap cannot be told from a child's.
 */
export const DELETE_HOLD_MS = 2000;
/**
 * How long content has to be on screen before a press on it counts. A press
 * that began before the content appeared, or sooner than this after it, was
 * aimed at what was there before.
 */
export const SHIELD_GRACE_MS = 300;
/** How far a pointer may stray from a button that is being held before the hold ends. */
export const HOLD_SLOP_PX = 8;
/** A click by key comes with the key-down (Enter) or right after the key-up (Space). */
const KEY_CLICK_WINDOW_MS = 50;
/** A key that sent neither a repeat nor a key-up for this long is not taken as still held. */
const KEY_STALE_MS = 1000;
/** Room between the block at the top and an element that is brought out from under it. */
const REVEAL_GAP_PX = 8;

/** Calls `callback` once after `milliseconds`; the returned function cancels that. */
export type SetTimer = (callback: () => void, milliseconds: number) => () => void;

/** "completed": held for the full duration. "released": let go early. "cancelled": left, interrupted or hidden. */
export type HoldEnd = "completed" | "released" | "cancelled";

export interface HoldOptions {
  readonly setTimer: SetTimer;
  /** Default `HOLD_DURATION_MS`. */
  readonly durationMs?: number;
  /** Default `HOLD_TICK_MS`. */
  readonly tickMs?: number;
  /** Called when a hold starts (0 ms) and after every tick before the end. `remainingSeconds` is rounded up. */
  readonly onProgress: (elapsedMs: number, remainingSeconds: number) => void;
  /** Called once per hold, when it ends. */
  readonly onEnd: (reason: HoldEnd) => void;
}

export interface Hold {
  /** Starts a hold. Ignored while one is running, whatever the source, so a repeated key cannot restart it. */
  press(source: string): void;
  /** Ends the running hold early ("released"), but only when `source` is the one that started it. */
  release(source: string): void;
  /** Ends the running hold without a word ("cancelled"). */
  cancel(): void;
  isHolding(): boolean;
}

/**
 * The timing of press-and-hold, without any DOM. Time is counted in ticks of
 * the injected timer, so a hold is never shorter than `durationMs`.
 */
export function createHold(options: HoldOptions): Hold {
  const durationMs = options.durationMs ?? HOLD_DURATION_MS;
  const tickMs = options.tickMs ?? HOLD_TICK_MS;
  let source: string | null = null;
  let run = 0;
  let elapsed = 0;
  let cancelTimer = (): void => undefined;

  const end = (reason: HoldEnd): void => {
    source = null;
    run += 1;
    cancelTimer();
    cancelTimer = () => undefined;
    options.onEnd(reason);
  };
  const schedule = (): void => {
    const mine = run;
    const step = Math.max(1, Math.min(tickMs, durationMs - elapsed));
    cancelTimer = options.setTimer(() => {
      // A timer whose cancellation came too late belongs to an earlier hold.
      if (mine !== run || source === null) return;
      elapsed += step;
      if (elapsed >= durationMs) {
        end("completed");
        return;
      }
      options.onProgress(elapsed, Math.ceil((durationMs - elapsed) / 1000));
      schedule();
    }, step);
  };

  return {
    press(next) {
      if (source !== null) return;
      source = next;
      run += 1;
      elapsed = 0;
      options.onProgress(0, Math.ceil(durationMs / 1000));
      schedule();
    },
    release(from) {
      if (source !== null && source === from) end("released");
    },
    cancel() {
      if (source !== null) end("cancelled");
    },
    isHolding: () => source !== null,
  };
}

export interface CaregiverOptions {
  readonly app: Pick<App, "store" | "refreshBoard">;
  /** Read for `data-startup`, and hidden while the area is open. Never written into. */
  readonly boardRegion: HTMLElement;
  /** Hidden until the area opens; emptied again when it closes. */
  readonly caregiverRegion: HTMLElement;
  /** Outside both regions; gets the opening control, its progress bar and its one line of text. */
  readonly entry: HTMLElement;
  readonly catalogue: readonly CatalogueConcept[];
  /** Replaces the timer of the hold and of every wait of the area; for tests. */
  readonly setTimer?: SetTimer;
  /**
   * Registers a callback for "the page was hidden", which resets a hold and
   * closes an open area; for tests. Default: the document's `visibilitychange`.
   */
  readonly onPageHidden?: (callback: () => void) => void;
  /** The time in milliseconds, for "when did this press begin" and "when was this put on screen"; for tests. Default: `Date.now`. */
  readonly now?: () => number;
}

export interface CaregiverHandle {
  /** Opens the area. Returns false, and opens nothing, while the board is still starting or a closing still waits for the board. */
  open(): boolean;
  /**
   * Closes the area and refreshes the board, after what the area was still
   * asked to do. The board region stays hidden under a waiting line until
   * that refresh has settled; then it is shown and focus returns to the
   * opening control. If the refresh has not settled after `CLOSE_WAIT_MS`,
   * what happens depends on whether the mounted board may be out of date
   * (a profile's own board with a write that no settled refresh has seen,
   * or a write still running): if it may be, the board region stays hidden
   * and a line, a "Tafel neu laden" button and the opening control are
   * shown instead, until a refresh settles; otherwise the mounted board is
   * shown as it is. A board shown at the bound is replaced when the queued
   * refresh answers later, also if the child has used it meanwhile.
   * Resolves when the board is shown or the bound has passed, whichever
   * comes first; while the area is closed, the promise is that of the last
   * closing. Never rejects.
   */
  close(): Promise<void>;
  isOpen(): boolean;
  /** Resolves when everything the area was asked to do so far has been carried out. Never rejects. */
  settled(): Promise<void>;
}

const OPEN_LABEL = "Für Bezugspersonen";
const HOLD_HINT = `Zum Öffnen bitte ${HOLD_DURATION_MS / 1000} Sekunden gedrückt halten.`;
const STILL_STARTING = "Die Tafel wird noch geladen. Bitte gleich noch einmal versuchen.";
const holdLine = (seconds: number): string => `Weiter halten … ${seconds}`;

const STORAGE_UNREACHABLE = "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb kann hier im Moment nichts geändert werden.";
const READ_FAILED = "Die gespeicherten Profile können gerade nicht gelesen werden. Deshalb kann hier im Moment nichts geändert werden.";
const READING = "Der Speicher wird gelesen.";
const BOARD_LOADING = "Die Tafel wird geladen.";
const NO_BOARD_YET = "Die Tafel konnte noch nicht neu geladen werden. Deshalb wird gerade keine Tafel gezeigt. "
  + "Bitte drücke „Tafel neu laden“ oder gib einer Bezugsperson Bescheid.";
const NAME_SHORT = "Wird nur in diesem Browser auf diesem Gerät gespeichert. Ein Vorname oder Spitzname genügt.";
const NAME_DETAILS = "Was wird gespeichert?";
const NAME_NOTICE = "Dies ist eine Testversion. Ein Vorname oder Spitzname genügt; bitte keinen Nachnamen. "
  + "Der Name und die ausgewählten Begriffe werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Die App sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Ein Profil kann hier umbenannt und gelöscht werden; eine Sicherung gibt es noch nicht. "
  + "Wer die Website-Daten im Browser löscht, entfernt alle Profile in diesem Browser und die Offline-Kopie der App. "
  + "Der Browser kann diese Daten auch von sich aus löschen.";
const NONE_ACTIVE = "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, bis eine Tafel als aktive Tafel verwendet wird.";
const EDITED_NOT_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht eine andere Tafel.";
const EDITED_NONE_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele.";
const EDITED_NOT_ACTIVE_UNKNOWN = "Diese Tafel ist gerade nicht aktiv.";
const ONLY_DAMAGED = "Kein gespeichertes Profil kann in dieser Version gelesen werden. Das Kind sieht Beispiele.";
const ACTIVE_WITHOUT_CONCEPTS = "Auf dieser Tafel ist noch kein Begriff, der gezeigt werden kann. Das Kind sieht Beispiele, bis mindestens ein Begriff hinzugefügt ist.";
const CONCEPT_HELP = "Jede Änderung wird sofort gespeichert. „Hinzufügen“ setzt einen Begriff ans Ende der Tafel. "
  + "Mit „nach oben“ und „nach unten“ änderst du die Reihenfolge.";
const MANY_CONCEPTS = `Mehr als ${BOARD_COMFORT_MAX} Begriffe: Auf einem Handy werden die Felder klein und die Tafel muss gescrollt werden.`;
const ON_BOARD = "Auf der Tafel";
const MORE_CONCEPTS = "Weitere Begriffe";
const BOARD_EMPTY = "Auf dieser Tafel ist noch kein Begriff.";
const NO_MORE_CONCEPTS = "Alle Begriffe aus der Auswahl sind auf der Tafel.";
const MOVE_UP = "nach oben";
const MOVE_DOWN = "nach unten";
const REMOVE = "Entfernen";
const ADD = "Hinzufügen";
const UNDO = "Rückgängig";
const DONE = "Fertig";
const RENAME = "Umbenennen";
const DELETE = "Löschen";
const DELETE_FOR_GOOD = "Endgültig löschen";
const CANCEL = "Abbrechen";
const SAVE = "Speichern";
const DELETE_LOSS = "Alle ausgewählten Begriffe dieses Profils gehen verloren. Eine Sicherung gibt es noch nicht.";
const DELETE_ACTIVE = "Das Kind sieht danach Beispiele, bis eine andere Tafel aktiv ist.";
const AFTER_CLOSE = "Nach dem Schließen:";
const afterDamagedLine = (count: number): string => (count === 1
  ? `${AFTER_CLOSE} Beispiele – ein gespeichertes Profil kann in dieser Version nicht gelesen werden.`
  : `${AFTER_CLOSE} Beispiele – ${count} gespeicherte Profile können in dieser Version nicht gelesen werden.`);
const NAME_TAKEN = "Diesen Namen gibt es schon. Bitte wähle einen anderen";
const PLEASE_WAIT = "Bitte kurz warten.";
const DELETE_HOLD_HINT = `Zum Löschen ${DELETE_HOLD_MS / 1000} Sekunden gedrückt halten.`;
const RELEASE_TO_DELETE = "Loslassen zum Löschen. Zum Abbrechen den Finger wegziehen.";
const DELETING = "Wird gelöscht …";
const AFTER_NONE_ACTIVE = `${AFTER_CLOSE} Beispiele – es ist keine Tafel aktiv.`;
const AFTER_ACTIVE_EMPTY = `${AFTER_CLOSE} Beispiele – die aktive Tafel hat noch keinen Begriff.`;
const AFTER_ACTIVE_UNREADABLE = `${AFTER_CLOSE} Beispiele – die aktive Tafel kann gerade nicht gelesen werden.`;
const AFTER_READ_FAILED = `${AFTER_CLOSE} Beispiele – die Profile können gerade nicht gelesen werden.`;
const AFTER_NO_STORAGE = `${AFTER_CLOSE} Beispiele – der Speicher ist nicht erreichbar.`;
const HELP_SUMMARY = "Hilfe bei Problemen";
const RELOAD_BOARD = "Tafel neu laden";
const RELOAD_HELP = "Zeigt die Tafel des Kindes nicht, was hier eingestellt ist? „Tafel neu laden“ liest sie noch einmal aus dem Speicher dieses Geräts.";
const VOICE_HELP = "Spricht das Gerät nicht? Dann ist es vielleicht stumm geschaltet, oder es fehlt eine deutsche Stimme. "
  + "Sie wird in den Einstellungen des Geräts bei „Sprachausgabe“ oder „Text-in-Sprache“ installiert.";
const RELOAD_NO_STORAGE = "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele.";
const RELOAD_NOT_DRAWN = "Die Tafel kann gerade nicht angezeigt werden. Bitte versuche es noch einmal.";
const NO_PROFILES = "Auf diesem Gerät gibt es noch kein Profil.";
const ACTIVE_MARK = "Aktive Tafel";
const ACTIVATE = "Als aktive Tafel verwenden";
const EDIT_BOARD = "Tafel bearbeiten";
const NOT_EDITABLE = "Dieser Begriff kann in dieser Version nicht bearbeitet werden.";
const RETIRED = "Dieser Begriff ist nicht mehr in der Auswahl.";
const BOARD_UNREADABLE = "Die Begriffe dieses Profils können gerade nicht gelesen werden.";
const SELECT_PROFILE = "Wähle oben bei einem Profil „Tafel bearbeiten“.";
const WRITE_FAILED = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.";
const PROFILE_GONE = "Dieses Profil kann nicht gelesen werden oder ist nicht mehr gespeichert.";
const RELOADING = "Die Tafel wird neu geladen.";
const RELOADED = "Die Tafel wurde neu geladen.";
const RELOAD_FAILED = "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal.";

const BOARD_FULL = `Auf eine Tafel passen höchstens ${MAX_CONCEPT_IDS} Begriffe. Es wurde nichts geändert.`;

const quoted = (text: string): string => `„${text}“`;

type Focusable = HTMLElement & { disabled?: boolean };
/** The one thing that can be open in the profile list: a rename field (with what was typed) or a delete confirmation. */
type Mode = { readonly kind: "rename"; readonly id: string; readonly draft: string } | { readonly kind: "delete"; readonly id: string } | null;
/** A removal that can be taken back: `before` is the id that followed the removed one in the stored list then. */
interface UndoOffer {
  readonly profileId: string;
  readonly id: string;
  readonly label: string;
  readonly before: string | null;
}
/** What one reading of the store gives: the body, and the header's line about the board after closing. */
interface Built {
  readonly content: HTMLElement[];
  readonly afterClose: string;
  /** True when the content is a delete confirmation, which is then all there is to press below the block. */
  readonly confirming?: boolean;
}

function damagedLine(count: number): string {
  const subject = count === 1
    ? "Ein gespeichertes Profil kann in dieser Version nicht gelesen werden. Es bleibt unverändert gespeichert."
    : `${count} gespeicherte Profile können in dieser Version nicht gelesen werden. Sie bleiben unverändert gespeichert.`;
  return `${subject} Eine spätere Version hilft dabei.`;
}

/** A refusal this screen decides itself, already as a German sentence. */
class Refusal extends Error {}

/** What two profile names are compared by: NFC, trimmed, without regard to case. */
function nameKey(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("de");
}

/** True when a readable profile other than `exceptId` already has this name. The store allows it; the area does not, because a board is named by it. */
function nameTaken(profiles: readonly ProfileV1[], name: string, exceptId: string | null): boolean {
  const key = nameKey(name);
  return key !== "" && profiles.some((profile) => profile.id !== exceptId && nameKey(profile.displayName) === key);
}

/** The refusal of a taken name, with a way out that does not ask for a surname: the typed name and the first free number. */
function nameTakenLine(profiles: readonly ProfileV1[], name: string): string {
  const typed = name.normalize("NFC").trim();
  for (let number = 2; number < 100; number += 1) {
    const example = `${typed} ${number}`;
    if ([...example].length > MAX_DISPLAY_NAME_LENGTH) break;
    if (!nameTaken(profiles, example, null)) return `${NAME_TAKEN}, zum Beispiel ${quoted(example)}.`;
  }
  return `${NAME_TAKEN}.`;
}

const isHoldKey = (key: string): boolean => key === "Enter" || key === " " || key === "Spacebar";

/** A button that has to be held. `cancel` ends a hold that is running, or one that is complete and waits for the release. */
interface HeldButton {
  readonly control: HTMLElement;
  cancel(): void;
}

/** What "Entfernen" and "Rückgängig" each have: see `GUARD_MS`. */
interface TapGuard {
  /** True when a press counts. */
  armed(): boolean;
  /** A press was taken: from now on presses are ignored. */
  take(): void;
  /** The list was redrawn for that press. `changed`: the guard time starts now; otherwise presses count again at once. */
  settle(changed: boolean): void;
  /** A press was ignored. While the guard time runs, it starts again. */
  swallow(): void;
  reset(): void;
}

/**
 * One German sentence for a refused or failed profile name. The store only
 * says "not a valid profile" (`ProfileFormatError`), so the reason is read
 * off the input, by the store's own rules: NFC, trimmed, counted in characters.
 */
function nameErrorLine(error: unknown, input: string): string {
  if (!(error instanceof ProfileFormatError)) return WRITE_FAILED;
  const name = input.normalize("NFC").trim();
  if (name === "") return "Bitte gib einen Namen ein.";
  if ([...name].length > MAX_DISPLAY_NAME_LENGTH) return `Der Name ist zu lang. Er darf höchstens ${MAX_DISPLAY_NAME_LENGTH} Zeichen haben.`;
  return "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein.";
}

/** One German sentence for a refused or failed change of a board. */
function boardErrorLine(error: unknown): string {
  if (error instanceof Refusal) return error.message;
  if (error instanceof ProfileSizeError) return "Der Platz für dieses Profil ist voll. Die Änderung wurde nicht gespeichert.";
  if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) return PROFILE_GONE;
  if (error instanceof BoardDataError) {
    if (error.kind === "duplicate-concept") return "Ein Begriff kann nur einmal auf der Tafel sein. Es wurde nichts geändert.";
    if (error.kind === "unknown-concept" || error.kind === "invalid-concept-id") return "Dieser Begriff kann nicht auf die Tafel gesetzt werden. Es wurde nichts geändert.";
    return "Diese Änderung ist nicht möglich. Es wurde nichts geändert.";
  }
  return `${WRITE_FAILED} Die Tafel ist unverändert.`;
}

function element<K extends keyof HTMLElementTagNameMap>(tagName: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const created = document.createElement(tagName);
  if (className !== "") created.className = className;
  if (text !== "") created.textContent = text;
  return created;
}

function button(text: string, className = "caregiver-button"): HTMLButtonElement {
  const created = element("button", className, text);
  created.type = "button";
  return created;
}

function cancelRunningSpeech(): void {
  try {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  } catch {
    // Speech is optional.
  }
}

const defaultTimer: SetTimer = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
};

function defaultPageHidden(callback: () => void): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") callback();
  });
}

/** The ids of a board this screen may uncheck and move: catalogue concepts that the board shows as such. */
function editableIds(board: ResolvedBoard): Set<string> {
  return new Set(board.entries.filter((entry) => entry.source === "catalogue").map((entry) => entry.id));
}

/**
 * Moves `id` one place among the editable ids. Every other id keeps its
 * index, so a concept this version cannot edit stays exactly where it is.
 * Null when there is nowhere to move to.
 */
function moved(ids: readonly string[], editable: ReadonlySet<string>, id: string, delta: -1 | 1): string[] | null {
  const slots = ids.map((other, index) => (editable.has(other) ? index : -1)).filter((index) => index >= 0);
  const from = slots.findIndex((index) => ids[index] === id);
  const target = from + delta;
  if (from < 0 || target < 0 || target >= slots.length) return null;
  const next = [...ids];
  const a = slots[from] as number;
  const b = slots[target] as number;
  next[a] = ids[b] as string;
  next[b] = id;
  return next;
}

/**
 * Puts the opening control into `entry` and returns the handle of the area.
 * Nothing is rendered into the caregiver region before the area is opened.
 */
export function mountCaregiver(options: CaregiverOptions): CaregiverHandle {
  const { app, boardRegion, caregiverRegion, entry, catalogue } = options;
  let isOpen = false;
  // Counts openings and closings. A task that was asked for in an earlier one
  // is still carried out (a tick just before closing is not lost), but it
  // says and draws nothing.
  let session = 0;
  /** The session in which the running task was asked for. */
  let acting = 0;
  /** The last closing; what `close()` returns while the area is closed. */
  let closing: Promise<void> = Promise.resolve();
  /** Counts closings. Only the latest one may show the board; an answer for an earlier one is out of date. */
  let closingNo = 0;
  /**
   * Where the page is after a closing. "waiting": the board is hidden under
   * the waiting line and nothing can be opened. "stalled": the bound has
   * passed; the board is still hidden, and the retry button and the opening
   * control are there. "no": the board is shown, or the area is open.
   */
  let away: "no" | "waiting" | "stalled" = "no";
  const setTimer = options.setTimer ?? defaultTimer;
  let cancelIdle = (): void => undefined;
  const TIMED_OUT = Symbol("timed out");
  /** `promise`, or `TIMED_OUT` when it has not settled after `milliseconds` or rejects. Never rejects. */
  const within = <T>(promise: Promise<T>, milliseconds: number): Promise<T | typeof TIMED_OUT> => new Promise((resolve) => {
    let cancel = (): void => undefined;
    try {
      cancel = setTimer(() => resolve(TIMED_OUT), milliseconds);
    } catch {
      // Without a timer this waits for the promise.
    }
    promise.then((value) => { cancel(); resolve(value); }, () => { cancel(); resolve(TIMED_OUT); });
  });
  // Whether the mounted board may be out of date. `writes` counts store
  // writes that succeeded; `refreshedUpTo` is the count a settled refresh
  // had seen when it was asked for; `intents` counts writing actions that
  // were asked for and have not ended, which may still succeed.
  let writes = 0;
  let refreshedUpTo = 0;
  let intents = 0;
  /** `app.refreshBoard()`, never rejecting. A refresh that settles has mounted every write that had succeeded when it was asked for. */
  const refreshBoard = (): Promise<void> => {
    const seen = writes;
    return Promise.resolve().then(() => app.refreshBoard()).then(() => {
      refreshedUpTo = Math.max(refreshedUpTo, seen);
    }, () => undefined);
  };
  /**
   * True when what the board region holds may be the board of a profile
   * that is no longer the one to show: a profile's own board is mounted,
   * and something was written (or may still be) that no settled refresh has
   * seen. Examples are never out of date in that sense, and without a write
   * nothing can have changed.
   */
  const boardMayBeStale = (): boolean => {
    const startup = boardRegion.dataset["startup"] ?? "";
    const examples = boardRegion.dataset["boardFallback"] !== undefined || startup.startsWith("demo-") || startup === "unrenderable";
    return !examples && (writes > refreshedUpTo || intents > 0);
  };
  let work: Promise<void> = Promise.resolve();
  let store: ProfileStore | null = null;
  let selectedId: string | null = null;
  /**
   * The one rename field or delete confirmation that is open, if any. Set
   * when a button is pressed, not when the queue gets to it, so that Escape
   * right after "Löschen" cancels the confirmation also while an earlier
   * write is still under way.
   */
  let mode: Mode = null;
  /** The held buttons of the body that is on screen. Only these can act; they are cancelled when the body is swapped. */
  let bodyHolds: HeldButton[] = [];
  /** What was typed into the create field, kept while a view without that field is shown. */
  let createDraft = "";
  /** True from a press that retires the message until the redraw for that press: the text keeps its place meanwhile. */
  let statusStale = false;
  // Monotonic where the platform has it: a wall clock that is set back would leave every button dead until it caught up.
  const now = options.now ?? (typeof performance !== "undefined" && typeof performance.now === "function" ? () => performance.now() : () => Date.now());
  /** When what is on screen was last put there or moved: a swap of the body, of the undo button, or a change of the status line. */
  let swappedAt = Number.NEGATIVE_INFINITY;
  const markSwap = (): void => {
    swappedAt = now();
  };
  /** True for a press that began after what it lands on was on screen for the grace time. */
  const aimed = (pressAt: number): boolean => pressAt >= swappedAt + SHIELD_GRACE_MS;
  /** Whether the message in the status line is an error: an error stays when the caregiver scrolls. */
  let statusIsError = false;
  let undoButton: HTMLElement | null = null;
  /** The removals of this visit for the edited profile that can still be taken back, latest last. */
  let undoStack: UndoOffer[] = [];
  let heading: HTMLElement | null = null;
  let topBlock: HTMLElement | null = null;
  let afterClose: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let undoBar: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let help: HTMLDetailsElement | null = null;
  let focusables = new Map<string, Focusable>();

  const opener = button(OPEN_LABEL, "caregiver-open");
  const progress = element("progress", "caregiver-hold-progress");
  progress.max = HOLD_DURATION_MS;
  progress.value = 0;
  progress.hidden = true;
  // The line below says the same in words.
  progress.setAttribute("aria-hidden", "true");
  const hint = element("p", "caregiver-hint");
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-live", "polite");

  const show = (text: string, error: boolean): void => {
    if (status === null) return;
    // A message of another length moves what is below the block.
    if (status.textContent !== text) markSwap();
    status.textContent = text;
    status.className = error ? "caregiver-status caregiver-status-error" : "caregiver-status";
    statusIsError = error;
    statusStale = false;
  };

  /** A message of the running task. `error`: something was refused or failed. */
  const say = (text: string, error = false): void => {
    if (acting === session) show(text, error);
  };

  /**
   * Retires an earlier message when a button is pressed, whatever it said.
   * The text stays where it is until the redraw for that press: taking it
   * away at once would move the content under the finger.
   */
  const clearStatus = (): void => {
    if (isOpen && status !== null && status.textContent !== "") statusStale = true;
  };

  /** Scrolling takes away what was only good to know. An error stays until the next press: it must not vanish unread. */
  const clearOnScroll = (): void => {
    if (!statusIsError && isOpen && status !== null && status.textContent !== "") show("", false);
  };

  /** Ends every hold of the body that may be running or waiting for its release. */
  const dropHold = (): void => {
    for (const held of bodyHolds) held.cancel();
  };

  /**
   * Makes `control` a button that has to be held (`createHold`), with a
   * pointer or with Enter or Space. The finger has to stay on it: the
   * implicit pointer capture of a touch is released so that leaving is
   * reported, and a move or a lift outside the button (beyond
   * `HOLD_SLOP_PX`) ends the hold. With `onReady`, a completed hold only
   * waits; `act` is called when the pointer or key is let go on the button.
   */
  const heldButton = (control: HTMLElement, held: {
    readonly durationMs: number;
    /** Asked when a press begins: false, and no hold starts. */
    allowed(): boolean;
    onProgress(elapsedMs: number, remainingSeconds: number): void;
    /** A hold ended without acting. */
    onIdle(reason: "released" | "cancelled"): void;
    onReady?(): void;
    act(): void;
  }): HeldButton => {
    let source: string | null = null;
    let ready = false;
    const hold = createHold({
      setTimer,
      durationMs: held.durationMs,
      onProgress: held.onProgress,
      onEnd: (reason) => {
        if (reason !== "completed") {
          source = null;
          held.onIdle(reason);
        } else if (held.onReady === undefined) {
          source = null;
          held.act();
        } else {
          ready = true;
          held.onReady();
        }
      },
    });
    const start = (from: string): void => {
      if (ready || hold.isHolding() || !held.allowed()) return;
      source = from;
      hold.press(from);
    };
    const abort = (): void => {
      if (ready) {
        ready = false;
        source = null;
        held.onIdle("cancelled");
        return;
      }
      hold.cancel();
    };
    const finish = (from: string): void => {
      if (!ready) {
        hold.release(from);
        return;
      }
      if (from !== source) return;
      ready = false;
      source = null;
      held.act();
    };
    /** True when the pointer is not on the button any more. Unknown without geometry: then leaving has to be reported by the browser. */
    const outside = (event: PointerEvent): boolean => {
      try {
        if (typeof control.getBoundingClientRect !== "function" || typeof event.clientX !== "number" || typeof event.clientY !== "number") return false;
        const box = control.getBoundingClientRect();
        return event.clientX < box.left - HOLD_SLOP_PX || event.clientX > box.right + HOLD_SLOP_PX
          || event.clientY < box.top - HOLD_SLOP_PX || event.clientY > box.bottom + HOLD_SLOP_PX;
      } catch {
        return false;
      }
    };
    control.addEventListener("pointerdown", (event) => {
      // Only the main button of a mouse; touch and pen report 0 as well.
      if (event.button > 0) return;
      try {
        // A touch is captured by the element it began on: without this, a finger that slides off is not reported as leaving.
        control.releasePointerCapture?.(event.pointerId);
      } catch {
        // Not captured, or no such pointer: nothing to release.
      }
      start("pointer");
    });
    control.addEventListener("pointermove", (event) => {
      if (source === "pointer" && outside(event)) abort();
    });
    control.addEventListener("pointerup", (event) => {
      if (source === "pointer" && outside(event)) abort();
      else finish("pointer");
    });
    control.addEventListener("pointerleave", abort);
    control.addEventListener("pointercancel", abort);
    control.addEventListener("blur", abort);
    // A long press must not bring up the context menu instead of counting.
    control.addEventListener("contextmenu", (event) => event.preventDefault());
    control.addEventListener("keydown", (event) => {
      if (!isHoldKey(event.key)) return;
      event.preventDefault();
      if (event.repeat) return;
      start(`key:${event.key}`);
    });
    control.addEventListener("keyup", (event) => {
      if (isHoldKey(event.key)) finish(`key:${event.key}`);
    });
    return { control, cancel: abort };
  };

  /** What every press of a button starts with: the earlier message goes, and so does an open rename field or confirmation unless the press belongs to it. */
  const begin = (keepMode = false): void => {
    clearStatus();
    if (keepMode) return;
    mode = null;
    dropHold();
  };

  /** `mark` shows on the guarded buttons that are drawn whether a press counts. */
  const tapGuard = (mark: (armed: boolean) => void): TapGuard => {
    let armed = true;
    let waiting = false;
    let turn = 0;
    let cancel = (): void => undefined;
    /** The message that "Bitte kurz warten." took the place of. */
    let replaced: { readonly text: string; readonly error: boolean } | null = null;
    const stop = (): void => {
      turn += 1;
      cancel();
      cancel = () => undefined;
    };
    const wait = (): void => {
      stop();
      const mine = turn;
      waiting = true;
      const arm = (): void => {
        // A timer whose cancellation came too late belongs to an earlier guard.
        if (mine !== turn) return;
        armed = true;
        waiting = false;
        mark(true);
        // The wait is over: the line must not go on asking for it.
        if (isOpen && status !== null && status.textContent === PLEASE_WAIT) show(replaced?.text ?? "", replaced?.error ?? false);
        replaced = null;
      };
      try {
        cancel = setTimer(arm, GUARD_MS);
      } catch {
        arm();
      }
    };
    return {
      armed: () => armed,
      take() {
        stop();
        armed = false;
        waiting = false;
        mark(false);
      },
      settle(changed) {
        if (changed) {
          mark(false);
          wait();
          return;
        }
        stop();
        armed = true;
        waiting = false;
        mark(true);
      },
      swallow() {
        // Steady tapping keeps being ignored; before the redraw there is no time running yet.
        if (waiting) wait();
        // Said where the eyes are, so that the grey buttons are explained.
        if (!isOpen || status === null) return;
        if (status.textContent !== PLEASE_WAIT) replaced = statusStale ? null : { text: status.textContent ?? "", error: statusIsError };
        show(PLEASE_WAIT, false);
      },
      reset() {
        stop();
        armed = true;
        waiting = false;
        replaced = null;
        mark(true);
      },
    };
  };
  const markButton = (control: HTMLElement | null | undefined, armed: boolean): void => control?.setAttribute("aria-disabled", armed ? "false" : "true");
  const removeGuard = tapGuard((armed) => {
    for (const [key, control] of focusables) if (key.startsWith("remove:")) markButton(control, armed);
  });
  const undoGuard = tapGuard((armed) => markButton(undoButton, armed));

  /** Carries tasks out one after another, in the order they were asked for, across closing and reopening. */
  const run = (task: () => Promise<void>): void => {
    const mine = session;
    work = work.then(() => {
      acting = mine;
      return task();
    }).catch(() => {
      // A task that failed outside its own handling: the area keeps what it shows.
      say(WRITE_FAILED, true);
    });
  };

  /** `run` for an action that writes: it counts as "may still write" from the moment it is asked for until it has ended. */
  const runWrite = (task: () => Promise<void>): void => {
    intents += 1;
    run(async () => {
      try {
        await task();
      } finally {
        intents -= 1;
      }
    });
  };

  /**
   * Makes sure `target` is not under the block that stays at the top: the
   * top edge of `anchor` (the card around it, or `target` itself) comes to
   * rest just below the block. With `toTop` it is brought there also from
   * further down, so that what was asked for is the first thing under the
   * block. If `target` then ends below the region, the region scrolls on as
   * far as `target` stays clear of the block. Does nothing where the DOM has
   * no geometry.
   */
  const reveal = (target: HTMLElement, anchor: HTMLElement, toTop: boolean): void => {
    try {
      if (topBlock === null || typeof target.getBoundingClientRect !== "function" || typeof topBlock.getBoundingClientRect !== "function") return;
      const edge = topBlock.getBoundingClientRect().bottom + REVEAL_GAP_PX;
      const at = anchor.getBoundingClientRect().top;
      if (toTop || at < edge) caregiverRegion.scrollTop = Math.max(0, caregiverRegion.scrollTop + at - edge);
      const now = target.getBoundingClientRect();
      const below = now.bottom - caregiverRegion.getBoundingClientRect().bottom;
      if (below > 0) caregiverRegion.scrollTop += Math.max(0, Math.min(below, now.top - edge));
    } catch {
      // Without geometry the browser's own scrolling on focus has to do.
    }
  };

  /** Draws the undo button for the latest removal that can be taken back, or takes the button away. */
  const renderUndo = (): void => {
    if (undoBar === null) return;
    const next = undoStack[undoStack.length - 1];
    if (next === undefined) {
      undoButton = null;
      if (!undoBar.hidden) markSwap();
      undoBar.replaceChildren();
      undoBar.hidden = true;
      return;
    }
    // More than one: said on the button, because the next one appears in the same place.
    const more = undoStack.length - 1;
    const rest = more === 0 ? "" : ` (noch ${more} ${more === 1 ? "weiterer" : "weitere"})`;
    const back = button(`${UNDO}: ${quoted(next.label)}${rest}`);
    back.setAttribute("aria-label", `${UNDO}: ${next.label} wieder auf die Tafel setzen${rest}`);
    markButton(back, undoGuard.armed());
    back.addEventListener("click", () => {
      // The next removal to take back appears under the finger: a second tap must not take that one back too.
      if (!undoGuard.armed()) {
        undoGuard.swallow();
        return;
      }
      undoGuard.take();
      begin();
      // Back to where it was: before the id that followed it then, if that one is still on the board.
      changeBoard(next.profileId, [`remove:${next.id}`], null, `${quoted(next.label)} ist wieder auf der Tafel.`, (ids) => {
        if (ids.includes(next.id)) {
          dropUndo((offer) => offer === next);
          return null;
        }
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        const at = next.before === null ? -1 : ids.indexOf(next.before);
        return at < 0 ? [...ids, next.id] : [...ids.slice(0, at), next.id, ...ids.slice(at)];
      }, (succeeded) => {
        if (succeeded) dropUndo((offer) => offer === next);
        undoGuard.settle(succeeded);
      });
    });
    undoButton = back;
    undoBar.replaceChildren(back);
    undoBar.hidden = false;
    markSwap();
  };

  /** Takes offers off the undo stack. Only for the opening that asked: a task of an earlier opening leaves this one's stack alone. */
  const dropUndo = (gone: (offer: UndoOffer) => boolean): void => {
    if (acting !== session || !undoStack.some(gone)) return;
    undoStack = undoStack.filter((offer) => !gone(offer));
    renderUndo();
  };

  /** Reads the store again and replaces the body. `focus` names the controls to try, in order, for the focus. */
  const draw = async (focus: readonly string[] | null, options: { readonly draftName?: string; readonly toTop?: boolean } = {}): Promise<void> => {
    const mine = acting;
    if (!isOpen || mine !== session) return;
    // A name that is typed but not sent yet survives the redraw after another action.
    const typed = options.draftName ?? (focusables.get("create-name") as HTMLInputElement | undefined)?.value ?? createDraft;
    createDraft = typed;
    const nextFocusables = new Map<string, Focusable>();
    const nextHolds: HeldButton[] = [];
    let built: Built;
    let failed = false;
    if (store === null) {
      failed = true;
      built = { content: [element("p", "caregiver-notice", STORAGE_UNREACHABLE)], afterClose: AFTER_NO_STORAGE };
    } else {
      try {
        built = await build(store, nextFocusables, nextHolds, typed);
      } catch {
        failed = true;
        nextFocusables.clear();
        nextHolds.length = 0;
        built = { content: [element("p", "caregiver-notice", READ_FAILED)], afterClose: AFTER_READ_FAILED };
      }
    }
    if (!isOpen || mine !== session || body === null) return;
    // A hold dies with its button: whatever was held on the content that goes now ends here, not when its successor was built.
    dropHold();
    body.replaceChildren(...built.content);
    bodyHolds = nextHolds;
    markSwap();
    // The message that the press for this redraw retired, if the action put nothing in its place.
    if (statusStale) show("", false);
    if (afterClose !== null) afterClose.textContent = built.afterClose;
    // "Tafel neu laden" is the retry then, so it must not sit behind a closed summary.
    if (failed && help !== null) help.open = true;
    if (help !== null) help.hidden = built.confirming === true;
    focusables = nextFocusables;
    // The rows were built while storage was read; what they show of the guard is set from its state now.
    for (const [key, control] of focusables) if (key.startsWith("remove:")) markButton(control, removeGuard.armed());
    // Removals are taken back on the board they were made on; with another profile in the editor the offers go.
    dropUndo((offer) => offer.profileId !== selectedId);
    if (focus === null) return;
    const target = focus.map((key) => focusables.get(key)).find((candidate) => candidate !== undefined && candidate.disabled !== true);
    (target ?? heading)?.focus();
    if (target === undefined) return;
    const key = focus.find((candidate) => focusables.get(candidate) === target);
    reveal(target, focusables.get(`anchor:${key}`) ?? target, options.toTop === true);
  };

  /**
   * One change of a board: reads the profile's full `conceptIds` from the
   * store, lets `change` build the new list from them, and saves it through
   * `setBoardConcepts`. `change` returns null when there is nothing to do.
   * Focus goes to `focus` after a change that was saved and to `focusElse`
   * otherwise (null: it stays where it is), so that a second press after a
   * failure acts on the same concept. `after` hears whether it was saved,
   * once the area has been drawn again: a guard counts from what is on
   * screen, not from the end of the write.
   */
  const changeBoard = (
    profileId: string, focus: readonly string[], focusElse: readonly string[] | null, done: string,
    change: (ids: readonly string[], editable: ReadonlySet<string>) => string[] | null,
    after: (succeeded: boolean) => void = () => undefined,
  ): void => runWrite(async () => {
    if (store === null) return;
    let succeeded = false;
    try {
      const board = await resolveBoard(store, profileId, catalogue);
      const next = change(board.profile.conceptIds, editableIds(board));
      if (next !== null) {
        await setBoardConcepts(store, profileId, next, catalogue);
        writes += 1;
        succeeded = true;
        say(done);
      }
    } catch (error) {
      say(boardErrorLine(error), true);
    }
    try {
      await draw(succeeded ? focus : focusElse);
    } finally {
      after(succeeded);
    }
  });

  /** `raw` is the name as it was when the form was sent, not what the field holds when the queue gets here. */
  const createProfile = (raw: string): void => {
    begin();
    runWrite(async () => {
      if (store === null) return;
      try {
        const before = await store.list();
        if (nameTaken(before.profiles, raw, null)) throw new Refusal(nameTakenLine(before.profiles, raw));
        const first = before.profiles.length === 0 && before.damaged.length === 0;
        const profile = await store.create(raw, []);
        writes += 1;
        selectedId = profile.id;
        let line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es ist noch nicht die aktive Tafel.`;
        let partly = false;
        if (first) {
          try {
            await store.setActive(profile.id);
            line = `Das Profil ${quoted(profile.displayName)} ist angelegt und jetzt die aktive Tafel. Füge unten Begriffe hinzu.`;
          } catch {
            line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es konnte aber nicht als aktive Tafel gespeichert werden.`;
            partly = true;
          }
        }
        say(line, partly);
        // The first profile: straight on to its board. A further one: its card, where "Als aktive Tafel verwenden" is.
        if (first) await draw(["editor-heading"], { draftName: "", toTop: true });
        else await draw([`activate:${profile.id}`, `edit:${profile.id}`], { draftName: "" });
      } catch (error) {
        say(error instanceof Refusal ? error.message : nameErrorLine(error, raw), true);
        await draw(["create-name"], { draftName: raw });
      }
    });
  };

  const activate = (profile: ProfileV1, label: string): void => {
    begin();
    runWrite(async () => {
      if (store === null) return;
      try {
        await store.setActive(profile.id);
        writes += 1;
        say(`${quoted(label)} ist jetzt die aktive Tafel.`);
      } catch (error) {
        say(error instanceof UnknownProfileError || error instanceof ProfileFormatError ? PROFILE_GONE : WRITE_FAILED, true);
      }
      await draw([`edit:${profile.id}`]);
    });
  };

  /** Puts another profile into the editor and goes there: the editor is below the fold on a phone. */
  const select = (profile: ProfileV1, label: string): void => {
    begin();
    run(async () => {
      selectedId = profile.id;
      say(`Tafel von ${quoted(label)} wird bearbeitet.`);
      await draw(["editor-heading"], { toTop: true });
    });
  };

  /** Opens the rename field or the delete confirmation of one profile; whatever was open before is closed. */
  const openMode = (next: Exclude<Mode, null>, focus: string): void => {
    clearStatus();
    dropHold();
    mode = next;
    // A confirmation is the whole body: it starts right under the block.
    run(() => draw([focus], { toTop: next.kind === "delete" }));
  };

  /** Closes the open rename field or confirmation without a change; focus returns to the button that opened it. */
  const leaveMode = (): void => {
    const was = mode;
    if (was === null) return;
    clearStatus();
    dropHold();
    mode = null;
    run(() => draw([`${was.kind}:${was.id}`]));
  };

  /** `raw` is the name as it was when the form was sent. */
  const renameProfile = (id: string, raw: string): void => {
    clearStatus();
    // The field stays open while the name is saved; it closes, or keeps what was typed, only if it is still this one then.
    // A form that is no longer on screen has no field to close: whatever is open instead stays as it is.
    const mine = mode !== null && mode.kind === "rename" && mode.id === id ? mode : null;
    const settle = (next: Mode): void => {
      if (acting === session && mine !== null && mode === mine) mode = next;
    };
    runWrite(async () => {
      if (store === null) return;
      try {
        const others = (await store.list()).profiles;
        if (nameTaken(others, raw, id)) throw new Refusal(nameTakenLine(others, raw));
        const profile = await store.rename(id, raw);
        writes += 1;
        settle(null);
        say(`Das Profil heißt jetzt ${quoted(profile.displayName)}.`);
        await draw([`rename:${id}`]);
      } catch (error) {
        // `ProfileFormatError` is also what a damaged record gives; only a readable profile has a name to refuse.
        const gone = error instanceof UnknownProfileError
          || (error instanceof ProfileFormatError && await store.get(id).then(() => false, () => true));
        if (gone) {
          settle(null);
          say(PROFILE_GONE, true);
          await draw(["profiles-heading"]);
          return;
        }
        // Refused or not written: the field stays open with what was typed.
        settle({ kind: "rename", id, draft: raw });
        say(error instanceof Refusal ? error.message : nameErrorLine(error, raw), true);
        await draw(["rename-name"]);
      }
    });
  };

  /** Asks for the delete of the profile whose confirmation is open. False when nothing was asked for. */
  const deleteProfile = (profile: ProfileV1, label: string): boolean => {
    // Only while the confirmation for this profile is the one that is open.
    const mine = mode;
    if (mine === null || mine.kind !== "delete" || mine.id !== profile.id) return false;
    begin(true);
    runWrite(async () => {
      if (store === null) return;
      const leave = (): void => {
        if (acting === session && mode === mine) mode = null;
      };
      // The delete may have waited behind a slow write. "Abbrechen" or Escape in that time takes it back, and a
      // second hold on the confirmation that was still drawn finds it closed by the first: one delete, one message.
      if (mode !== mine) return;
      try {
        const wasActive = (await store.getActive()) === profile.id;
        await store.remove(profile.id);
        writes += 1;
        leave();
        if (selectedId === profile.id) selectedId = null;
        // Nothing is made active in its place: which board the child gets is a caregiver's choice.
        say(wasActive ? `Das Profil ${quoted(label)} wurde gelöscht. Gerade ist keine Tafel aktiv.` : `Das Profil ${quoted(label)} wurde gelöscht.`);
        await draw(["profiles-heading"]);
      } catch (error) {
        leave();
        say(error instanceof UnknownProfileError ? PROFILE_GONE : WRITE_FAILED, true);
        await draw([`delete:${profile.id}`, "profiles-heading"]);
      }
    });
    return true;
  };

  /** Picture (if any), label and sentence of one row. */
  const conceptText = (shown: { labelDe: string; speechDe: string; symbolPath: string | null } | null, fallback: string): HTMLElement => {
    const text = element("div", "caregiver-concept-text");
    if (shown === null) {
      text.append(element("span", "caregiver-concept-name", fallback));
      return text;
    }
    if (shown.symbolPath !== null) {
      text.className = "caregiver-concept-text caregiver-concept-pictured";
      const picture = element("img", "");
      picture.src = shown.symbolPath;
      picture.alt = "";
      picture.width = 48;
      picture.height = 48;
      text.append(picture);
    }
    text.append(element("span", "caregiver-concept-name", shown.labelDe), element("span", "caregiver-concept-sentence", shown.speechDe));
    return text;
  };

  /** A catalogue concept on the board: it can be moved among the editable rows and taken off. */
  const boardRow = (
    profileId: string, entry: BoardEntry, place: number, editableOrder: readonly string[], register: Map<string, Focusable>,
  ): HTMLElement => {
    const { id } = entry;
    const row = element("li", "caregiver-concept");
    // The target of the focus after "Hinzufügen" when no other concept is left to add.
    row.tabIndex = -1;
    register.set(`row:${id}`, row);
    const actions = element("div", "caregiver-row-actions");
    const move = (text: string, delta: -1 | 1, enabled: boolean): HTMLButtonElement => {
      const control = button(text, "caregiver-button caregiver-move");
      control.setAttribute("aria-label", `${entry.labelDe} ${text}`);
      control.disabled = !enabled;
      const key = `${delta < 0 ? "up" : "down"}:${id}`;
      control.addEventListener("click", () => {
        begin();
        changeBoard(profileId, [key, `${delta < 0 ? "down" : "up"}:${id}`, `remove:${id}`], [key], "Die Reihenfolge wurde gespeichert.",
          (ids, editable) => moved(ids, editable, id, delta));
      });
      register.set(key, control);
      return control;
    };
    const remove = button(REMOVE);
    remove.setAttribute("aria-label", `${REMOVE}: ${entry.labelDe}`);
    remove.addEventListener("click", () => {
      // After a removal another row is where this one was: a second tap on the same spot must not take that one off too.
      if (!removeGuard.armed()) {
        removeGuard.swallow();
        return;
      }
      removeGuard.take();
      begin();
      const focus = [editableOrder[place + 1], editableOrder[place - 1]].filter((other) => other !== undefined).map((other) => `remove:${other}`);
      let offer: UndoOffer | null = null;
      changeBoard(profileId, [...focus, "more-heading"], [`remove:${id}`], `${quoted(entry.labelDe)} wurde von der Tafel genommen.`, (ids, editable) => {
        // Only what this screen may edit is ever taken off; every other id stays in the list.
        const at = ids.indexOf(id);
        if (at < 0 || !editable.has(id)) return null;
        offer = { profileId, id, label: entry.labelDe, before: ids[at + 1] ?? null };
        return ids.filter((other) => other !== id);
      }, (succeeded) => {
        removeGuard.settle(succeeded);
        if (!succeeded || offer === null || acting !== session) return;
        // A removal can be taken back at once, also when the guard of an earlier undo is still running.
        undoGuard.reset();
        undoStack = [...undoStack, offer];
        renderUndo();
      });
    });
    register.set(`remove:${id}`, remove);
    actions.append(move(MOVE_UP, -1, place > 0), move(MOVE_DOWN, 1, place < editableOrder.length - 1), remove);
    row.append(conceptText(entry, ""), actions);
    return row;
  };

  /** A concept on the board that this version does not edit: shown at its place, with the reason and no buttons. */
  const lockedRow = (id: string, entry: BoardEntry | undefined): HTMLElement => {
    const row = element("li", "caregiver-concept caregiver-concept-locked");
    const note = element("p", "caregiver-concept-note", entry?.source === "retired" ? `${RETIRED} ${NOT_EDITABLE}` : NOT_EDITABLE);
    row.append(conceptText(entry ?? null, `Begriff ${quoted(id)}`), note);
    return row;
  };

  /** A catalogue concept that is not on the board. */
  const moreRow = (profileId: string, concept: CatalogueConcept, place: number, rest: readonly CatalogueConcept[], register: Map<string, Focusable>): HTMLElement => {
    const { id } = concept;
    const row = element("li", "caregiver-concept");
    const add = button(ADD);
    add.setAttribute("aria-label", `${ADD}: ${concept.labelDe}`);
    add.addEventListener("click", () => {
      begin();
      const focus = [rest[place + 1], rest[place - 1]].filter((other) => other !== undefined).map((other) => `add:${other.id}`);
      changeBoard(profileId, [...focus, `row:${id}`], [`add:${id}`], `Gespeichert: ${quoted(concept.labelDe)} ist jetzt auf der Tafel.`, (ids) => {
        if (ids.includes(id)) return null;
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        return [...ids, id];
      }, (succeeded) => {
        // Back on the board by hand: there is nothing left to take back for this concept.
        if (succeeded) dropUndo((offer) => offer.profileId === profileId && offer.id === id);
      });
    });
    register.set(`add:${id}`, add);
    const actions = element("div", "caregiver-row-actions");
    actions.append(add);
    row.append(conceptText(concept, ""), actions);
    return row;
  };

  const boardSection = async (
    current: ProfileStore, profile: ProfileV1, label: string, activeId: string | null, register: Map<string, Focusable>,
  ): Promise<HTMLElement> => {
    // What the child sees while another profile is edited: that profile's board, or examples when it has nothing to show.
    let notActive = EDITED_NONE_ACTIVE;
    if (activeId !== null && activeId !== profile.id) {
      try {
        notActive = (await resolveBoard(current, activeId, catalogue)).entries.length === 0 ? EDITED_NONE_ACTIVE : EDITED_NOT_ACTIVE;
      } catch {
        notActive = EDITED_NOT_ACTIVE_UNKNOWN;
      }
    }
    const section = element("section", "caregiver-section");
    const editorHeading = element("h2", "", `Tafel von ${quoted(label)} bearbeiten`);
    editorHeading.tabIndex = -1;
    register.set("editor-heading", editorHeading);
    section.append(editorHeading);
    // Which board the child sees must not depend on a status line that the next action replaces.
    if (profile.id !== activeId) {
      section.append(element("p", "caregiver-notice caregiver-warning", notActive));
    }
    let board: ResolvedBoard;
    try {
      board = await resolveBoard(current, profile.id, catalogue);
    } catch {
      section.append(element("p", "caregiver-notice", BOARD_UNREADABLE));
      return section;
    }
    if (profile.id === activeId && board.entries.length === 0) section.append(element("p", "caregiver-notice caregiver-warning", ACTIVE_WITHOUT_CONCEPTS));
    section.append(element("p", "caregiver-notice", CONCEPT_HELP));
    if (board.entries.length > BOARD_COMFORT_MAX) section.append(element("p", "caregiver-notice caregiver-warning", MANY_CONCEPTS));

    const ids = board.profile.conceptIds;
    const editable = editableIds(board);
    const editableOrder = ids.filter((id) => editable.has(id));
    section.append(element("h3", "", ON_BOARD));
    if (ids.length === 0) {
      section.append(element("p", "caregiver-notice", BOARD_EMPTY));
    } else {
      const onBoard = element("ol", "caregiver-concepts");
      for (const id of ids) {
        const entry = board.entries.find((candidate) => candidate.id === id);
        onBoard.append(entry !== undefined && editable.has(id)
          ? boardRow(profile.id, entry, editableOrder.indexOf(id), editableOrder, register)
          : lockedRow(id, entry));
      }
      section.append(onBoard);
    }

    const moreHeading = element("h3", "", MORE_CONCEPTS);
    moreHeading.tabIndex = -1;
    register.set("more-heading", moreHeading);
    section.append(moreHeading);
    const rest = catalogue.filter((concept) => !ids.includes(concept.id));
    if (rest.length === 0) {
      section.append(element("p", "caregiver-notice", NO_MORE_CONCEPTS));
    } else {
      const more = element("ul", "caregiver-concepts");
      rest.forEach((concept, place) => more.append(moreRow(profile.id, concept, place, rest, register)));
      section.append(more);
    }
    return section;
  };

  /** A text field for a profile name. Spell checking and correction can send typed text to a service; a name stays here. */
  const nameField = (id: string, value: string): HTMLInputElement => {
    const input = element("input", "caregiver-input");
    input.type = "text";
    input.id = id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.value = value;
    return input;
  };

  /**
   * The delete confirmation. While it is open it is the whole body: no card,
   * no editor and no form is on screen, so nothing else can be hit, and
   * nothing can be drawn under a finger that rests on it.
   */
  const confirmView = (profile: ProfileV1, label: string, isActive: boolean, register: Map<string, Focusable>, holds: HeldButton[]): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-confirm");
    view.append(element("h2", "caregiver-confirm-title", `Profil ${quoted(label)} löschen?`), element("p", "caregiver-confirm-text", DELETE_LOSS));
    if (isActive) view.append(element("p", "caregiver-confirm-text", DELETE_ACTIVE));
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("confirm-cancel", cancel);
    register.set("anchor:confirm-cancel", view);
    // No click handler: like the opening control, it has to be held. A tap, however often, deletes nothing.
    const confirm = button(DELETE_FOR_GOOD, "caregiver-button caregiver-danger caregiver-hold");
    const holdProgress = element("progress", "caregiver-delete-progress");
    holdProgress.max = DELETE_HOLD_MS;
    holdProgress.value = 0;
    holdProgress.hidden = true;
    // The line below says the same in words.
    holdProgress.setAttribute("aria-hidden", "true");
    const holdHint = element("p", "caregiver-confirm-hint", DELETE_HOLD_HINT);
    holdHint.id = "caregiver-delete-hint";
    holdHint.setAttribute("role", "status");
    holdHint.setAttribute("aria-live", "polite");
    confirm.setAttribute("aria-describedby", holdHint.id);
    const idle = (): void => {
      holdProgress.hidden = true;
      holdProgress.value = 0;
      holdHint.textContent = DELETE_HOLD_HINT;
    };
    /** Only the button that is on screen acts: not one that was swapped out while a finger rested on it. */
    const current = (): boolean => bodyHolds.includes(held) && (confirm as { isConnected?: boolean }).isConnected !== false;
    const held: HeldButton = heldButton(confirm, {
      durationMs: DELETE_HOLD_MS,
      // A press on a button that has only just appeared is not a decision to delete.
      allowed: () => current() && aimed(now()),
      onProgress: (elapsedMs, remainingSeconds) => {
        holdProgress.hidden = false;
        holdProgress.value = elapsedMs;
        const line = holdLine(remainingSeconds);
        if (holdHint.textContent !== line) holdHint.textContent = line;
      },
      onIdle: idle,
      // The delete waits for the finger to come up: what the redraw puts there must not be under a finger that is down.
      onReady: () => {
        holdProgress.value = DELETE_HOLD_MS;
        holdHint.textContent = RELEASE_TO_DELETE;
      },
      act: () => {
        idle();
        if (current() && deleteProfile(profile, label)) holdHint.textContent = DELETING;
      },
    });
    holds.push(held);
    // "Abbrechen" first, and nothing below "Endgültig löschen" but its own bar and line.
    const actions = element("div", "caregiver-profile-actions");
    actions.append(cancel, confirm);
    view.append(actions, holdProgress, holdHint);
    return view;
  };

  /** `label` is the name as the area shows it: the stored name, with "(2)" and so on for a second profile of the same name. */
  const profileCard = (profile: ProfileV1, label: string, activeId: string | null, register: Map<string, Focusable>): HTMLElement => {
    const isActive = profile.id === activeId;
    const open = mode !== null && mode.id === profile.id ? mode : null;
    const item = element("li", "caregiver-profile");
    const head = element("div", "caregiver-profile-head");
    if (open?.kind === "rename") {
      const form = element("form", "caregiver-rename");
      const fieldLabel = element("label", "", `Neuer Name für ${quoted(label)}`);
      fieldLabel.htmlFor = "caregiver-rename-name";
      const input = nameField("caregiver-rename-name", open.draft);
      const save = element("button", "caregiver-button caregiver-primary", SAVE);
      save.type = "submit";
      const cancel = button(CANCEL);
      cancel.addEventListener("click", leaveMode);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        // A form that has only just appeared is not sent by an Enter that was meant for something else.
        if (!aimed(now())) return;
        renameProfile(profile.id, input.value);
      });
      register.set("rename-name", input);
      register.set("anchor:rename-name", item);
      const actions = element("div", "caregiver-profile-actions");
      actions.append(save, cancel);
      form.append(fieldLabel, input, actions);
      head.append(form);
      if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
      item.append(head);
      return item;
    }
    head.append(element("span", "caregiver-profile-name", label));
    if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
    const actions = element("div", "caregiver-profile-actions");
    const action = (text: string, key: string, onClick: () => void, className = "caregiver-button"): HTMLButtonElement => {
      const control = button(text, className);
      control.setAttribute("aria-label", `${text}: ${label}`);
      control.addEventListener("click", onClick);
      register.set(`${key}:${profile.id}`, control);
      actions.append(control);
      return control;
    };
    if (!isActive) action(ACTIVATE, "activate", () => activate(profile, label));
    action(EDIT_BOARD, "edit", () => select(profile, label)).setAttribute("aria-pressed", profile.id === selectedId ? "true" : "false");
    action(RENAME, "rename", () => openMode({ kind: "rename", id: profile.id, draft: profile.displayName }, "rename-name"));
    action(DELETE, "delete", () => openMode({ kind: "delete", id: profile.id }, "confirm-cancel"), "caregiver-button caregiver-danger-quiet");
    item.append(head, actions);
    return item;
  };

  /** What the child's screen shows once the area is closed, read off the store the way start-up reads it. */
  const afterCloseLine = async (current: ProfileStore, activeId: string | null, labels: ReadonlyMap<string, string>, damaged: number): Promise<string> => {
    // Without a readable active profile, damaged entries decide (as at start-up); one of them may be the active one.
    if (activeId === null) return damaged > 0 ? afterDamagedLine(damaged) : AFTER_NONE_ACTIVE;
    try {
      const board = await resolveBoard(current, activeId, catalogue);
      return board.entries.length === 0 ? AFTER_ACTIVE_EMPTY : `${AFTER_CLOSE} Tafel von ${quoted(labels.get(activeId) ?? board.profile.displayName)}`;
    } catch {
      return AFTER_ACTIVE_UNREADABLE;
    }
  };

  const build = async (current: ProfileStore, register: Map<string, Focusable>, holds: HeldButton[], draftName: string): Promise<Built> => {
    const listing = await current.list();
    // Null also when the active profile's record is unreadable; the damaged note below covers that.
    const activeId = await current.getActive();
    const profiles = [...listing.profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "de") || a.id.localeCompare(b.id));
    if (!profiles.some((profile) => profile.id === selectedId)) {
      selectedId = profiles.find((profile) => profile.id === activeId)?.id ?? (profiles.length === 1 ? (profiles[0] as ProfileV1).id : null);
    }
    // A rename field or confirmation for a profile that is gone has nothing to show.
    if (mode !== null && !profiles.some((profile) => profile.id === mode?.id)) mode = null;
    // Two profiles of one name (from data stored before the area refused that) are told apart on screen only.
    const labels = new Map<string, string>();
    const met = new Map<string, number>();
    for (const profile of profiles) {
      const count = (met.get(nameKey(profile.displayName)) ?? 0) + 1;
      met.set(nameKey(profile.displayName), count);
      labels.set(profile.id, count === 1 ? profile.displayName : `${profile.displayName} (${count})`);
    }
    const labelOf = (profile: ProfileV1): string => labels.get(profile.id) ?? profile.displayName;
    const header = await afterCloseLine(current, activeId, labels, listing.damaged.length);
    // The confirmation takes over: see `confirmView`.
    const confirming = mode !== null && mode.kind === "delete" ? profiles.find((profile) => profile.id === mode?.id) : undefined;
    if (confirming !== undefined) {
      return { content: [confirmView(confirming, labelOf(confirming), confirming.id === activeId, register, holds)], afterClose: header, confirming: true };
    }

    const profileSection = element("section", "caregiver-section");
    const profilesHeading = element("h2", "", "Profile");
    profilesHeading.tabIndex = -1;
    register.set("profiles-heading", profilesHeading);
    profileSection.append(profilesHeading);
    if (listing.damaged.length > 0) profileSection.append(element("p", "caregiver-notice caregiver-damaged", damagedLine(listing.damaged.length)));
    if (profiles.length === 0) {
      // Damaged entries are not "no profile yet": the device is not new.
      profileSection.append(element("p", "caregiver-notice", listing.damaged.length > 0 ? ONLY_DAMAGED : NO_PROFILES));
    } else {
      const list = element("ul", "caregiver-profiles");
      for (const profile of profiles) list.append(profileCard(profile, labelOf(profile), activeId, register));
      profileSection.append(list);
      if (activeId === null) profileSection.append(element("p", "caregiver-notice caregiver-warning", NONE_ACTIVE));
    }

    const form = element("form", "caregiver-create");
    const nameLabel = element("label", "", "Name für ein neues Profil");
    nameLabel.htmlFor = "caregiver-new-name";
    const nameInput = nameField("caregiver-new-name", draftName);
    const nameShort = element("p", "caregiver-notice caregiver-name-notice", NAME_SHORT);
    nameShort.id = "caregiver-new-name-notice";
    nameInput.setAttribute("aria-describedby", nameShort.id);
    const submit = element("button", "caregiver-button", "Profil anlegen");
    submit.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!aimed(now())) return;
      createProfile(nameInput.value);
    });
    const more = element("details", "caregiver-details");
    more.append(element("summary", "", NAME_DETAILS), element("p", "caregiver-notice", NAME_NOTICE));
    // Folding moves what is below it: what comes under the finger has only just appeared.
    more.addEventListener("toggle", markSwap);
    form.append(nameLabel, nameInput, submit, nameShort, more);
    register.set("create-name", nameInput);
    profileSection.append(form);

    const content = [profileSection];
    const selected = profiles.find((profile) => profile.id === selectedId);
    if (selected !== undefined) content.push(await boardSection(current, selected, labelOf(selected), activeId, register));
    else if (profiles.length > 0) content.push(element("p", "caregiver-notice", SELECT_PROFILE));
    return { content, afterClose: header };
  };

  const close = (): Promise<void> => {
    if (!isOpen) return closing;
    const running = work;
    isOpen = false;
    session += 1;
    cancelIdle();
    // The next opening edits the active profile again, whatever was picked this time.
    selectedId = null;
    mode = null;
    createDraft = "";
    dropHold();
    bodyHolds = [];
    closingNo += 1;
    const mine = closingNo;
    away = "waiting";
    // Names do not stay in the page. Until the board is the refreshed one,
    // nothing of it can be tapped: what the board region holds may be the
    // board of the profile that was active before.
    const line = element("p", "caregiver-notice", BOARD_LOADING);
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    caregiverRegion.replaceChildren(line);
    markSwap();
    heading = null;
    topBlock = null;
    afterClose = null;
    status = null;
    undoBar = null;
    body = null;
    help = null;
    focusables = new Map();
    closing = new Promise((resolve) => {
      let cancelBound = (): void => undefined;
      /** Only while this closing is the latest and the area has not been opened since. */
      const showBoard = (): void => {
        cancelBound();
        if (mine === closingNo && away !== "no") {
          away = "no";
          caregiverRegion.hidden = true;
          caregiverRegion.replaceChildren();
          boardRegion.hidden = false;
          entry.hidden = false;
          opener.focus();
        }
        resolve();
      };
      /** The bound has passed: no board rather than a board that may be out of date. */
      const stall = (): void => {
        if (mine === closingNo && away === "waiting") {
          if (!boardMayBeStale()) {
            // Nothing can have changed what the board shows, or it shows examples: back to it.
            showBoard();
            return;
          }
          away = "stalled";
          line.textContent = NO_BOARD_YET;
          const retry = button(RELOAD_BOARD);
          let attempt = 0;
          retry.addEventListener("click", () => {
            attempt += 1;
            const thisAttempt = attempt;
            line.textContent = BOARD_LOADING;
            // The line changes its height, and with it the place of the button.
            markSwap();
            // Any refresh asked for now reads what is stored now, so its answer may show the board.
            void within(refreshBoard(), CLOSE_WAIT_MS).then((answer) => {
              if (answer !== TIMED_OUT) showBoard();
              else if (mine === closingNo && away === "stalled" && thisAttempt === attempt) {
                line.textContent = NO_BOARD_YET;
                markSwap();
              }
            });
          });
          caregiverRegion.replaceChildren(line, retry);
          markSwap();
          entry.hidden = false;
          retry.focus();
        }
        resolve();
      };
      try {
        cancelBound = setTimer(stall, CLOSE_WAIT_MS);
      } catch {
        // Without a timer closing waits for the refresh.
      }
      // A write that is still under way finishes first, so the board is read after it.
      void running.then(refreshBoard).then(showBoard);
    });
    return closing;
  };

  /** Starts the idle period again; when it passes without another event, the area closes. */
  const restartIdle = (): void => {
    cancelIdle();
    cancelIdle = () => undefined;
    if (!isOpen) return;
    const mine = session;
    try {
      cancelIdle = setTimer(() => {
        if (isOpen && mine === session) void close();
      }, IDLE_CLOSE_MS);
    } catch {
      // Without a timer the area stays open until it is closed by hand.
    }
  };
  caregiverRegion.addEventListener("pointerdown", restartIdle);

  // The press shield: a click counts only if its press began after what it lands on was on screen (`aimed`).
  // The listeners are on the region, in the capture phase, so that they hear every press and decide before any button does.
  const pointerPresses = new Map<number, number>();
  let lastPointerPress: number | null = null;
  let keyPress: { at: number; seenAt: number; upAt: number | null } | null = null;
  caregiverRegion.addEventListener("pointerdown", (event) => {
    const at = now();
    if (pointerPresses.size > 32) pointerPresses.clear();
    if (typeof event.pointerId === "number") pointerPresses.set(event.pointerId, at);
    lastPointerPress = at;
    // A second finger anywhere else is the way to back out of a hold: it ends every hold but one on the button it lands on.
    for (const held of bodyHolds) if (event.target !== held.control) held.cancel();
  }, true);
  caregiverRegion.addEventListener("keydown", (event) => {
    if (!isHoldKey(event.key)) return;
    const at = now();
    if (!event.repeat) keyPress = { at, seenAt: at, upAt: null };
    else if (keyPress !== null) keyPress.seenAt = at;
    // A repeat without a press seen here: the key went down somewhere else, before this content.
    else keyPress = { at: Number.NEGATIVE_INFINITY, seenAt: at, upAt: null };
  }, true);
  caregiverRegion.addEventListener("keyup", (event) => {
    if (isHoldKey(event.key) && keyPress !== null) keyPress.upAt = now();
  }, true);
  caregiverRegion.addEventListener("click", (event) => {
    // The summaries only fold and unfold text: nothing is lost by a press that was not aimed.
    const target = event.target as Partial<Element> | null;
    if (String(target?.tagName ?? "").toLowerCase() === "summary" || (typeof target?.closest === "function" && target.closest("summary") !== null)) return;
    const at = now();
    const id = (event as Partial<PointerEvent>).pointerId;
    const byPointer = typeof id === "number" ? id >= 0 : event.detail > 0;
    // A click without a press of its own (assistive technology, a script) begins when it arrives.
    let pressAt = at;
    if (byPointer) {
      // A pointer whose press this region did not see went down on something that is gone.
      pressAt = (typeof id === "number" ? pointerPresses.get(id) : lastPointerPress) ?? Number.NEGATIVE_INFINITY;
    } else if (keyPress !== null && (keyPress.upAt === null ? at - keyPress.seenAt <= KEY_STALE_MS : at - keyPress.upAt <= KEY_CLICK_WINDOW_MS)) {
      pressAt = keyPress.at;
    }
    if (aimed(pressAt)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  /** Events that Escape was already answered for: one that bubbles from the region reaches the document as well. */
  const answered = new WeakSet<object>();
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !isOpen || answered.has(event)) return;
    answered.add(event);
    event.preventDefault();
    // Escape leaves the innermost thing: an open rename field or confirmation first.
    if (mode !== null) {
      leaveMode();
      return;
    }
    // Then a text field with something typed into it: focus leaves the field, the text stays, the area stays open.
    const target = event.target as Partial<HTMLInputElement> | null | undefined;
    if (String(target?.tagName ?? "").toLowerCase() === "input" && target?.type === "text" && target.value !== "") {
      heading?.focus();
      return;
    }
    void close();
  };
  caregiverRegion.addEventListener("keydown", (event) => {
    restartIdle();
    onEscape(event);
  });
  // Also with the focus on nothing inside the area (after a tap on text, say). While the area is closed this does nothing.
  if (typeof document.addEventListener === "function") document.addEventListener("keydown", onEscape);
  // A message must not keep the block at the top tall while the caregiver reads on. Wheel and touch only: the area scrolls by itself after a focus move.
  caregiverRegion.addEventListener("wheel", clearOnScroll, { passive: true });
  caregiverRegion.addEventListener("touchmove", clearOnScroll, { passive: true });
  caregiverRegion.addEventListener("input", restartIdle);

  const open = (): boolean => {
    if (isOpen) return true;
    if (away === "waiting") return false;
    const startup = boardRegion.dataset["startup"];
    if (startup === undefined || startup === "pending") return false;
    away = "no";
    isOpen = true;
    session += 1;
    cancelRunningSpeech();

    // Stays at the top while the rest scrolls: the title, the board the child gets, the way out, and what was just done.
    const top = element("div", "caregiver-top");
    topBlock = top;
    const header = element("header", "caregiver-header");
    heading = element("h1", "caregiver-heading", OPEN_LABEL);
    heading.tabIndex = -1;
    afterClose = element("p", "caregiver-after-close");
    const closer = button(DONE, "caregiver-button caregiver-primary");
    closer.addEventListener("click", () => void close());
    header.append(heading, afterClose, closer);
    status = element("p", "caregiver-status", READING);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    undoBar = element("div", "caregiver-undo");
    undoBar.hidden = true;
    top.append(header, status, undoBar);
    body = element("div", "caregiver-body");

    help = element("details", "caregiver-details caregiver-help");
    const reload = button(RELOAD_BOARD);
    reload.addEventListener("click", () => {
      begin();
      run(async () => {
        say(RELOADING);
        const answer = await within(refreshBoard(), CLOSE_WAIT_MS);
        // The board answers a failed refresh with the examples; that is not "reloaded".
        const startup = boardRegion.dataset["startup"];
        const fallback = boardRegion.dataset["boardFallback"];
        if (answer === TIMED_OUT || startup === "refresh-timeout") say(RELOAD_FAILED, true);
        else if (startup === "demo-unavailable" || fallback === "storage-unavailable") say(RELOAD_NO_STORAGE, true);
        else if (startup === "failed" || startup === "unrenderable" || fallback === "render-failed") say(RELOAD_NOT_DRAWN, true);
        else say(RELOADED);
        // Also after a read that failed earlier: the area shows what the store holds now.
        await draw(null);
      });
    });
    help.append(element("summary", "", HELP_SUMMARY), element("p", "caregiver-notice", RELOAD_HELP), reload, element("p", "caregiver-notice", VOICE_HELP));
    help.addEventListener("toggle", markSwap);

    boardRegion.hidden = true;
    entry.hidden = true;
    mode = null;
    // What an earlier visit removed is not offered again: the bar is new and the stack starts empty.
    undoStack = [];
    dropHold();
    bodyHolds = [];
    createDraft = "";
    statusIsError = false;
    statusStale = false;
    undoButton = null;
    removeGuard.reset();
    undoGuard.reset();
    caregiverRegion.replaceChildren(top, body, help);
    markSwap();
    caregiverRegion.hidden = false;
    heading.focus();
    restartIdle();
    run(async () => {
      // A store that does not answer must not leave the area on "wird gelesen" for good.
      const answer = await within(app.store(), STORE_WAIT_MS);
      store = answer === TIMED_OUT ? null : answer;
      say("");
      await draw(null);
    });
    return true;
  };

  const showIdle = (line: string): void => {
    progress.hidden = true;
    progress.value = 0;
    hint.textContent = line;
  };
  const openerHold = heldButton(opener, {
    durationMs: HOLD_DURATION_MS,
    allowed: () => true,
    onProgress: (elapsedMs, remainingSeconds) => {
      progress.hidden = false;
      progress.value = elapsedMs;
      const line = holdLine(remainingSeconds);
      if (hint.textContent !== line) hint.textContent = line;
    },
    onIdle: (reason) => showIdle(reason === "released" ? HOLD_HINT : ""),
    act: () => showIdle(open() ? "" : STILL_STARTING),
  });
  // An open area must not be left behind on a device that is put away or handed to the child.
  (options.onPageHidden ?? defaultPageHidden)(() => {
    openerHold.cancel();
    if (isOpen) void close();
  });

  entry.replaceChildren(opener, progress, hint);
  entry.hidden = false;

  return {
    open,
    close,
    isOpen: () => isOpen,
    async settled() {
      // Work may queue more work; wait until the queue stands still.
      let seen: Promise<void> | null = null;
      while (seen !== work) {
        seen = work;
        await seen;
      }
    },
  };
}
