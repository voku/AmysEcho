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
    const existingSymbol = symbolsByName.get(normalizedName);

    if (!existingSymbol || (!existingSymbol.profileId && symbol.profileId)) {
      symbolsByName.set(normalizedName, { ...symbol, name: trimmedName });
    }
  }

  return Array.from(symbolsByName.values());
}
