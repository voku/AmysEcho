import { CONCEPTS } from "./concepts.js";
import type { BoardEntry } from "./board-data.js";
import { requestLocalGermanSpeech, type SpeechAttempt } from "./speech.js";
import type { StartupView } from "./startup.js";

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
      if (view.entries.length === 0) notices.push(paragraph("board-notice", "Für dieses Profil sind noch keine Begriffe ausgewählt."));
      if (view.problems.length > 0) notices.push(paragraph("board-notice", "Nicht alle Begriffe dieser Tafel konnten so geladen werden, wie sie gespeichert sind."));
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

/**
 * Renders the view into `root`, replacing what was there. A view without
 * concepts shows its message only: no board, no output line, no speech status.
 */
export function mountBoard(root: HTMLElement, view: StartupView): void {
  const heading = document.createElement("h1");
  heading.textContent = "Amy's Echo NG";

  const { notices, entries } = describe(view);
  if (entries.length === 0) {
    root.replaceChildren(heading, ...notices);
    return;
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

  const speak = (concept: BoardEntry): void => {
    const attempt: SpeechAttempt = requestLocalGermanSpeech(concept.speechDe, () => {
      if (selection?.id === concept.id) {
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

  root.replaceChildren(heading, ...notices, board, output, speechStatus, retry);
}
