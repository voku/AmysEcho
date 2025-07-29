const GESTURE_LABEL_MAP: Record<string, string> = {
  hello: 'Hallo',
  thank_you: 'Danke',
  please: 'Bitte',
  more: 'Mehr',
  finished: 'Fertig',
  water: 'Wasser',
  eat: 'Essen',
  play: 'Spielen',
  help: 'Hilfe',
  yes: 'Ja',
  no: 'Nein',
  good: 'Gut',
  bad: 'Schlecht',
  happy: 'Glücklich',
  sad: 'Traurig',
};

export function getSymbolLabelForGesture(gestureId: string): string {
  return GESTURE_LABEL_MAP[gestureId] || gestureId;
}
