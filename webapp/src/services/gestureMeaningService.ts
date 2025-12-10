/**
 * Sign Language Meaning Service
 * Maps Deutsche Gebärdensprache (DGS) signs to symbols and meanings for Amy's communication.
 * 
 * Each DGS sign has:
 * - Visual representation (emoji)
 * - Spoken output (audioText)
 * - Categorization for organization
 * - Priority for display ordering
 */

export interface GestureMeaning {
  gestureId: string; // Unique ID for this DGS sign
  label: string; // German label for the sign
  emoji: string; // Visual symbol representation
  category: string;
  color: string;
  audioText?: string; // What Amy's Echo speaks when this sign is recognized
  priority: number; // 1 = highest priority (essential needs)
}

export interface GestureSymbolMapping {
  gestureLabel: string; // The DGS sign label
  symbolId: string; // Associated symbol/icon ID
  meaning: GestureMeaning;
  confidence: number;
  lastUsed?: string;
}

const STORAGE_KEY = 'gestureMeanings';
const MAPPINGS_KEY = 'gestureSymbolMappings';

// Default DGS sign meanings (German for Amy)
// These represent common Deutsche Gebärdensprache vocabulary for basic communication
const DEFAULT_MEANINGS: GestureMeaning[] = [
  { gestureId: 'essen', label: 'Essen', emoji: '🍽️', category: 'grundbedürfnisse', color: '#FF6B6B', audioText: 'Ich möchte essen', priority: 1 },
  { gestureId: 'trinken', label: 'Trinken', emoji: '🥤', category: 'grundbedürfnisse', color: '#4ECDC4', audioText: 'Ich möchte trinken', priority: 1 },
  { gestureId: 'spielen', label: 'Spielen', emoji: '🎮', category: 'aktivitäten', color: '#45B7D1', audioText: 'Ich möchte spielen', priority: 2 },
  { gestureId: 'schlafen', label: 'Schlafen', emoji: '😴', category: 'grundbedürfnisse', color: '#96CEB4', audioText: 'Ich bin müde', priority: 1 },
  { gestureId: 'hilfe', label: 'Hilfe', emoji: '🆘', category: 'kommunikation', color: '#FF4757', audioText: 'Ich brauche Hilfe', priority: 1 },
  { gestureId: 'ja', label: 'Ja', emoji: '✅', category: 'antworten', color: '#2ED573', audioText: 'Ja', priority: 1 },
  { gestureId: 'nein', label: 'Nein', emoji: '❌', category: 'antworten', color: '#FF6B6B', audioText: 'Nein', priority: 1 },
  { gestureId: 'mehr', label: 'Mehr', emoji: '➕', category: 'kommunikation', color: '#5352ED', audioText: 'Ich möchte mehr', priority: 2 },
  { gestureId: 'fertig', label: 'Fertig', emoji: '✔️', category: 'kommunikation', color: '#2ED573', audioText: 'Ich bin fertig', priority: 2 },
  { gestureId: 'mama', label: 'Mama', emoji: '👩', category: 'personen', color: '#FF6B81', audioText: 'Mama', priority: 1 },
  { gestureId: 'papa', label: 'Papa', emoji: '👨', category: 'personen', color: '#70A1FF', audioText: 'Papa', priority: 1 },
  { gestureId: 'danke', label: 'Danke', emoji: '🙏', category: 'kommunikation', color: '#FFA502', audioText: 'Danke', priority: 2 },
  { gestureId: 'bitte', label: 'Bitte', emoji: '🙏', category: 'kommunikation', color: '#FF6348', audioText: 'Bitte', priority: 2 },
  { gestureId: 'toilette', label: 'Toilette', emoji: '🚽', category: 'grundbedürfnisse', color: '#747D8C', audioText: 'Ich muss auf die Toilette', priority: 1 },
  { gestureId: 'wasser', label: 'Wasser', emoji: '💧', category: 'grundbedürfnisse', color: '#1E90FF', audioText: 'Ich möchte Wasser', priority: 1 },
];

/**
 * Manages DGS sign meanings and their mappings to visual symbols.
 * Provides bidirectional lookup between signs and their semantic meanings.
 */
class GestureMeaningService {
  private meanings: Map<string, GestureMeaning> = new Map();
  private mappings: Map<string, GestureSymbolMapping> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      // Load meanings
      const storedMeanings = localStorage.getItem(STORAGE_KEY);
      if (storedMeanings) {
        const parsed = JSON.parse(storedMeanings) as GestureMeaning[];
        parsed.forEach(m => this.meanings.set(m.gestureId, m));
      } else {
        // Initialize with defaults
        DEFAULT_MEANINGS.forEach(m => this.meanings.set(m.gestureId, m));
        this.saveToStorage();
      }

      // Load mappings
      const storedMappings = localStorage.getItem(MAPPINGS_KEY);
      if (storedMappings) {
        const parsed = JSON.parse(storedMappings) as GestureSymbolMapping[];
        parsed.forEach(m => this.mappings.set(m.gestureLabel, m));
      }
    } catch (error) {
      console.warn('[GestureMeaning] Fehler beim Laden aus Storage:', error);
      DEFAULT_MEANINGS.forEach(m => this.meanings.set(m.gestureId, m));
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.meanings.values())));
      localStorage.setItem(MAPPINGS_KEY, JSON.stringify(Array.from(this.mappings.values())));
    } catch (error) {
      console.warn('[GestureMeaning] Fehler beim Speichern:', error);
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getMeaning(gestureId: string): GestureMeaning | undefined {
    return this.meanings.get(gestureId.toLowerCase());
  }

  getAllMeanings(): GestureMeaning[] {
    return Array.from(this.meanings.values()).sort((a, b) => a.priority - b.priority);
  }

  getMeaningsByCategory(category: string): GestureMeaning[] {
    return this.getAllMeanings().filter(m => m.category === category);
  }

  getCategories(): string[] {
    const categories = new Set(this.getAllMeanings().map(m => m.category));
    return Array.from(categories);
  }

  setMeaning(meaning: GestureMeaning): void {
    this.meanings.set(meaning.gestureId, meaning);
    this.saveToStorage();
    this.notify();
  }

  removeMeaning(gestureId: string): void {
    this.meanings.delete(gestureId);
    this.saveToStorage();
    this.notify();
  }

  getMapping(gestureLabel: string): GestureSymbolMapping | undefined {
    return this.mappings.get(gestureLabel.toLowerCase());
  }

  setMapping(mapping: GestureSymbolMapping): void {
    this.mappings.set(mapping.gestureLabel.toLowerCase(), {
      ...mapping,
      lastUsed: new Date().toISOString(),
    });
    this.saveToStorage();
    this.notify();
  }

  recordUsage(gestureLabel: string): void {
    const mapping = this.mappings.get(gestureLabel.toLowerCase());
    if (mapping) {
      mapping.lastUsed = new Date().toISOString();
      this.saveToStorage();
    }
  }

  getAudioText(gestureId: string): string {
    const meaning = this.getMeaning(gestureId);
    return meaning?.audioText ?? meaning?.label ?? gestureId;
  }

  reset(): void {
    this.meanings.clear();
    this.mappings.clear();
    DEFAULT_MEANINGS.forEach(m => this.meanings.set(m.gestureId, m));
    this.saveToStorage();
    this.notify();
  }
}

export const gestureMeaningService = new GestureMeaningService();
