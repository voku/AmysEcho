// Mapping of model gesture labels to symbol names. This acts as a fallback
// when no matching symbol is found in the current vocabulary.
// LLM Hint: Keeping this data in JSON allows the mapping to be updated
// without touching the TypeScript code.
const staticMap: Record<string, string> = require('../assets/models/gesture_map.json');

export function getSymbolLabelForGesture(
  gesture: string,
  vocabulary?: { name: string }[],
): string | undefined {
  if (vocabulary) {
    const match = vocabulary.find(
      (s) => s.name.toLowerCase() === gesture.toLowerCase(),
    );
    if (match) return match.name;
  }
  return staticMap[gesture];
}
