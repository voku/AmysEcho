const gestureToSymbol: Record<string, string> = {
  trinken: 'Trinken',
  essen: 'Essen',
  spielen: 'Spielen',
};

export function getSymbolLabelForGesture(gesture: string): string | undefined {
  return gestureToSymbol[gesture];
}
