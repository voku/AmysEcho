import { CONCEPTS } from "./concepts.js";
import type { BoardEntry } from "./board-data.js";
import { hasLocalGermanVoice, onVoicesChanged, requestLocalGermanSpeech, type SpeechAttempt } from "./speech.js";
import { fallbackCause, isTroubled, showsExamples } from "./startup.js";
import type { BoardHandle, BoardView, FallbackCause, StartupHost } from "./startup.js";

function paragraph(className: string, text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function demoEntries(): BoardEntry[] {
  return CONCEPTS.map((concept) => ({
    id: concept.id, labelDe: concept.labelDe, speechDe: concept.speechDe, symbolPath: concept.symbolPath, source: "catalogue",
  }));
}

const EXAMPLES_LINE = "Testoberfläche mit Beispielen, noch nicht freigegeben.";

/** What the sentence bar shows before a tile was tapped. "Feld" is true for picture tiles and text tiles alike. */
const PROMPT = "Tippe auf ein Feld.";
const REPEAT_LABEL = "Satz noch einmal sprechen";
const REPEAT_LABEL_INERT = "Satz noch einmal sprechen. Noch kein Feld gewählt.";
const SPEAKER_PATH = "./icons/sprechen.svg";

/**
 * The only speech lines the child's screen ever shows; a normal request shows
 * none. They say what to do and are short enough for one line inside the
 * sentence bar on a 320 px phone. Longer help is in docs/board.md.
 */
const NO_VOICE_LINE = "Keine Stimme. Bitte noch einmal tippen.";
const SPEECH_FAILED_LINE = "Vorlesen ging nicht. Bitte noch einmal tippen.";

/**
 * How long a sentence counts as still being spoken when the engine reports
 * neither its end nor an error. While a sentence is being spoken, a tap that
 * asks for the same sentence (its tile again, or the sentence bar) is
 * ignored, so an unsteady hand does not cut it off and restart it. Engines
 * are not known to report the end reliably on every device; after this bound
 * the next tap speaks again. A guess, not measured: a very long sentence can
 * take longer, and is then restarted by a tap.
 */
export const SPEECH_MAX_MS = 8000;

export type BoardOrientation = "portrait" | "wide";

/**
 * How many columns a board of `count` tiles gets. "wide" is a screen in
 * landscape orientation; the stylesheet decides which of the two applies (`data-columns-portrait`, `data-columns-wide` on the board).
 */
export function boardColumns(count: number, orientation: BoardOrientation): number {
  if (count <= 1) return 1;
  if (orientation === "portrait") {
    if (count <= 6) return 2;
    return count <= 12 ? 3 : 4;
  }
  if (count === 4) return 2;
  if (count <= 3) return count;
  if (count <= 6) return 3;
  return count <= 12 ? 4 : 5;
}

export interface BoardOptions {
  /** Milliseconds from a steady clock, for `SPEECH_MAX_MS`; for tests. */
  readonly now?: () => number;
}

/** One calm sentence per reason why the examples stand in for the child's own board. */
const FALLBACK_LINES: Record<FallbackCause, string> = {
  "storage-unavailable": "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb werden hier Beispiele gezeigt.",
  "damaged": "Die eigene Tafel kann gerade nicht geladen werden. Deshalb werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  "no-active": "Es ist noch keine eigene Tafel ausgewählt. Bis dahin werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  "empty-profile": "Für die eigene Tafel sind noch keine Begriffe ausgewählt. Bis dahin werden Beispiele gezeigt.",
  "unloadable-profile": "Die Begriffe der eigenen Tafel konnten nicht geladen werden. Deshalb werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  // Also shown on a device without any profile whose storage never answers, so it does not speak of an own board.
  "timeout": "Das Laden dauert gerade länger. Deshalb werden Beispiele gezeigt.",
  "timeout-kept": "Hier werden noch Beispiele gezeigt. Die eigene Tafel ist bereit und erscheint, wenn die Seite neu geladen wird.",
  "render-failed": "Die eigene Tafel kann gerade nicht angezeigt werden. Deshalb werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  // Also shown when no own board exists (no profile, or one that was just removed), so it promises none.
  "refresh-timeout": "Die Tafel konnte nicht neu geladen werden. Deshalb werden Beispiele gezeigt. Bitte lade die Seite neu oder hol eine Bezugsperson.",
};

function fallbackLine(cause: FallbackCause | null): string {
  return cause === null ? EXAMPLES_LINE : FALLBACK_LINES[cause];
}

function makeHeading(): HTMLElement {
  // For the document outline only: the child's screen shows no app name.
  const heading = document.createElement("h1");
  heading.className = "visually-hidden";
  heading.textContent = "Amy's Echo NG";
  return heading;
}

/** Ends what the board that is being replaced still listens to (the voice list). */
let releaseMountedBoard = (): void => undefined;

/** Stops whatever is being spoken. A sentence of a board that is no longer shown must not go on. */
function cancelRunningSpeech(): void {
  try {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  } catch {
    // Speech is optional; a failing engine must not stop the board from being shown.
  }
}

/**
 * Leaves a trace of board problems for the caregiver: the count on the region
 * (`data-board-problems`, absent when the view carries no problem list) and one
 * console line per problem with its kind and concept id. No wording and no
 * profile name is logged.
 */
function reportProblems(root: HTMLElement, view: BoardView): void {
  const problems = view.kind === "profile" || view.kind === "fallback" ? view.problems : undefined;
  if (problems === undefined) {
    delete root.dataset["boardProblems"];
    return;
  }
  root.dataset["boardProblems"] = String(problems.length);
  for (const problem of problems) {
    console.warn(`Board problem: ${problem.kind} for concept "${problem.conceptId}"${problem.damage === undefined ? "" : ` (${problem.damage})`}`);
  }
}

/** The state before storage has answered: nothing to tap, so nothing wrong can be said. */
export function mountLoading(root: HTMLElement): void {
  // Voices load in the background; asking now gives them time until the first tap.
  hasLocalGermanVoice();
  root.replaceChildren(makeHeading(), paragraph("board-notice board-line", "Die Tafel wird geladen."));
}

/** Last resort when no board can be drawn. It does not claim that anything is loading. */
export function mountFailure(root: HTMLElement): void {
  root.replaceChildren(makeHeading(), paragraph("board-notice board-line", "Die Tafel kann gerade nicht angezeigt werden. Bitte lade die Seite neu oder gib einer Bezugsperson Bescheid."));
  delete root.dataset["boardFallback"];
  delete root.dataset["boardProblems"];
}

/**
 * Renders the view into `root` (the board region), replacing what was there,
 * and stops running speech first.
 *
 * There are always concepts to tap. A profile with at least one loadable
 * concept shows its own board. Everything else shows the example concepts
 * under one line that says so and why; the reason is also in
 * `data-board-fallback` (absent when there is none).
 *
 * Nothing that identifies the child is rendered: no display name and no
 * profile id, neither as text nor in an attribute.
 */
export function mountBoard(root: HTMLElement, view: BoardView, options: BoardOptions = {}): BoardHandle {
  const now = options.now ?? ((): number => performance.now());
  const heading = makeHeading();
  const examples = showsExamples(view);
  const entries: readonly BoardEntry[] = view.kind === "profile" && !examples ? view.entries : demoEntries();
  let cause = fallbackCause(view);
  const notices: HTMLElement[] = [];
  let fallbackNotice: HTMLElement | null = null;
  if (examples) {
    fallbackNotice = paragraph(cause === null ? "board-notice" : "board-notice board-fallback", fallbackLine(cause));
    notices.push(fallbackNotice);
  } else if (view.kind === "profile" && isTroubled(view.problems)) {
    notices.push(paragraph("board-notice", "Nicht alle Begriffe dieser Tafel konnten so geladen werden, wie sie gespeichert sind."));
  }
  const showCause = (): void => {
    if (cause === null) delete root.dataset["boardFallback"];
    else root.dataset["boardFallback"] = cause;
  };

  const board = document.createElement("div");
  board.setAttribute("role", "group");
  if (examples) {
    // Examples must look different from a child's own board, not only read
    // different: they can carry the same pictures as own tiles. The class
    // gives the frame and tint, the badge sits on the board itself.
    board.className = "concept-board concept-board-examples";
    board.setAttribute("aria-label", "Kommunikationsbegriffe, Beispiele");
    const badge = document.createElement("span");
    badge.className = "examples-badge";
    badge.textContent = "Beispiele";
    board.append(badge);
  } else {
    board.className = "concept-board";
    board.setAttribute("aria-label", "Kommunikationsbegriffe");
  }
  board.dataset["columnsPortrait"] = String(boardColumns(entries.length, "portrait"));
  board.dataset["columnsWide"] = String(boardColumns(entries.length, "wide"));

  // The sentence bar: the whole bar is one button that speaks the sentence
  // again. A button hides its content from the live-region machinery, so the
  // sentence is announced through a separate, visually hidden status line.
  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "sentence-bar sentence-bar-idle";
  bar.setAttribute("aria-disabled", "true");
  bar.setAttribute("aria-label", REPEAT_LABEL_INERT);
  const sentence = document.createElement("span");
  sentence.className = "sentence";
  sentence.textContent = PROMPT;
  const speaker = document.createElement("img");
  speaker.className = "sentence-speaker";
  speaker.src = SPEAKER_PATH;
  speaker.alt = "";
  speaker.width = 48;
  speaker.height = 48;
  speaker.draggable = false;
  bar.append(sentence, speaker);

  const output = document.createElement("p");
  output.className = "message visually-hidden";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");

  // Empty unless speech has a problem; see NO_VOICE_LINE.
  const speechStatus = document.createElement("p");
  speechStatus.className = "speech-status";
  speechStatus.setAttribute("role", "status");
  speechStatus.setAttribute("aria-live", "polite");

  let selection: { readonly concept: BoardEntry; readonly tile: HTMLElement } | null = null;
  const tiles: HTMLElement[] = [];
  // Each request to speak gets a number. A report for an earlier request (the
  // engine reports an error or an end when a newer request cancels it, also
  // for the same concept) must not change the state of the current one.
  let currentAttempt = 0;
  /** When the sentence that is being spoken was asked for; null when none is, as far as the app knows. */
  let spokenSince: number | null = null;
  let stopWatchingVoices = (): void => undefined;

  /** The speech line, and with it the look of the speaker: dimmed while there is a problem. */
  const showStatus = (line: string): void => {
    speechStatus.textContent = line;
    if (selection !== null) bar.className = line === "" ? "sentence-bar" : "sentence-bar sentence-bar-mute";
  };

  /**
   * After a tap that found no voice: when the engine's voice list changes and
   * holds a local German voice, the "no voice" line goes. Nothing is spoken
   * then: a sentence that comes seconds after the tap would be wrong.
   */
  const watchVoices = (): void => {
    stopWatchingVoices();
    const stop = onVoicesChanged(() => {
      // A report that still reaches a board that was replaced changes nothing.
      if (root.children[1] !== bar || !hasLocalGermanVoice()) return;
      stop();
      // Only a tap that found no voice listens, so the line that goes is the "no voice" line.
      showStatus("");
    });
    stopWatchingVoices = stop;
  };

  const speak = (concept: BoardEntry): void => {
    currentAttempt += 1;
    const thisAttempt = currentAttempt;
    const attempt: SpeechAttempt = requestLocalGermanSpeech(concept.speechDe, () => {
      if (thisAttempt !== currentAttempt) return;
      spokenSince = null;
      showStatus(SPEECH_FAILED_LINE);
    }, () => {
      if (thisAttempt === currentAttempt) spokenSince = null;
    });
    spokenSince = attempt === "requested" ? now() : null;
    const lines: Record<SpeechAttempt, string> = { requested: "", unavailable: NO_VOICE_LINE, failed: SPEECH_FAILED_LINE };
    showStatus(lines[attempt]);
    if (attempt === "unavailable") watchVoices();
    else stopWatchingVoices();
  };

  /** Speaks the selected sentence again, unless it is still being spoken. */
  const repeat = (concept: BoardEntry): void => {
    if (spokenSince !== null && now() - spokenSince < SPEECH_MAX_MS) return;
    speak(concept);
  };

  const select = (concept: BoardEntry, tile: HTMLElement): void => {
    selection = { concept, tile };
    for (const other of tiles) other.setAttribute("aria-pressed", other === tile ? "true" : "false");
    sentence.textContent = concept.speechDe;
    output.textContent = concept.speechDe;
    bar.setAttribute("aria-disabled", "false");
    bar.setAttribute("aria-label", REPEAT_LABEL);
    speak(concept);
  };

  // A long press on a picture or on the bar must not open the browser's menu.
  const noMenu = (event: Event): void => event.preventDefault();

  for (const concept of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", concept.labelDe);
    button.setAttribute("aria-pressed", "false");

    const label = document.createElement("span");
    label.textContent = concept.labelDe;

    if (concept.symbolPath === null) {
      // No symbol: a text-only button, never an image that cannot load.
      button.className = "concept concept-text";
      button.append(label);
    } else {
      button.className = "concept";
      const symbol = document.createElement("img");
      symbol.src = concept.symbolPath;
      symbol.alt = "";
      symbol.width = 64;
      symbol.height = 64;
      symbol.draggable = false;
      button.append(symbol, label);
    }

    button.addEventListener("click", () => {
      // Another tile always takes over at once; the same tile again is a repeat.
      if (selection !== null && selection.tile === button) repeat(concept);
      else select(concept, button);
    });
    button.addEventListener("contextmenu", noMenu);
    tiles.push(button);
    board.append(button);
  }

  bar.addEventListener("click", () => {
    if (selection !== null) repeat(selection.concept);
  });
  bar.addEventListener("contextmenu", noMenu);

  releaseMountedBoard();
  releaseMountedBoard = () => stopWatchingVoices();
  cancelRunningSpeech();
  // Voices load in the background; asking now gives them time until the first tap.
  hasLocalGermanVoice();
  root.replaceChildren(heading, bar, output, speechStatus, ...notices, board);
  showCause();
  reportProblems(root, view);
  return {
    hasSelection: () => selection !== null,
    restate: (next) => {
      // Only while this board is the one on screen, and only from examples to examples.
      if (fallbackNotice === null || root.children[1] !== bar || !showsExamples(next)) return;
      cause = fallbackCause(next);
      fallbackNotice.textContent = fallbackLine(cause);
      fallbackNotice.className = cause === null ? "board-notice" : "board-notice board-fallback";
      showCause();
      reportProblems(root, next);
    },
  };
}

/** The real page as a `StartupHost`: everything goes into `root`, the board region. */
export function createBoardHost(root: HTMLElement): StartupHost {
  return {
    showLoading: () => mountLoading(root),
    mount: (view) => mountBoard(root, view),
    showFailure: () => mountFailure(root),
    setData: (name, value) => {
      if (value === null) delete root.dataset[name];
      else root.dataset[name] = value;
    },
    setTimer: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
  };
}
