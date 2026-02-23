import type { SymbolDefinition } from '../context/SymbolStore';

export const normalizeSymbolName = (name: string): string => name.trim().toLocaleLowerCase('de-DE');

export function dedupeSymbolsByName(symbols: SymbolDefinition[]): SymbolDefinition[] {
  const symbolsByName = new Map<string, SymbolDefinition>();

  for (const symbol of symbols) {
    if (!symbol.name.trim()) {
      continue;
    }

    const normalizedName = normalizeSymbolName(symbol.name);
    const existingSymbol = symbolsByName.get(normalizedName);
    const symbolHasProfileScope = Boolean(symbol.profileId?.trim());
    const existingHasProfileScope = Boolean(existingSymbol?.profileId?.trim());

    if (!existingSymbol || (!existingHasProfileScope && symbolHasProfileScope)) {
      symbolsByName.set(normalizedName, { ...symbol, name: symbol.name.trim() });
    }
  }

  return Array.from(symbolsByName.values());
}
