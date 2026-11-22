import { CONCEPTS } from "./concepts.js";
import type { BoardEntry } from "./board-data.js";
import { requestLocalGermanSpeech, type SpeechAttempt } from "./speech.js";
import type { BoardHandle, StartupHost, StartupView } from "./startup.js";

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

/** The lines above the board and the concepts to show, per view. */
function describe(view: StartupView): { readonly notices: HTMLElement[]; readonly entries: readonly BoardEntry[] } {
  switch (view.kind) {
    case "demo": {
      const notices = [paragraph("board-notice", "Testoberfläche mit Beispielen. Die Begriffe sind noch nicht freigegeben.")];
      if (view.storage === "unavailable") {
        notices.push(paragraph("board-notice", "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb sind hier nur die Beispiele zu sehen."));
      }
      return { notices, entries: demoEntries() };
    }
    case "profile": {
      const notices = [paragraph("board-owner", `Profil: ${view.displayName}`)];
      // A custom concept under an id the catalogue uses too is shown as the profile stored it:
      // worth a trace for the caregiver, but nothing is wrong on the board.
      const troubled = view.problems.some((problem) => problem.kind !== "custom-shadows-catalogue");
      if (view.entries.length === 0) {
        notices.push(paragraph("board-notice", troubled
          ? "Die Begriffe dieser Tafel konnten nicht geladen werden. Bitte gib einer Bezugsperson Bescheid."
          : "Für dieses Profil sind noch keine Begriffe ausgewählt."));
      } else if (troubled) {
        notices.push(paragraph("board-notice", "Nicht alle Begriffe dieser Tafel konnten so geladen werden, wie sie gespeichert sind."));
      }
      return { notices, entries: view.entries };
    }
    case "damaged":
      return {
        notices: [paragraph("board-notice", view.count === 1
          ? "Ein gespeichertes Profil kann gerade nicht gelesen werden. Es wurde nichts verändert. Bitte gib einer Bezugsperson Bescheid."
          : `${view.count} gespeicherte Profile können gerade nicht gelesen werden. Es wurde nichts verändert. Bitte gib einer Bezugsperson Bescheid.`)],
        entries: [],
      };
    case "no-active":
      return { notices: [paragraph("board-notice", "Es ist noch kein Profil ausgewählt. Bitte gib einer Bezugsperson Bescheid.")], entries: [] };
  }
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
 * Leaves a trace of board problems for the caregiver: the count on the root
 * (`data-board-problems`, absent when the view is not a profile board) and one
 * console line per problem with its kind and concept id. No wording and no
 * profile name is logged.
 */
function reportProblems(root: HTMLElement, view: StartupView): void {
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

/**
 * Renders the view into `root`, replacing what was there, and stops running
 * speech first. A view without concepts shows its message only: no board, no
 * output line, no speech status.
 */
export function mountBoard(root: HTMLElement, view: StartupView): BoardHandle {
  const heading = makeHeading();
  const { notices, entries } = describe(view);
  if (entries.length === 0) {
    cancelRunningSpeech();
    root.replaceChildren(heading, ...notices);
    reportProblems(root, view);
    return { hasSelection: () => false };
  }

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
  reportProblems(root, view);
  return { hasSelection: () => selection !== null };
}

/** The real page as a `StartupHost` for `runStartup`. */
export function createBoardHost(root: HTMLElement): StartupHost {
  return {
    showLoading: () => mountLoading(root),
    mount: (view) => mountBoard(root, view),
    setData: (name, value) => {
      root.dataset[name] = value;
    },
    setTimer: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
  };
}
