import type { MetacomCell, MetacomSymbolRole } from '../types/metacom';

export type SentenceQueueItem = {
  label: string;
  role?: MetacomSymbolRole;
};

export type RecommendationContext = {
  childAge: number | null;
  lastSentence: string | null;
  lastSentenceAt: number | null;
  now: Date;
};

type RecommendationOptions = {
  cells: MetacomCell[];
  queue: SentenceQueueItem[];
  context: RecommendationContext;
  maxRecommendations?: number;
};

const ROLE_FOLLOW_UP: Partial<Record<MetacomSymbolRole, MetacomSymbolRole>> = {
  person: 'action',
  action: 'object',
  object: 'modifier',
  modifier: 'action',
  negation: 'action',
};

// Wichtig: Diese Listen müssen mit den Metacom-Board-Labels synchron bleiben.
const CORE_WORDS = ['ich', 'du', 'bitte', 'danke', 'mehr', 'ja', 'nein', 'hilfe'];
const OLDER_WORDS = ['brot', 'wasser', 'ball', 'buch', 'puzzle', 'musik', 'malen'];
const MORNING_WORDS = ['essen', 'trinken', 'mehr', 'bitte'];
const AFTERNOON_WORDS = ['spielen', 'ball', 'malen', 'mehr'];
const EVENING_WORDS = ['fertig', 'danke', 'bitte'];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getCellSpokenLabel(cell: MetacomCell): string {
  return normalize(cell.speech ?? cell.label);
}

function getTargetRole(queue: SentenceQueueItem[]): MetacomSymbolRole | null {
  if (queue.length === 0) return null;
  const last = queue[queue.length - 1];
  if (!last?.role) return null;
  return ROLE_FOLLOW_UP[last.role] ?? null;
}

function getTimeOfDayLabel(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'am Morgen';
  if (hour >= 11 && hour < 16) return 'am Nachmittag';
  if (hour >= 16 && hour < 21) return 'am Abend';
  return 'spät am Tag';
}

function formatLastSentence(context: RecommendationContext): string | null {
  if (!context.lastSentence) return null;
  const trimmed = context.lastSentence.trim();
  if (!trimmed) return null;
  if (!context.lastSentenceAt) {
    return `zuletzt „${trimmed}“`;
  }
  const minutes = Math.max(0, Math.round((context.now.getTime() - context.lastSentenceAt) / 60000));
  if (minutes <= 2) {
    return `gerade „${trimmed}“`;
  }
  if (minutes <= 30) {
    return `vor ${minutes} Min.: „${trimmed}“`;
  }
  return `zuletzt „${trimmed}“`;
}

export function buildNextWordLabel(context: RecommendationContext): string {
  const segments: string[] = ['Nächste Wörter'];
  if (typeof context.childAge === 'number') {
    segments.push(`für ${context.childAge} Jahre`);
  }
  segments.push(getTimeOfDayLabel(context.now));
  const lastSentenceLabel = formatLastSentence(context);
  if (lastSentenceLabel) segments.push(lastSentenceLabel);
  return segments.join(' · ');
}

function getAgePreferredWords(childAge: number | null): string[] {
  if (typeof childAge !== 'number') return CORE_WORDS;
  if (childAge <= 6) return CORE_WORDS;
  return [...CORE_WORDS, ...OLDER_WORDS];
}

function getTimePreferredWords(now: Date): string[] {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return MORNING_WORDS;
  if (hour >= 11 && hour < 16) return AFTERNOON_WORDS;
  if (hour >= 16 && hour < 21) return EVENING_WORDS;
  return ['fertig', 'bitte'];
}

export function getNextWordRecommendations({
  cells,
  queue,
  context,
  maxRecommendations = 3,
}: RecommendationOptions): MetacomCell[] {
  if (queue.length === 0) return [];

  const targetRole = getTargetRole(queue);
  const agePreferred = new Set(getAgePreferredWords(context.childAge));
  const timePreferred = new Set(getTimePreferredWords(context.now));
  const lastSentenceWords = new Set(
    context.lastSentence ? context.lastSentence.split(/\s+/).map(normalize) : [],
  );
  const queueLabels = new Set(queue.map((item) => normalize(item.label)));

  const scored = cells
    .filter((cell) => !queueLabels.has(getCellSpokenLabel(cell)))
    .map((cell) => {
      const label = getCellSpokenLabel(cell);
      let score = 0;
      if (targetRole && cell.role === targetRole) score += 2;
      if (agePreferred.has(label)) score += 1;
      if (timePreferred.has(label)) score += 1;
      if (lastSentenceWords.has(label)) score += 0.5;
      return { cell, score, label };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label, 'de');
    });

  const unique = new Map<string, MetacomCell>();
  for (const item of scored) {
    const label = getCellSpokenLabel(item.cell);
    if (!unique.has(label)) {
      unique.set(label, item.cell);
    }
    if (unique.size >= maxRecommendations) {
      break;
    }
  }

  return Array.from(unique.values());
}
