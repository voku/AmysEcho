import type { MetacomBoardDefinition } from '../types/metacom';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';

const START_BOARD: MetacomBoardDefinition = {
  id: 'start',
  label: 'Starttafel',
  rows: 3,
  columns: 4,
  cells: [
    { id: 'metacom_ich', label: 'Ich', emoji: '👤', position: 0, type: 'symbol', role: 'person' },
    { id: 'metacom_du', label: 'Du', emoji: '🫵', position: 1, type: 'symbol', role: 'person' },
    { id: 'metacom_mehr', label: 'Mehr', emoji: '➕', position: 2, type: 'symbol' },
    { id: 'metacom_fertig', label: 'Fertig', emoji: '✅', position: 3, type: 'symbol' },
    { id: 'metacom_ja', label: 'Ja', emoji: '👍', position: 4, type: 'symbol' },
    { id: 'metacom_nein', label: 'Nein', emoji: '👎', position: 5, type: 'symbol' },
    { id: 'metacom_bitte', label: 'Bitte', emoji: '🙏', position: 6, type: 'symbol' },
    { id: 'metacom_danke', label: 'Danke', emoji: '💛', position: 7, type: 'symbol' },
    { id: 'metacom_hilfe', label: 'Hilfe', emoji: '🆘', position: 8, type: 'symbol', color: '#FFC9DE' },
    {
      id: 'metacom_board_essen',
      label: 'Essen',
      speech: 'Essen',
      emoji: '🍎',
      position: 9,
      type: 'board',
      targetBoardId: 'essen',
      category: 'essen',
      role: 'action',
    },
    {
      id: 'metacom_board_trinken',
      label: 'Trinken',
      speech: 'Trinken',
      emoji: '🥛',
      position: 10,
      type: 'board',
      targetBoardId: 'trinken',
      category: 'trinken',
      role: 'action',
    },
    {
      id: 'metacom_board_spielen',
      label: 'Spielen',
      speech: 'Spielen',
      emoji: '🧸',
      position: 11,
      type: 'board',
      targetBoardId: 'spielen',
      category: 'spielen',
      role: 'action',
    },
  ],
};

const EXTENDED_START_BOARD: MetacomBoardDefinition = {
  ...START_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...START_BOARD.cells,
    { id: 'metacom_nicht', label: 'Nicht', emoji: '🚫', position: 12, type: 'symbol', role: 'negation' },
    { id: 'metacom_noch', label: 'Noch', emoji: '🔁', position: 13, type: 'symbol', role: 'modifier' },
    { id: 'metacom_was', label: 'Was', emoji: '❓', position: 14, type: 'symbol', role: 'modifier' },
    { id: 'metacom_warum', label: 'Warum', emoji: '🤔', position: 15, type: 'symbol', role: 'modifier' },
  ],
};

