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
const AFTER_NONE_ACTIVE = `${AFTER_CLOSE} Beispiele – es ist keine Tafel aktiv.`;
const AFTER_ACTIVE_EMPTY = `${AFTER_CLOSE} Beispiele – die aktive Tafel hat noch keinen Begriff.`;
const AFTER_ACTIVE_UNREADABLE = `${AFTER_CLOSE} Beispiele – die aktive Tafel kann gerade nicht gelesen werden.`;
const AFTER_READ_FAILED = `${AFTER_CLOSE} Beispiele – die Profile können gerade nicht gelesen werden.`;
const AFTER_NO_STORAGE = `${AFTER_CLOSE} Beispiele – der Speicher ist nicht erreichbar.`;
const HELP_SUMMARY = "Hilfe bei Problemen";
const RELOAD_BOARD = "Tafel neu laden";
const RELOAD_HELP = "Zeigt die Tafel des Kindes nicht, was hier eingestellt ist? „Tafel neu laden“ liest sie noch einmal aus dem Speicher dieses Geräts.";
const VOICE_HELP = "Spricht das Gerät nicht? Dann fehlt eine deutsche Stimme. "
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
}

function damagedLine(count: number): string {
  const subject = count === 1
    ? "Ein gespeichertes Profil kann in dieser Version nicht gelesen werden. Es bleibt unverändert gespeichert."
    : `${count} gespeicherte Profile können in dieser Version nicht gelesen werden. Sie bleiben unverändert gespeichert.`;
  return `${subject} Eine spätere Version hilft dabei.`;
}

