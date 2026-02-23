import type { SymbolDefinition } from '../context/SymbolStore';

export const normalizeSymbolName = (name: string): string => name.trim().toLocaleLowerCase('de-DE');

export function dedupeSymbolsByName(symbols: SymbolDefinition[]): SymbolDefinition[] {
  const symbolsByName = new Map<string, SymbolDefinition>();

  for (const symbol of symbols) {
    const trimmedName = typeof symbol.name === 'string' ? symbol.name.trim() : '';
    if (!trimmedName) {
      continue;
    }

    const trimmedProfileId = typeof symbol.profileId === 'string' ? symbol.profileId.trim() : '';
    const normalizedName = normalizeSymbolName(trimmedName);
    const normalizedSymbol = {
      ...symbol,
      name: trimmedName,
      profileId: trimmedProfileId || undefined,
    };

    const existingSymbol = symbolsByName.get(normalizedName);
     if (!existingSymbol) {
      symbolsByName.set(normalizedName, normalizedSymbol);
      continue;
    }
    
    const symbolHasProfileScope = Boolean(trimmedProfileId);
    const existingHasProfileScope = Boolean(existingSymbol?.profileId?.trim());
    if (!existingHasProfileScope && symbolHasProfileScope) {
      symbolsByName.set(normalizedName, normalizedSymbol);
    }
  }

  return Array.from(symbolsByName.values());
}
