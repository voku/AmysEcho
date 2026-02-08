import type { SentenceSymbol } from '../components/SentenceComposer';
import type { MetacomBoardDefinition } from '../types/metacom';

/**
 * Quick phrases for one-tap communication.
 * Each phrase produces a complete sentence that can be spoken immediately.
 */
export interface QuickPhrase {
  id: string;
  label: string;
  emoji: string;
  speech: string;
  /** Tags used for filtering by age and time of day */
  tags?: string[];
}

export const QUICK_PHRASES: QuickPhrase[] = [
  { id: 'qp_ja_bitte', label: 'Ja bitte', emoji: '👍', speech: 'Ja bitte', tags: ['core'] },
  { id: 'qp_nein_danke', label: 'Nein danke', emoji: '👎', speech: 'Nein danke', tags: ['core'] },
  { id: 'qp_ich_moechte_mehr', label: 'Ich möchte mehr', emoji: '➕', speech: 'Ich möchte mehr', tags: ['core'] },
  { id: 'qp_hilfe_bitte', label: 'Hilfe bitte', emoji: '🆘', speech: 'Hilfe bitte', tags: ['core'] },
  { id: 'qp_ich_bin_fertig', label: 'Ich bin fertig', emoji: '✅', speech: 'Ich bin fertig', tags: ['core'] },
  { id: 'qp_ich_bin_muede', label: 'Ich bin müde', emoji: '😴', speech: 'Ich bin müde', tags: ['core', 'evening'] },
  { id: 'qp_ich_habe_hunger', label: 'Ich habe Hunger', emoji: '😋', speech: 'Ich habe Hunger', tags: ['core', 'morning'] },
  { id: 'qp_ich_habe_durst', label: 'Ich habe Durst', emoji: '🥵', speech: 'Ich habe Durst', tags: ['core'] },
  { id: 'qp_ich_mag_das', label: 'Ich mag das', emoji: '❤️', speech: 'Ich mag das', tags: ['core'] },
  { id: 'qp_ich_mag_das_nicht', label: 'Ich mag das nicht', emoji: '💔', speech: 'Ich mag das nicht', tags: ['core'] },
  { id: 'qp_wo_ist_mama', label: 'Wo ist Mama?', emoji: '🔍', speech: 'Wo ist Mama?', tags: ['core'] },
  { id: 'qp_ich_will_spielen', label: 'Ich will spielen', emoji: '🧸', speech: 'Ich will spielen', tags: ['core', 'afternoon'] },
];

/**
 * Sentence flow rules define which board IDs are suggested as follow-up
 * when a specific symbol is selected. This enables the "layered text" system
 * where previous selections determine the next available options.
 */
const SENTENCE_FLOW_RULES: Record<string, string[]> = {
  // "Ich möchte" → show food, drink, play boards
  metacom_ich_moechte: ['essen', 'trinken', 'spielen'],
  // "Ich bin" → show feelings board
  metacom_ich_bin: ['gefuehle'],
  // "Ich mag" → show food, drink, play boards
  metacom_ich_mag: ['essen', 'trinken', 'spielen'],
  // "Kann ich" → show food, drink, play boards
  metacom_kann_ich: ['essen', 'trinken', 'spielen'],
  // "Wo ist" → show people board
  metacom_wo_ist: ['personen'],
  // "Ich brauche" → show food, drink boards
  metacom_ich_brauche: ['essen', 'trinken'],
  // "Das ist" → show feelings, people boards
  metacom_das_ist: ['gefuehle', 'personen'],
  // "Gib mir" → show food, drink boards
  metacom_gib_mir: ['essen', 'trinken'],
  // Person selections → suggest sentence starters or action boards
  metacom_ich: ['saetze'],
  metacom_mama: ['saetze'],
  metacom_papa: ['saetze'],
};

export interface SentenceFlowSuggestion {
  boardId: string;
  label: string;
  emoji: string;
}

/** Fallback emoji when a board has no cells with an emoji to derive from. */
const FALLBACK_EMOJI = '📋';

/**
 * Derives display info (label, emoji) for a board from the loaded board definitions.
 * Uses the board's own label plus the emoji from its first cell as a representative icon.
 * This ensures imported Metacom bundles show correct labels/emojis.
 */
function getBoardDisplay(
  boardId: string,
  boards: Record<string, MetacomBoardDefinition>,
): { label: string; emoji: string } | null {
  const board = boards[boardId];
  if (!board) return null;
  const firstCell = board.cells[0];
  return {
    label: board.label,
    emoji: firstCell?.emoji ?? FALLBACK_EMOJI,
  };
}

/**
 * Returns suggested follow-up boards based on the last symbol in the
 * sentence queue. This creates the "layered text" experience where
 * each selection narrows the next options logically.
 *
 * When `boards` is provided, display info is derived from the actual loaded
 * board definitions so that imported Metacom bundles show correct labels.
 */
export function getSentenceFlowSuggestions(
  queue: SentenceSymbol[],
  boards?: Record<string, MetacomBoardDefinition>,
): SentenceFlowSuggestion[] {
  if (queue.length === 0) return [];
  const lastSymbol = queue[queue.length - 1];
  if (!lastSymbol) return [];

  const suggestedBoardIds = SENTENCE_FLOW_RULES[lastSymbol.id];
  if (!suggestedBoardIds || suggestedBoardIds.length === 0) return [];

  return suggestedBoardIds
    .map((boardId) => {
      if (boards) {
        const display = getBoardDisplay(boardId, boards);
        if (!display) return null;
        return { boardId, label: display.label, emoji: display.emoji };
      }
      // Fallback when no boards provided (e.g. in tests without board context)
      return { boardId, label: boardId, emoji: FALLBACK_EMOJI };
    })
    .filter((s): s is SentenceFlowSuggestion => s !== null);
}

/**
 * Converts a quick phrase into sentence symbols for the sentence queue.
 */
export function quickPhraseToSentenceSymbols(phrase: QuickPhrase): SentenceSymbol[] {
  return phrase.speech.split(' ').map((word, index) => ({
    id: `${phrase.id}_word_${index}`,
    label: word,
    emoji: index === 0 ? phrase.emoji : '',
  }));
}