/** A refusal this screen decides itself, already as a German sentence. */
class Refusal extends Error {}

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
  /** The one rename field or delete confirmation that is open, if any. Changed only by queued tasks. */
  let mode: Mode = null;
  let heading: HTMLElement | null = null;
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

  const say = (text: string): void => {
    if (status !== null && acting === session) status.textContent = text;
  };

  /** Carries tasks out one after another, in the order they were asked for, across closing and reopening. */
  const run = (task: () => Promise<void>): void => {
    const mine = session;
    work = work.then(() => {
      acting = mine;
      return task();
    }).catch(() => {
      // A task that failed outside its own handling: the area keeps what it shows.
      say(WRITE_FAILED);
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

  /** Closes an open rename field or confirmation; every action other than opening one starts with this. */
  const cancelMode = (): void => {
    if (acting === session) mode = null;
  };

  /** Reads the store again and replaces the body. `focus` names the controls to try, in order, for the focus. */
  const draw = async (focus: readonly string[] | null, draftName?: string): Promise<void> => {
    const mine = acting;
    if (!isOpen || mine !== session) return;
    // A name that is typed but not sent yet survives the redraw after another action.
    const typed = draftName ?? (focusables.get("create-name") as HTMLInputElement | undefined)?.value ?? "";
    const nextFocusables = new Map<string, Focusable>();
    let built: Built;
    let failed = false;
    if (store === null) {
      failed = true;
      built = { content: [element("p", "caregiver-notice", STORAGE_UNREACHABLE)], afterClose: AFTER_NO_STORAGE };
    } else {
      try {
        built = await build(store, nextFocusables, typed);
      } catch {
        failed = true;
        nextFocusables.clear();
        built = { content: [element("p", "caregiver-notice", READ_FAILED)], afterClose: AFTER_READ_FAILED };
      }
    }
    if (!isOpen || mine !== session || body === null) return;
    body.replaceChildren(...built.content);
    if (afterClose !== null) afterClose.textContent = built.afterClose;
    // "Tafel neu laden" is the retry then, so it must not sit behind a closed summary.
    if (failed && help !== null) help.open = true;
    focusables = nextFocusables;
    if (focus === null) return;
    const target = focus.map((key) => focusables.get(key)).find((candidate) => candidate !== undefined && candidate.disabled !== true);
    (target ?? heading)?.focus();
  };

  /**
   * One change of a board: reads the profile's full `conceptIds` from the
   * store, lets `change` build the new list from them, and saves it through
   * `setBoardConcepts`. `change` returns null when there is nothing to do.
   * A change that succeeds ends an earlier undo offer; `offer` in its result
   * is the new one.
   */
  const changeBoard = (
    profileId: string, focus: readonly string[], done: string,
    change: (ids: readonly string[], editable: ReadonlySet<string>) => { ids: string[]; offer?: UndoOffer } | null,
  ): void => runWrite(async () => {
    if (store === null) return;
    cancelMode();
    try {
      const board = await resolveBoard(store, profileId, catalogue);
      const next = change(board.profile.conceptIds, editableIds(board));
      if (next !== null) {
        await setBoardConcepts(store, profileId, next.ids, catalogue);
        writes += 1;
        offerUndo(next.offer ?? null);
        say(done);
      }
    } catch (error) {
      say(boardErrorLine(error));
    }
    await draw(focus);
  });

  /**
   * Shows the undo button for the last removal next to the status line, or
   * takes it away. Only for the opening that asked; the bar itself goes with
   * the area when it closes.
   */
  function offerUndo(next: UndoOffer | null): void {
    if (acting !== session || undoBar === null) return;
    if (next === null) {
      undoBar.replaceChildren();
      undoBar.hidden = true;
      return;
    }
    const back = button(UNDO);
    back.setAttribute("aria-label", `${UNDO}: ${next.label} wieder auf die Tafel setzen`);
    back.addEventListener("click", () => {
      // Back to where it was: before the id that followed it then, if that one is still on the board.
      changeBoard(next.profileId, [`remove:${next.id}`], `${quoted(next.label)} ist wieder auf der Tafel.`, (ids) => {
        if (ids.includes(next.id)) {
          offerUndo(null);
          return null;
        }
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        const at = next.before === null ? -1 : ids.indexOf(next.before);
        return { ids: at < 0 ? [...ids, next.id] : [...ids.slice(0, at), next.id, ...ids.slice(at)] };
      });
    });
    undoBar.replaceChildren(back);
    undoBar.hidden = false;
  }

  /** `raw` is the name as it was when the form was sent, not what the field holds when the queue gets here. */
  const createProfile = (raw: string): void => runWrite(async () => {
    if (store === null) return;
    cancelMode();
    try {
      const before = await store.list();
      const first = before.profiles.length === 0 && before.damaged.length === 0;
      const profile = await store.create(raw, []);
      writes += 1;
      offerUndo(null);
      selectedId = profile.id;
      let line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es ist noch nicht die aktive Tafel.`;
      if (first) {
        try {
          await store.setActive(profile.id);
          line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es ist das erste Profil auf diesem Gerät und deshalb jetzt die aktive Tafel.`;
        } catch {
          line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es konnte aber nicht als aktive Tafel gespeichert werden.`;
        }
      }
      say(line);
      await draw(["create-name"], "");
    } catch (error) {
      say(nameErrorLine(error, raw));
      await draw(["create-name"], raw);
    }
  });

  const activate = (profile: ProfileV1): void => runWrite(async () => {
    if (store === null) return;
    cancelMode();
    try {
      await store.setActive(profile.id);
      writes += 1;
      offerUndo(null);
      say(`${quoted(profile.displayName)} ist jetzt die aktive Tafel.`);
    } catch (error) {
      say(error instanceof UnknownProfileError || error instanceof ProfileFormatError ? PROFILE_GONE : WRITE_FAILED);
    }
    await draw([`edit:${profile.id}`]);
  });

  const select = (profile: ProfileV1): void => run(async () => {
    cancelMode();
    selectedId = profile.id;
    offerUndo(null);
    say("");
    await draw([`edit:${profile.id}`]);
  });

  /** Opens the rename field or the delete confirmation of one profile; whatever was open before is closed. */
  const openMode = (next: Exclude<Mode, null>, focus: string): void => run(async () => {
    if (acting !== session) return;
    mode = next;
    await draw([focus]);
  });

  /** Closes the open rename field or confirmation without a change; focus returns to the button that opened it. */
  const leaveMode = (): void => run(async () => {
    const was = mode;
    if (was === null || acting !== session) return;
    mode = null;
    await draw([`${was.kind}:${was.id}`]);
  });

  /** `raw` is the name as it was when the form was sent. */
  const renameProfile = (id: string, raw: string): void => runWrite(async () => {
    if (store === null) return;
    try {
      const profile = await store.rename(id, raw);
      writes += 1;
      cancelMode();
      offerUndo(null);
      say(`Das Profil heißt jetzt ${quoted(profile.displayName)}.`);
      await draw([`rename:${id}`]);
    } catch (error) {
      // `ProfileFormatError` is also what a damaged record gives; only a readable profile has a name to refuse.
      const gone = error instanceof UnknownProfileError
        || (error instanceof ProfileFormatError && await store.get(id).then(() => false, () => true));
      if (gone) {
        cancelMode();
        say(PROFILE_GONE);
        await draw(["profiles-heading"]);
        return;
      }
      // Refused or not written: the field stays open with what was typed, and the stored name stays on screen nowhere else.
      if (acting === session) mode = { kind: "rename", id, draft: raw };
      say(nameErrorLine(error, raw));
      await draw(["rename-name"]);
    }
  });

  const deleteProfile = (profile: ProfileV1): void => runWrite(async () => {
    if (store === null) return;
    cancelMode();
    try {
      const wasActive = (await store.getActive()) === profile.id;
      await store.remove(profile.id);
      writes += 1;
      offerUndo(null);
      if (selectedId === profile.id) selectedId = null;
      // Nothing is made active in its place: which board the child gets is a caregiver's choice.
      say(wasActive
        ? `Das Profil ${quoted(profile.displayName)} wurde gelöscht. Gerade ist keine Tafel aktiv.`
        : `Das Profil ${quoted(profile.displayName)} wurde gelöscht.`);
      await draw(["profiles-heading"]);
    } catch (error) {
      say(error instanceof UnknownProfileError ? PROFILE_GONE : WRITE_FAILED);
      await draw([`delete:${profile.id}`, "profiles-heading"]);
    }
  });

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
        changeBoard(profileId, [key, `${delta < 0 ? "down" : "up"}:${id}`, `remove:${id}`], "Die Reihenfolge wurde gespeichert.", (ids, editable) => {
          const next = moved(ids, editable, id, delta);
          return next === null ? null : { ids: next };
        });
      });
      register.set(key, control);
      return control;
    };
    const remove = button(REMOVE);
    remove.setAttribute("aria-label", `${REMOVE}: ${entry.labelDe}`);
    remove.addEventListener("click", () => {
      const focus = [editableOrder[place + 1], editableOrder[place - 1]].filter((other) => other !== undefined).map((other) => `remove:${other}`);
      changeBoard(profileId, [...focus, "more-heading"], `${quoted(entry.labelDe)} wurde von der Tafel genommen.`, (ids, editable) => {
        // Only what this screen may edit is ever taken off; every other id stays in the list.
        const at = ids.indexOf(id);
        if (at < 0 || !editable.has(id)) return null;
        return { ids: ids.filter((other) => other !== id), offer: { profileId, id, label: entry.labelDe, before: ids[at + 1] ?? null } };
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
      const focus = [rest[place + 1], rest[place - 1]].filter((other) => other !== undefined).map((other) => `add:${other.id}`);
      changeBoard(profileId, [...focus, `row:${id}`], `Gespeichert: ${quoted(concept.labelDe)} ist jetzt auf der Tafel.`, (ids) => {
        if (ids.includes(id)) return null;
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        return { ids: [...ids, id] };
      });
    });
    register.set(`add:${id}`, add);
    const actions = element("div", "caregiver-row-actions");
    actions.append(add);
    row.append(conceptText(concept, ""), actions);
    return row;
  };

  const boardSection = async (
    current: ProfileStore, profile: ProfileV1, activeId: string | null, register: Map<string, Focusable>,
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
    section.append(element("h2", "", `Tafel von ${quoted(profile.displayName)} bearbeiten`));
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

  const profileCard = (profile: ProfileV1, activeId: string | null, register: Map<string, Focusable>): HTMLElement => {
    const isActive = profile.id === activeId;
    const open = mode !== null && mode.id === profile.id ? mode : null;
    if (open?.kind === "delete") {
      const item = element("li", "caregiver-profile caregiver-confirm");
      item.append(element("p", "caregiver-confirm-title", `Profil ${quoted(profile.displayName)} löschen?`), element("p", "caregiver-confirm-text", DELETE_LOSS));
      if (isActive) item.append(element("p", "caregiver-confirm-text", DELETE_ACTIVE));
      const confirm = button(DELETE_FOR_GOOD, "caregiver-button caregiver-danger");
      confirm.addEventListener("click", () => deleteProfile(profile));
      const cancel = button(CANCEL);
      cancel.addEventListener("click", leaveMode);
      register.set("confirm-cancel", cancel);
      const actions = element("div", "caregiver-profile-actions");
      actions.append(confirm, cancel);
      item.append(actions);
      return item;
    }
    const item = element("li", "caregiver-profile");
    const head = element("div", "caregiver-profile-head");
    if (open?.kind === "rename") {
      const form = element("form", "caregiver-rename");
      const label = element("label", "", `Neuer Name für ${quoted(profile.displayName)}`);
      label.htmlFor = "caregiver-rename-name";
      const input = nameField("caregiver-rename-name", open.draft);
      const save = element("button", "caregiver-button caregiver-primary", SAVE);
      save.type = "submit";
      const cancel = button(CANCEL);
      cancel.addEventListener("click", leaveMode);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        renameProfile(profile.id, input.value);
      });
      register.set("rename-name", input);
      const actions = element("div", "caregiver-profile-actions");
      actions.append(save, cancel);
      form.append(label, input, actions);
      head.append(form);
      if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
      item.append(head);
      return item;
    }
    head.append(element("span", "caregiver-profile-name", profile.displayName));
    if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
    const actions = element("div", "caregiver-profile-actions");
    const action = (text: string, key: string, onClick: () => void, className = "caregiver-button"): HTMLButtonElement => {
      const control = button(text, className);
      control.setAttribute("aria-label", `${text}: ${profile.displayName}`);
      control.addEventListener("click", onClick);
      register.set(`${key}:${profile.id}`, control);
      actions.append(control);
      return control;
    };
    if (!isActive) action(ACTIVATE, "activate", () => activate(profile));
    action(EDIT_BOARD, "edit", () => select(profile)).setAttribute("aria-pressed", profile.id === selectedId ? "true" : "false");
    action(RENAME, "rename", () => openMode({ kind: "rename", id: profile.id, draft: profile.displayName }, "rename-name"));
    action(DELETE, "delete", () => openMode({ kind: "delete", id: profile.id }, "confirm-cancel"), "caregiver-button caregiver-danger-quiet");
    item.append(head, actions);
    return item;
  };

  /** What the child's screen shows once the area is closed, read off the store the way start-up reads it. */
  const afterCloseLine = async (current: ProfileStore, activeId: string | null): Promise<string> => {
    if (activeId === null) return AFTER_NONE_ACTIVE;
    try {
      const board = await resolveBoard(current, activeId, catalogue);
      return board.entries.length === 0 ? AFTER_ACTIVE_EMPTY : `${AFTER_CLOSE} Tafel von ${quoted(board.profile.displayName)}`;
    } catch {
      return AFTER_ACTIVE_UNREADABLE;
    }
  };

  const build = async (current: ProfileStore, register: Map<string, Focusable>, draftName: string): Promise<Built> => {
    const listing = await current.list();
    // Null also when the active profile's record is unreadable; the damaged note below covers that.
    const activeId = await current.getActive();
    const profiles = [...listing.profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "de") || a.id.localeCompare(b.id));
    if (!profiles.some((profile) => profile.id === selectedId)) {
      selectedId = profiles.find((profile) => profile.id === activeId)?.id ?? (profiles.length === 1 ? (profiles[0] as ProfileV1).id : null);
    }
    // A rename field or confirmation for a profile that is gone has nothing to show.
    if (mode !== null && !profiles.some((profile) => profile.id === mode?.id)) mode = null;

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
      for (const profile of profiles) list.append(profileCard(profile, activeId, register));
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
      createProfile(nameInput.value);
    });
    const more = element("details", "caregiver-details");
    more.append(element("summary", "", NAME_DETAILS), element("p", "caregiver-notice", NAME_NOTICE));
    form.append(nameLabel, nameInput, submit, nameShort, more);
    register.set("create-name", nameInput);
    profileSection.append(form);

    const content = [profileSection];
    const selected = profiles.find((profile) => profile.id === selectedId);
    if (selected !== undefined) content.push(await boardSection(current, selected, activeId, register));
    else if (profiles.length > 0) content.push(element("p", "caregiver-notice", SELECT_PROFILE));
    return { content, afterClose: await afterCloseLine(current, activeId) };
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
    heading = null;
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
            // Any refresh asked for now reads what is stored now, so its answer may show the board.
            void within(refreshBoard(), CLOSE_WAIT_MS).then((answer) => {
              if (answer !== TIMED_OUT) showBoard();
              else if (mine === closingNo && away === "stalled" && thisAttempt === attempt) line.textContent = NO_BOARD_YET;
            });
          });
          caregiverRegion.replaceChildren(line, retry);
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
  caregiverRegion.addEventListener("keydown", (event) => {
    restartIdle();
    if (event.key !== "Escape" || !isOpen) return;
    event.preventDefault();
    // Escape leaves the innermost thing: an open rename field or confirmation first, the area otherwise.
    if (mode !== null) leaveMode();
    else void close();
  });
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
    reload.addEventListener("click", () => run(async () => {
      cancelMode();
      say(RELOADING);
      const answer = await within(refreshBoard(), CLOSE_WAIT_MS);
      // The board answers a failed refresh with the examples; that is not "reloaded".
      const startup = boardRegion.dataset["startup"];
      const fallback = boardRegion.dataset["boardFallback"];
      if (answer === TIMED_OUT || startup === "refresh-timeout") say(RELOAD_FAILED);
      else if (startup === "demo-unavailable" || fallback === "storage-unavailable") say(RELOAD_NO_STORAGE);
      else if (startup === "failed" || startup === "unrenderable" || fallback === "render-failed") say(RELOAD_NOT_DRAWN);
      else say(RELOADED);
      // Also after a read that failed earlier: the area shows what the store holds now.
      await draw(null);
    }));
    help.append(element("summary", "", HELP_SUMMARY), element("p", "caregiver-notice", RELOAD_HELP), reload, element("p", "caregiver-notice", VOICE_HELP));

    boardRegion.hidden = true;
    entry.hidden = true;
    mode = null;
    caregiverRegion.replaceChildren(top, body, help);
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
  const hold = createHold({
    setTimer,
    onProgress: (elapsedMs, remainingSeconds) => {
      progress.hidden = false;
      progress.value = elapsedMs;
      const line = holdLine(remainingSeconds);
      if (hint.textContent !== line) hint.textContent = line;
    },
    onEnd: (reason) => {
      if (reason === "released") showIdle(HOLD_HINT);
      else if (reason === "cancelled") showIdle("");
      else showIdle(open() ? "" : STILL_STARTING);
    },
  });

  const isHoldKey = (key: string): boolean => key === "Enter" || key === " " || key === "Spacebar";
  opener.addEventListener("pointerdown", (event) => {
    // Only the main button of a mouse; touch and pen report 0 as well.
    if (event.button > 0) return;
    hold.press("pointer");
  });
  opener.addEventListener("pointerup", () => hold.release("pointer"));
  opener.addEventListener("pointerleave", () => hold.cancel());
  opener.addEventListener("pointercancel", () => hold.cancel());
  opener.addEventListener("blur", () => hold.cancel());
  // A long press must not bring up the context menu instead of counting.
  opener.addEventListener("contextmenu", (event) => event.preventDefault());
  opener.addEventListener("keydown", (event) => {
    if (!isHoldKey(event.key)) return;
    event.preventDefault();
    if (event.repeat) return;
    hold.press(`key:${event.key}`);
  });
  opener.addEventListener("keyup", (event) => {
    if (isHoldKey(event.key)) hold.release(`key:${event.key}`);
  });
  // An open area must not be left behind on a device that is put away or handed to the child.
  (options.onPageHidden ?? defaultPageHidden)(() => {
    hold.cancel();
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
