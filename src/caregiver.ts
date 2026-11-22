/**
 * The caregiver area, first slice (card NG-29): a deliberate way in from the
 * child's screen, and inside it the profile list, creating a profile, making
 * one the active board, and choosing and ordering its catalogue concepts.
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
  + "Bitte drücke „Tafel neu laden“, lade die Seite neu oder gib einer Bezugsperson Bescheid.";
const NAME_NOTICE = "Dies ist eine Testversion. Ein Vorname oder Spitzname genügt; bitte keinen Nachnamen. "
  + "Der Name und die ausgewählten Begriffe werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Die App sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Diese Version kann ein einzelnes Profil noch nicht umbenennen oder löschen, und eine Sicherung gibt es noch nicht. "
  + "Wer die Website-Daten im Browser löscht, entfernt alle Profile in diesem Browser und die Offline-Kopie der App. "
  + "Der Browser kann diese Daten auch von sich aus löschen.";
const NONE_ACTIVE = "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, bis eine Tafel als aktive Tafel verwendet wird.";
const EDITED_NOT_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht eine andere Tafel.";
const EDITED_NONE_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele.";
const EDITED_NOT_ACTIVE_UNKNOWN = "Diese Tafel ist gerade nicht aktiv.";
const ONLY_DAMAGED = "Kein gespeichertes Profil kann in dieser Version gelesen werden. Das Kind sieht Beispiele.";
const ACTIVE_WITHOUT_CONCEPTS = "Auf dieser Tafel ist noch kein Begriff, der gezeigt werden kann. Das Kind sieht Beispiele, bis mindestens ein Begriff angekreuzt ist.";
const CONCEPT_HELP = "Angekreuzte Begriffe sind auf der Tafel, in dieser Reihenfolge. Jede Änderung wird sofort gespeichert. "
  + "Ein Begriff, der neu angekreuzt wird, kommt ans Ende der Tafel.";
const RELOAD_NO_STORAGE = "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele.";
const RELOAD_NOT_DRAWN = "Die Tafel kann gerade nicht angezeigt werden. Bitte versuche es noch einmal.";
const NO_PROFILES = "Auf diesem Gerät gibt es noch kein Profil.";
const ACTIVE_MARK = "Aktive Tafel";
const ACTIVATE = "Als aktive Tafel verwenden";
const EDIT_CONCEPTS = "Begriffe auswählen";
const NOT_EDITABLE = "Dieser Begriff kann in dieser Version nicht bearbeitet werden.";
const RETIRED = "Dieser Begriff ist nicht mehr in der Auswahl.";
const BOARD_UNREADABLE = "Die Begriffe dieses Profils können gerade nicht gelesen werden.";
const SELECT_PROFILE = "Wähle oben bei einem Profil „Begriffe auswählen“.";
const WRITE_FAILED = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.";
const PROFILE_GONE = "Dieses Profil kann nicht gelesen werden oder ist nicht mehr gespeichert.";
const RELOADING = "Die Tafel wird neu geladen.";
const RELOADED = "Die Tafel wurde neu geladen.";
const RELOAD_FAILED = "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal.";

const quoted = (text: string): string => `„${text}“`;

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
  let heading: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let focusables = new Map<string, HTMLElement & { disabled?: boolean }>();

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

  /** Reads the store again and replaces the body. `focus` names the controls to try, in order, for the focus. */
  const draw = async (focus: readonly string[] | null, draftName?: string): Promise<void> => {
    const mine = acting;
    if (!isOpen || mine !== session) return;
    // A name that is typed but not sent yet survives the redraw after another action.
    const typed = draftName ?? (focusables.get("create-name") as HTMLInputElement | undefined)?.value ?? "";
    const nextFocusables = new Map<string, HTMLElement & { disabled?: boolean }>();
    let content: HTMLElement[];
    if (store === null) {
      content = [element("p", "caregiver-notice", STORAGE_UNREACHABLE)];
    } else {
      try {
        content = await build(store, nextFocusables, typed);
      } catch {
        nextFocusables.clear();
        content = [element("p", "caregiver-notice", READ_FAILED)];
      }
    }
    if (!isOpen || mine !== session || body === null) return;
    body.replaceChildren(...content);
    focusables = nextFocusables;
    if (focus === null) return;
    const target = focus.map((key) => focusables.get(key)).find((candidate) => candidate !== undefined && candidate.disabled !== true);
    (target ?? heading)?.focus();
  };

  /** `raw` is the name as it was when the form was sent, not what the field holds when the queue gets here. */
  const createProfile = (raw: string): void => runWrite(async () => {
    if (store === null) return;
    try {
      const before = await store.list();
      const first = before.profiles.length === 0 && before.damaged.length === 0;
      const profile = await store.create(raw, []);
      writes += 1;
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
    try {
      await store.setActive(profile.id);
      writes += 1;
      say(`${quoted(profile.displayName)} ist jetzt die aktive Tafel.`);
    } catch (error) {
      say(error instanceof UnknownProfileError || error instanceof ProfileFormatError ? PROFILE_GONE : WRITE_FAILED);
    }
    await draw([`edit:${profile.id}`]);
  });

  const select = (profile: ProfileV1): void => run(async () => {
    selectedId = profile.id;
    say("");
    await draw([`edit:${profile.id}`]);
  });

  /**
   * One change of a board: reads the profile's full `conceptIds` from the
   * store, lets `change` build the new list from them, and saves it through
   * `setBoardConcepts`. `change` returns null when there is nothing to do.
   */
  const changeBoard = (
    profileId: string, focus: readonly string[], done: string,
    change: (ids: readonly string[], editable: ReadonlySet<string>) => string[] | null,
  ): void => runWrite(async () => {
    if (store === null) return;
    try {
      const board = await resolveBoard(store, profileId, catalogue);
      const next = change(board.profile.conceptIds, editableIds(board));
      if (next !== null) {
        await setBoardConcepts(store, profileId, next, catalogue);
        writes += 1;
        say(done);
      }
    } catch (error) {
      say(boardErrorLine(error));
    }
    await draw(focus);
  });

  const conceptRow = (
    profileId: string, index: number, id: string, shown: { labelDe: string; speechDe: string; symbolPath: string | null },
    state: { chosen: boolean; canUp: boolean; canDown: boolean }, register: Map<string, HTMLElement>,
  ): HTMLElement => {
    const row = element("li", state.chosen ? "caregiver-concept caregiver-concept-chosen" : "caregiver-concept");
    const checkbox = element("input", "caregiver-check");
    checkbox.type = "checkbox";
    checkbox.id = `caregiver-concept-${index}`;
    checkbox.checked = state.chosen;
    const label = element("label", "caregiver-concept-label");
    label.htmlFor = checkbox.id;
    if (shown.symbolPath !== null) {
      const picture = element("img", "");
      picture.src = shown.symbolPath;
      picture.alt = "";
      picture.width = 48;
      picture.height = 48;
      label.append(picture);
    }
    label.append(element("span", "caregiver-concept-name", shown.labelDe), element("span", "caregiver-concept-sentence", shown.speechDe));
    checkbox.addEventListener("change", () => {
      const add = checkbox.checked;
      changeBoard(profileId, [`check:${id}`], `Gespeichert: ${quoted(shown.labelDe)} ist ${add ? "jetzt" : "nicht mehr"} auf der Tafel.`, (ids, editable) => {
        if (add) {
          if (ids.includes(id)) return null;
          if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(`Auf eine Tafel passen höchstens ${MAX_CONCEPT_IDS} Begriffe. Es wurde nichts geändert.`);
          return [...ids, id];
        }
        // Only what this screen may edit is ever taken off; every other id stays in the list.
        return editable.has(id) ? ids.filter((other) => other !== id) : null;
      });
    });
    register.set(`check:${id}`, checkbox);
    row.append(checkbox, label);
    if (state.chosen) {
      const move = (text: string, delta: -1 | 1, enabled: boolean): HTMLButtonElement => {
        const control = button(text, "caregiver-button caregiver-move");
        control.setAttribute("aria-label", `${shown.labelDe} ${text}`);
        control.disabled = !enabled;
        const key = `${delta < 0 ? "up" : "down"}:${id}`;
        control.addEventListener("click", () => {
          changeBoard(profileId, [key, `${delta < 0 ? "down" : "up"}:${id}`, `check:${id}`], "Die Reihenfolge wurde gespeichert.",
            (ids, editable) => moved(ids, editable, id, delta));
        });
        register.set(key, control);
        return control;
      };
      row.append(move("nach oben", -1, state.canUp), move("nach unten", 1, state.canDown));
    }
    return row;
  };

  /** A concept on the board that this version does not edit: shown, checked, and not changeable. */
  const lockedRow = (index: number, id: string, entry: BoardEntry | undefined): HTMLElement => {
    const row = element("li", "caregiver-concept caregiver-concept-chosen caregiver-concept-locked");
    const checkbox = element("input", "caregiver-check");
    checkbox.type = "checkbox";
    checkbox.id = `caregiver-concept-${index}`;
    checkbox.checked = true;
    checkbox.disabled = true;
    const label = element("label", "caregiver-concept-label");
    label.htmlFor = checkbox.id;
    if (entry === undefined) {
      label.append(element("span", "caregiver-concept-name", `Begriff ${quoted(id)}`));
    } else {
      label.append(element("span", "caregiver-concept-name", entry.labelDe), element("span", "caregiver-concept-sentence", entry.speechDe));
    }
    const note = element("p", "caregiver-concept-note", entry?.source === "retired" ? `${RETIRED} ${NOT_EDITABLE}` : NOT_EDITABLE);
    row.append(checkbox, label, note);
    return row;
  };

  const conceptSection = async (
    current: ProfileStore, profile: ProfileV1, activeId: string | null, register: Map<string, HTMLElement>,
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
    section.append(element("h2", "", `Begriffe für ${quoted(profile.displayName)}`));
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
    const ids = board.profile.conceptIds;
    const editable = editableIds(board);
    const editableOrder = ids.filter((id) => editable.has(id));
    const list = element("ul", "caregiver-concepts");
    ids.forEach((id, index) => {
      const entry = board.entries.find((candidate) => candidate.id === id);
      if (entry !== undefined && editable.has(id)) {
        const place = editableOrder.indexOf(id);
        list.append(conceptRow(profile.id, index, id, entry, { chosen: true, canUp: place > 0, canDown: place < editableOrder.length - 1 }, register));
      } else {
        list.append(lockedRow(index, id, entry));
      }
    });
    catalogue.filter((concept) => !ids.includes(concept.id)).forEach((concept, offset) => {
      list.append(conceptRow(profile.id, ids.length + offset, concept.id, concept, { chosen: false, canUp: false, canDown: false }, register));
    });
    section.append(list);
    return section;
  };

  const build = async (current: ProfileStore, register: Map<string, HTMLElement>, draftName: string): Promise<HTMLElement[]> => {
    const listing = await current.list();
    // Null also when the active profile's record is unreadable; the damaged note below covers that.
    const activeId = await current.getActive();
    const profiles = [...listing.profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "de") || a.id.localeCompare(b.id));
    if (!profiles.some((profile) => profile.id === selectedId)) {
      selectedId = profiles.find((profile) => profile.id === activeId)?.id ?? (profiles.length === 1 ? (profiles[0] as ProfileV1).id : null);
    }

    const profileSection = element("section", "caregiver-section");
    profileSection.append(element("h2", "", "Profile"));
    if (listing.damaged.length > 0) profileSection.append(element("p", "caregiver-notice caregiver-damaged", damagedLine(listing.damaged.length)));
    if (profiles.length === 0) {
      // Damaged entries are not "no profile yet": the device is not new.
      profileSection.append(element("p", "caregiver-notice", listing.damaged.length > 0 ? ONLY_DAMAGED : NO_PROFILES));
    } else {
      const list = element("ul", "caregiver-profiles");
      for (const profile of profiles) {
        const item = element("li", "caregiver-profile");
        item.append(element("span", "caregiver-profile-name", profile.displayName));
        if (profile.id === activeId) {
          item.append(element("span", "caregiver-active", ACTIVE_MARK));
        } else {
          const make = button(ACTIVATE);
          make.setAttribute("aria-label", `${ACTIVATE}: ${profile.displayName}`);
          make.addEventListener("click", () => activate(profile));
          register.set(`activate:${profile.id}`, make);
          item.append(make);
        }
        const edit = button(EDIT_CONCEPTS);
        edit.setAttribute("aria-label", `${EDIT_CONCEPTS}: ${profile.displayName}`);
        edit.setAttribute("aria-pressed", profile.id === selectedId ? "true" : "false");
        edit.addEventListener("click", () => select(profile));
        register.set(`edit:${profile.id}`, edit);
        item.append(edit);
        list.append(item);
      }
      profileSection.append(list);
      if (activeId === null) profileSection.append(element("p", "caregiver-notice caregiver-warning", NONE_ACTIVE));
    }

    const form = element("form", "caregiver-create");
    const nameLabel = element("label", "", "Name für ein neues Profil");
    nameLabel.htmlFor = "caregiver-new-name";
    const nameInput = element("input", "caregiver-input");
    nameInput.type = "text";
    nameInput.id = "caregiver-new-name";
    nameInput.autocomplete = "off";
    // Spell checking and correction can send typed text to a service; a name stays here.
    nameInput.spellcheck = false;
    nameInput.setAttribute("autocapitalize", "off");
    nameInput.setAttribute("autocorrect", "off");
    const nameNotice = element("p", "caregiver-notice caregiver-name-notice", NAME_NOTICE);
    nameNotice.id = "caregiver-new-name-notice";
    nameInput.setAttribute("aria-describedby", nameNotice.id);
    nameInput.value = draftName;
    const submit = element("button", "caregiver-button", "Profil anlegen");
    submit.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      createProfile(nameInput.value);
    });
    form.append(nameLabel, nameInput, submit, nameNotice);
    register.set("create-name", nameInput);
    profileSection.append(form);

    const selected = profiles.find((profile) => profile.id === selectedId);
    if (selected !== undefined) return [profileSection, await conceptSection(current, selected, activeId, register)];
    return profiles.length === 0 ? [profileSection] : [profileSection, element("p", "caregiver-notice", SELECT_PROFILE)];
  };

  const close = (): Promise<void> => {
    if (!isOpen) return closing;
    const running = work;
    isOpen = false;
    session += 1;
    cancelIdle();
    // The next opening edits the active profile again, whatever was picked this time.
    selectedId = null;
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
    status = null;
    body = null;
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
          const retry = button("Tafel neu laden");
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
  caregiverRegion.addEventListener("keydown", restartIdle);
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

    heading = element("h1", "caregiver-heading", "Für Bezugspersonen");
    heading.tabIndex = -1;
    status = element("p", "caregiver-status", READING);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    body = element("div", "caregiver-body");
    const actions = element("div", "caregiver-actions");
    const reload = button("Tafel neu laden");
    reload.addEventListener("click", () => run(async () => {
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
    const closer = button("Schließen");
    closer.addEventListener("click", () => void close());
    actions.append(reload, closer);

    boardRegion.hidden = true;
    entry.hidden = true;
    caregiverRegion.replaceChildren(heading, status, body, actions);
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