const ESSEN_BOARD: MetacomBoardDefinition = {
  id: 'essen',
  label: 'Essen',
  rows: 4,
  columns: 4,
  cells: [
    { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎', position: 0, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_brot', label: 'Brot', emoji: '🍞', position: 1, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_banane', label: 'Banane', emoji: '🍌', position: 2, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_joghurt', label: 'Joghurt', emoji: '🥣', position: 3, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_kaese', label: 'Käse', emoji: '🧀', position: 4, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_reis', label: 'Reis', emoji: '🍚', position: 5, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_suppe', label: 'Suppe', emoji: '🥣', position: 6, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_kartoffeln', label: 'Kartoffeln', emoji: '🥔', position: 7, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_nudeln', label: 'Nudeln', emoji: '🍝', position: 8, type: 'symbol', category: 'essen', role: 'object' },
    {
      id: 'metacom_board_pizza',
      label: 'Pizza',
      speech: 'Pizza',
      emoji: '🍕',
      position: 9,
      type: 'board',
      targetBoardId: 'pizza',
      category: 'essen',
      role: 'object',
    },
    // Positions 10-11 reserved for future food items (deliberately skipped in position sequence)
    { id: 'metacom_mehr_essen', label: 'Mehr', emoji: '➕', position: 12, type: 'symbol', role: 'modifier' },
    { id: 'metacom_fertig_essen', label: 'Fertig', emoji: '✅', position: 13, type: 'symbol' },
    { id: 'metacom_bitte_essen', label: 'Bitte', emoji: '🙏', position: 14, type: 'symbol' },
    { id: 'metacom_danke_essen', label: 'Danke', emoji: '💛', position: 15, type: 'symbol' },
  ],
};

const FULL_ESSEN_BOARD: MetacomBoardDefinition = {
  ...ESSEN_BOARD,
  cells: [
    ...ESSEN_BOARD.cells,
    { id: 'metacom_gemuese', label: 'Gemüse', emoji: '🥕', position: 10, type: 'symbol', category: 'essen', role: 'object' },
    { id: 'metacom_obst', label: 'Obst', emoji: '🍓', position: 11, type: 'symbol', category: 'essen', role: 'object' },
  ],
};

const PIZZA_BOARD: MetacomBoardDefinition = {
  id: 'pizza',
  label: 'Pizza',
  rows: 2,
  columns: 3,
  cells: [
    // Pizza customization board - positions 3-5 reserved for future topping options
    { id: 'metacom_pizza_ohne_kaese', label: 'Ohne Käse', emoji: '🧀', position: 0, type: 'symbol', category: 'essen', role: 'modifier' },
    { id: 'metacom_pizza_mit_kaese', label: 'Mit Käse', emoji: '🧀', position: 1, type: 'symbol', category: 'essen', role: 'modifier' },
    { id: 'metacom_pizza_extra_sosse', label: 'Extra Soße', emoji: '🍅', position: 2, type: 'symbol', category: 'essen', role: 'modifier' },
  ],
};

const TRINKEN_BOARD: MetacomBoardDefinition = {
  id: 'trinken',
  label: 'Trinken',
  rows: 3,
  columns: 4,
  cells: [
    { id: 'metacom_wasser', label: 'Wasser', emoji: '💧', position: 0, type: 'symbol', category: 'trinken' },
    { id: 'metacom_saft', label: 'Saft', emoji: '🧃', position: 1, type: 'symbol', category: 'trinken' },
    { id: 'metacom_milch', label: 'Milch', emoji: '🥛', position: 2, type: 'symbol', category: 'trinken' },
    { id: 'metacom_tee', label: 'Tee', emoji: '🍵', position: 3, type: 'symbol', category: 'trinken' },
    { id: 'metacom_kalt', label: 'Kalt', emoji: '🧊', position: 4, type: 'symbol', category: 'trinken' },
    { id: 'metacom_warm', label: 'Warm', emoji: '☀️', position: 5, type: 'symbol', category: 'trinken' },
    { id: 'metacom_strohhalm', label: 'Strohhalm', emoji: '🥤', position: 6, type: 'symbol', category: 'trinken' },
    { id: 'metacom_fläschchen', label: 'Fläschchen', emoji: '🍼', position: 7, type: 'symbol', category: 'trinken' },
    { id: 'metacom_mehr_trinken', label: 'Mehr', emoji: '➕', position: 8, type: 'symbol' },
    { id: 'metacom_fertig_trinken', label: 'Fertig', emoji: '✅', position: 9, type: 'symbol' },
    { id: 'metacom_bitte_trinken', label: 'Bitte', emoji: '🙏', position: 10, type: 'symbol' },
    { id: 'metacom_danke_trinken', label: 'Danke', emoji: '💛', position: 11, type: 'symbol' },
  ],
};

const FULL_TRINKEN_BOARD: MetacomBoardDefinition = {
  ...TRINKEN_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...TRINKEN_BOARD.cells,
    { id: 'metacom_kakao', label: 'Kakao', emoji: '🍫', position: 12, type: 'symbol', category: 'trinken' },
    { id: 'metacom_sprudel', label: 'Sprudel', emoji: '🫧', position: 13, type: 'symbol', category: 'trinken' },
    { id: 'metacom_becher', label: 'Becher', emoji: '🥤', position: 14, type: 'symbol', category: 'trinken' },
    { id: 'metacom_eisgetraenk', label: 'Eisgetränk', emoji: '🧊', position: 15, type: 'symbol', category: 'trinken' },
  ],
};

