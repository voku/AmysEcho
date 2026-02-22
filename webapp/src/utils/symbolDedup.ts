import type { SymbolDefinition } from '../context/SymbolStore';

export const normalizeSymbolName = (name: string): string => name.trim().toLocaleLowerCase('de-DE');

export function dedupeSymbolsByName(symbols: SymbolDefinition[]): SymbolDefinition[] {
  const symbolsByName = new Map<string, SymbolDefinition>();

  for (const symbol of symbols) {
    const trimmedName = symbol.name.trim();
    if (!trimmedName) {
      continue;
    }

    const normalizedName = normalizeSymbolName(trimmedName);
    const normalizedSymbol = { ...symbol, name: trimmedName };
    const existingSymbol = symbolsByName.get(normalizedName);

    if (!existingSymbol) {
      symbolsByName.set(normalizedName, normalizedSymbol);
      continue;
    }

    if (!existingSymbol.profileId && symbol.profileId) {
      symbolsByName.set(normalizedName, normalizedSymbol);
    }
  }

  return Array.from(symbolsByName.values());
}
