/**
 * Custom Sign Language Sign Registry
 * Manages user-defined custom Deutsche Gebärdensprache (DGS) signs for personalized recognition.
 * Each sign requires training data before it can be recognized by the MLP classifier.
 */

export interface CustomGesture {
  id: string;
  profileId: string;
  name: string;
  label: string; // The DGS sign name/label for recognition
  description?: string;
  emoji?: string;
  category: string;
  status: 'draft' | 'training' | 'active' | 'disabled';
  minConfidenceThreshold: number;
  trainingSamplesCount: number; // Number of training samples collected for this DGS sign
  createdAt: string;
  updatedAt: string;
  lastRecognizedAt?: string;
}

const STORAGE_KEY = 'customGestures';

/**
 * Manages custom DGS (Deutsche Gebärdensprache) signs.
 * 
 * Signs go through phases:
 * 1. draft - Just registered, needs training samples
 * 2. training - Has some samples (3+), collecting more
 * 3. active - Has enough samples (10+), ready for recognition
 * 4. disabled - Temporarily deactivated
 */
class CustomGestureRegistry {
  private gestures: Map<string, CustomGesture> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomGesture[];
        parsed.forEach(g => this.gestures.set(g.id, g));
      }
    } catch (error) {
      console.warn('[CustomGestureRegistry] Fehler beim Laden:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.gestures.values())));
    } catch (error) {
      console.warn('[CustomGestureRegistry] Fehler beim Speichern:', error);
    }
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  private generateId(): string {
    return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Register a new custom DGS sign.
   * The sign starts in 'draft' status and requires training samples before it can be recognized.
   */
  register(params: {
    profileId: string;
    name: string;
    label: string;
    description?: string;
    emoji?: string;
    category?: string;
  }): CustomGesture {
    const now = new Date().toISOString();
    const gesture: CustomGesture = {
      id: this.generateId(),
      profileId: params.profileId,
      name: params.name,
      label: params.label,
      ...(params.description !== undefined ? { description: params.description } : {}),
      emoji: params.emoji ?? '✋',
      category: params.category ?? 'benutzerdefiniert',
      status: 'draft',
      minConfidenceThreshold: 0.7,
      trainingSamplesCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.gestures.set(gesture.id, gesture);
    this.saveToStorage();
    this.notify();
    return gesture;
  }

  get(id: string): CustomGesture | undefined {
    return this.gestures.get(id);
  }

  getByProfile(profileId: string): CustomGesture[] {
    return Array.from(this.gestures.values())
      .filter(g => g.profileId === profileId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getActiveByProfile(profileId: string): CustomGesture[] {
    return this.getByProfile(profileId).filter(g => g.status === 'active');
  }

  getByLabel(label: string, profileId?: string): CustomGesture | undefined {
    const gestures = profileId ? this.getByProfile(profileId) : Array.from(this.gestures.values());
    return gestures.find(g => g.label.toLowerCase() === label.toLowerCase());
  }

  update(id: string, updates: Partial<Omit<CustomGesture, 'id' | 'profileId' | 'createdAt'>>): CustomGesture | null {
    const gesture = this.gestures.get(id);
    if (!gesture) return null;

    const updated: CustomGesture = {
      ...gesture,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.gestures.set(id, updated);
    this.saveToStorage();
    this.notify();
    return updated;
  }

  /**
   * Increment training sample count for a DGS sign.
   * Automatically transitions sign status based on sample count:
   * - 3+ samples: draft → training
   * - 10+ samples: training → active (ready for recognition)
   */
  incrementTrainingSamples(id: string): void {
    const gesture = this.gestures.get(id);
    if (gesture) {
      gesture.trainingSamplesCount += 1;
      gesture.updatedAt = new Date().toISOString();
      
      // Auto-activate after 10 samples
      if (gesture.trainingSamplesCount >= 10 && gesture.status === 'training') {
        gesture.status = 'active';
      } else if (gesture.trainingSamplesCount >= 3 && gesture.status === 'draft') {
        gesture.status = 'training';
      }
      
      this.saveToStorage();
      this.notify();
    }
  }

  recordRecognition(id: string): void {
    const gesture = this.gestures.get(id);
    if (gesture) {
      gesture.lastRecognizedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  setStatus(id: string, status: CustomGesture['status']): void {
    this.update(id, { status });
  }

  delete(id: string): boolean {
    const deleted = this.gestures.delete(id);
    if (deleted) {
      this.saveToStorage();
      this.notify();
    }
    return deleted;
  }

  deleteByProfile(profileId: string): number {
    const toDelete = this.getByProfile(profileId).map(g => g.id);
    toDelete.forEach(id => this.gestures.delete(id));
    if (toDelete.length > 0) {
      this.saveToStorage();
      this.notify();
    }
    return toDelete.length;
  }

  getAll(): CustomGesture[] {
    return Array.from(this.gestures.values());
  }

  clear(): void {
    this.gestures.clear();
    this.saveToStorage();
    this.notify();
  }
}

export const customGestureRegistry = new CustomGestureRegistry();