const SPIELEN_BOARD: MetacomBoardDefinition = {
  id: 'spielen',
  label: 'Spielen',
  rows: 3,
  columns: 4,
  cells: [
    { id: 'metacom_ball', label: 'Ball', emoji: '⚽', position: 0, type: 'symbol', category: 'spielen' },
    { id: 'metacom_buch', label: 'Buch', emoji: '📚', position: 1, type: 'symbol', category: 'spielen' },
    { id: 'metacom_malen', label: 'Malen', emoji: '🎨', position: 2, type: 'symbol', category: 'spielen' },
    { id: 'metacom_musik', label: 'Musik', emoji: '🎵', position: 3, type: 'symbol', category: 'spielen' },
    { id: 'metacom_puzzle', label: 'Puzzle', emoji: '🧩', position: 4, type: 'symbol', category: 'spielen' },
    { id: 'metacom_bauen', label: 'Bauen', emoji: '🧱', position: 5, type: 'symbol', category: 'spielen' },
    { id: 'metacom_tanzen', label: 'Tanzen', emoji: '💃', position: 6, type: 'symbol', category: 'spielen' },
    { id: 'metacom_raus', label: 'Rausgehen', emoji: '🌳', position: 7, type: 'symbol', category: 'spielen' },
    { id: 'metacom_mehr_spielen', label: 'Mehr', emoji: '➕', position: 8, type: 'symbol' },
    { id: 'metacom_fertig_spielen', label: 'Fertig', emoji: '✅', position: 9, type: 'symbol' },
    { id: 'metacom_bitte_spielen', label: 'Bitte', emoji: '🙏', position: 10, type: 'symbol' },
    { id: 'metacom_danke_spielen', label: 'Danke', emoji: '💛', position: 11, type: 'symbol' },
  ],
};

const FULL_SPIELEN_BOARD: MetacomBoardDefinition = {
  ...SPIELEN_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...SPIELEN_BOARD.cells,
    { id: 'metacom_auto', label: 'Auto', emoji: '🚗', position: 12, type: 'symbol', category: 'spielen' },
    { id: 'metacom_bausteine', label: 'Bausteine', emoji: '🧱', position: 13, type: 'symbol', category: 'spielen' },
    { id: 'metacom_kuscheln', label: 'Kuscheln', emoji: '🤗', position: 14, type: 'symbol', category: 'spielen' },
    { id: 'metacom_rennen', label: 'Rennen', emoji: '🏃', position: 15, type: 'symbol', category: 'spielen' },
  ],
};

export const METACOM_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: START_BOARD,
  essen: ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: TRINKEN_BOARD,
  spielen: SPIELEN_BOARD,
};

const EXTENDED_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: EXTENDED_START_BOARD,
  essen: ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: TRINKEN_BOARD,
  spielen: SPIELEN_BOARD,
};

const FULL_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: EXTENDED_START_BOARD,
  essen: FULL_ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: FULL_TRINKEN_BOARD,
  spielen: FULL_SPIELEN_BOARD,
};

const EINSTEIGER_IDS = new Set([
  'metacom_ich',
  'metacom_du',
  'metacom_ja',
  'metacom_nein',
  'metacom_hilfe',
  'metacom_board_essen',
  'metacom_board_trinken',
  'metacom_board_spielen',
]);

function filterBoardCells(
  board: MetacomBoardDefinition,
  allowedIds: Set<string>,
): MetacomBoardDefinition {
  const cells = board.cells.filter((cell) => allowedIds.has(cell.id));
  return {
    ...board,
    cells,
  };
}

function filterEinsteigerBoards(boards: Record<string, MetacomBoardDefinition>) {
  const startBoard = boards['start'];
  if (!startBoard) return boards;
  return {
    ...boards,
    start: {
      ...filterBoardCells(startBoard, EINSTEIGER_IDS),
      rows: 2,
      columns: 4,
    },
  };
}

export function getMetacomBoardsForVocabularySet(
  vocabularySet: MetacomVocabularySet,
): Record<string, MetacomBoardDefinition> {
  if (vocabularySet === 'einsteiger') {
    return filterEinsteigerBoards(METACOM_BOARDS);
  }
  if (vocabularySet === 'erweitert') {
    return EXTENDED_BOARDS;
  }
  if (vocabularySet === 'voll') {
    return FULL_BOARDS;
  }
  return METACOM_BOARDS;
}
