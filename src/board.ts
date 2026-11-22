import { CONCEPTS } from "./concepts.js";
import type { BoardEntry } from "./board-data.js";
import { requestLocalGermanSpeech, type SpeechAttempt } from "./speech.js";
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

const EXAMPLES_LINE = "Testoberfläche mit Beispielen. Die Begriffe sind noch nicht freigegeben.";

/** One calm sentence per reason why the examples stand in for the child's own board. */
const FALLBACK_LINES: Record<FallbackCause, string> = {
  "storage-unavailable": "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb werden hier Beispiele gezeigt.",
  "damaged": "Die eigene Tafel kann gerade nicht geladen werden. Bis dahin werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  "no-active": "Es ist noch keine eigene Tafel ausgewählt. Bis dahin werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  "empty-profile": "Für die eigene Tafel sind noch keine Begriffe ausgewählt. Bis dahin werden Beispiele gezeigt.",
  "unloadable-profile": "Die Begriffe der eigenen Tafel konnten nicht geladen werden. Bis dahin werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
  "timeout": "Die eigene Tafel braucht gerade länger zum Laden. Bis dahin werden Beispiele gezeigt.",
  "timeout-kept": "Hier werden noch Beispiele gezeigt. Die eigene Tafel ist bereit und erscheint, wenn die Seite neu geladen wird.",
  "render-failed": "Die eigene Tafel kann gerade nicht angezeigt werden. Bis dahin werden Beispiele gezeigt. Bitte gib einer Bezugsperson Bescheid.",
};

function fallbackLine(cause: FallbackCause | null): string {
  return cause === null ? EXAMPLES_LINE : FALLBACK_LINES[cause];
}

function makeHeading(): HTMLElement {
  const heading = document.createElement("h1");
  heading.textContent = "Amy's Echo NG";
  return heading;
}

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
 * (`data-board-problems`, absent when the view is not a profile's board) and one
 * console line per problem with its kind and concept id. No wording and no
 * profile name is logged.
 */
function reportProblems(root: HTMLElement, view: BoardView): void {
  if (view.kind !== "profile") {
    delete root.dataset["boardProblems"];
    return;
  }
  root.dataset["boardProblems"] = String(view.problems.length);
  for (const problem of view.problems) {
    console.warn(`Board problem: ${problem.kind} for concept "${problem.conceptId}"${problem.damage === undefined ? "" : ` (${problem.damage})`}`);
  }
}

/** The state before storage has answered: nothing to tap, so nothing wrong can be said. */
export function mountLoading(root: HTMLElement): void {
  root.replaceChildren(makeHeading(), paragraph("board-notice", "Die Tafel wird geladen."));
}

/** Last resort when no board can be drawn. It does not claim that anything is loading. */
export function mountFailure(root: HTMLElement): void {
  root.replaceChildren(makeHeading(), paragraph("board-notice", "Die Tafel kann gerade nicht angezeigt werden. Bitte lade die Seite neu oder gib einer Bezugsperson Bescheid."));
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
export function mountBoard(root: HTMLElement, view: BoardView): BoardHandle {
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
  board.className = "concept-board";
  board.setAttribute("aria-label", "Kommunikationsbegriffe");
  board.setAttribute("role", "group");

  const output = document.createElement("p");
  output.className = "message";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  output.textContent = "Wähle einen Begriff.";

  const speechStatus = document.createElement("p");
  speechStatus.className = "speech-status";
  speechStatus.setAttribute("role", "status");
  speechStatus.setAttribute("aria-live", "polite");
  speechStatus.textContent = "Sprachausgabe noch nicht geprüft.";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "retry";
  retry.textContent = "Sprache erneut versuchen";
  retry.hidden = true;

  let selection: BoardEntry | null = null;
  // Each request to speak gets a number. An error reported for an earlier
  // request (the engine reports one when a newer request cancels it, also for
  // the same concept) must not overwrite the status of the current one.
  let currentAttempt = 0;

  const speak = (concept: BoardEntry): void => {
    currentAttempt += 1;
    const thisAttempt = currentAttempt;
    const attempt: SpeechAttempt = requestLocalGermanSpeech(concept.speechDe, () => {
      if (thisAttempt === currentAttempt) {
        speechStatus.textContent = "Sprachausgabe fehlgeschlagen. Der Text bleibt sichtbar.";
      }
    });
    const messages: Record<SpeechAttempt, string> = {
      requested: "Lokale deutsche Stimme angefordert. Offline-Wiedergabe am Gerät noch nicht bestätigt.",
      unavailable: "Keine lokale deutsche Stimme verfügbar. Der Text bleibt sichtbar.",
      failed: "Sprachausgabe fehlgeschlagen. Der Text bleibt sichtbar.",
    };
    speechStatus.textContent = messages[attempt];
    retry.hidden = false;
  };

  for (const concept of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", concept.labelDe);

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
      button.append(symbol, label);
    }

    button.addEventListener("click", () => {
      selection = concept;
      output.textContent = concept.speechDe;
      speak(concept);
    });
    board.append(button);
  }

  retry.addEventListener("click", () => {
    if (selection !== null) {
      speak(selection);
    }
  });

  cancelRunningSpeech();
  root.replaceChildren(heading, ...notices, board, output, speechStatus, retry);
  showCause();
  reportProblems(root, view);
  return {
    hasSelection: () => selection !== null,
    setFallback: (next) => {
      // Only while this board is the one on screen, and only on a board of examples.
      if (fallbackNotice === null || root.children[1] !== fallbackNotice) return;
      cause = next;
      fallbackNotice.textContent = fallbackLine(cause);
      fallbackNotice.className = cause === null ? "board-notice" : "board-notice board-fallback";
      showCause();
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
