import type { MetacomBoardDefinition } from '../types/metacom';

const START_BOARD: MetacomBoardDefinition = {
  id: 'start',
  label: 'Starttafel',
  rows: 3,
  columns: 4,
  cells: [
    { id: 'metacom_ich', label: 'Ich', emoji: '👤', position: 0, type: 'symbol' },
    { id: 'metacom_du', label: 'Du', emoji: '🫵', position: 1, type: 'symbol' },
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
      emoji: '🍎',
      position: 9,
      type: 'board',
      targetBoardId: 'essen',
      category: 'essen',
    },
    {
      id: 'metacom_board_trinken',
      label: 'Trinken',
      emoji: '🥛',
      position: 10,
      type: 'board',
      targetBoardId: 'trinken',
      category: 'trinken',
    },
    {
      id: 'metacom_board_spielen',
      label: 'Spielen',
      emoji: '🧸',
      position: 11,
      type: 'board',
      targetBoardId: 'spielen',
      category: 'spielen',
    },
  ],
};

const ESSEN_BOARD: MetacomBoardDefinition = {
  id: 'essen',
  label: 'Essen',
  rows: 3,
  columns: 4,
  cells: [
    { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎', position: 0, type: 'symbol', category: 'essen' },
    { id: 'metacom_brot', label: 'Brot', emoji: '🍞', position: 1, type: 'symbol', category: 'essen' },
    { id: 'metacom_banane', label: 'Banane', emoji: '🍌', position: 2, type: 'symbol', category: 'essen' },
    { id: 'metacom_joghurt', label: 'Joghurt', emoji: '🥣', position: 3, type: 'symbol', category: 'essen' },
    { id: 'metacom_kaese', label: 'Käse', emoji: '🧀', position: 4, type: 'symbol', category: 'essen' },
    { id: 'metacom_reis', label: 'Reis', emoji: '🍚', position: 5, type: 'symbol', category: 'essen' },
    { id: 'metacom_suppe', label: 'Suppe', emoji: '🥣', position: 6, type: 'symbol', category: 'essen' },
    { id: 'metacom_kartoffeln', label: 'Kartoffeln', emoji: '🥔', position: 7, type: 'symbol', category: 'essen' },
    { id: 'metacom_mehr_essen', label: 'Mehr', emoji: '➕', position: 8, type: 'symbol' },
    { id: 'metacom_fertig_essen', label: 'Fertig', emoji: '✅', position: 9, type: 'symbol' },
    { id: 'metacom_bitte_essen', label: 'Bitte', emoji: '🙏', position: 10, type: 'symbol' },
    { id: 'metacom_danke_essen', label: 'Danke', emoji: '💛', position: 11, type: 'symbol' },
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

export const METACOM_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: START_BOARD,
  essen: ESSEN_BOARD,
  trinken: TRINKEN_BOARD,
  spielen: SPIELEN_BOARD,
};
