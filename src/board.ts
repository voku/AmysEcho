import { CONCEPTS, type ConceptV1 } from "./concepts.js";
import { requestLocalGermanSpeech, type SpeechAttempt } from "./speech.js";

export function mountBoard(root: HTMLElement): void {
  const heading = document.createElement("h1");
  heading.textContent = "Amy's Echo NG";

  const explanation = document.createElement("p");
  explanation.textContent = "Testoberfläche mit Beispielen. Die Begriffe sind noch nicht freigegeben.";

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

  let selection: ConceptV1 | null = null;

  const speak = (concept: ConceptV1): void => {
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

  for (const concept of CONCEPTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "concept";
    button.setAttribute("aria-label", concept.labelDe);

    const symbol = document.createElement("img");
    symbol.src = concept.symbolPath;
    symbol.alt = "";
    symbol.width = 64;
    symbol.height = 64;

    const label = document.createElement("span");
    label.textContent = concept.labelDe;
    button.append(symbol, label);

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

  root.replaceChildren(heading, explanation, board, output, speechStatus, retry);
}
