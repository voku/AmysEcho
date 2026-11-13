/** Synthetic public demo vocabulary; no caregiver has approved these concepts for a child. */
export interface ConceptV1 {
  readonly version: 1;
  readonly id: string;
  readonly labelDe: string;
  readonly speechDe: string;
  readonly symbolPath: string;
}

const conceptDefinitions: ConceptV1[] = [
  { version: 1, id: "hilfe", labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", symbolPath: "./icons/hilfe.svg" },
  { version: 1, id: "trinken", labelDe: "Trinken", speechDe: "Ich möchte etwas trinken.", symbolPath: "./icons/trinken.svg" },
  { version: 1, id: "pause", labelDe: "Pause", speechDe: "Ich brauche eine Pause.", symbolPath: "./icons/pause.svg" },
  { version: 1, id: "mehr", labelDe: "Mehr", speechDe: "Ich möchte mehr.", symbolPath: "./icons/mehr.svg" },
  { version: 1, id: "fertig", labelDe: "Fertig", speechDe: "Ich bin fertig.", symbolPath: "./icons/fertig.svg" },
];

export const CONCEPTS: readonly ConceptV1[] = Object.freeze(conceptDefinitions.map((concept) => Object.freeze(concept)));

export function findConcept(id: string): ConceptV1 | null {
  return CONCEPTS.find((concept) => concept.id === id) ?? null;
}
