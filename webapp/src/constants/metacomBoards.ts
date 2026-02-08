import type { MetacomBoardDefinition, MetacomCell } from '../types/metacom';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';
import boardData from '../data/metacomBoardData.json';

type BoardDataKey = keyof typeof boardData.boards;

type RawBoardEntry = {
  id?: string;
  label?: string;
  rows?: number;
  columns?: number;
  cells: unknown[];
};

// Cell structure is guaranteed by metacomBoardData.test.ts which validates
// every cell has the required fields (id, label, emoji, position, type)
// and board cells have targetBoardId.
function castCells(raw: unknown[]): MetacomCell[] {
  return raw as MetacomCell[];
}

function loadBoard(key: BoardDataKey): MetacomBoardDefinition {
  const raw = boardData.boards[key] as RawBoardEntry | undefined;
  if (!raw || !raw.id || !raw.label || !raw.rows || !raw.columns) {
    throw new Error(`Board data missing for key "${key}"`);
  }
  return {
    id: raw.id,
    label: raw.label,
    rows: raw.rows,
    columns: raw.columns,
    cells: castCells(raw.cells),
  };
}

function loadExtraCells(key: BoardDataKey): MetacomCell[] {
  const raw = boardData.boards[key] as { cells: unknown[] } | undefined;
  if (!raw) return [];
  return castCells(raw.cells);
}

const START_BOARD = loadBoard('start');

const EXTENDED_START_BOARD: MetacomBoardDefinition = {
  ...START_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...START_BOARD.cells,
    ...loadExtraCells('start_extended_extra'),
  ],
};

const FULL_START_BOARD: MetacomBoardDefinition = {
  ...EXTENDED_START_BOARD,
  rows: 5,
  columns: 4,
  cells: [
    ...EXTENDED_START_BOARD.cells,
    ...loadExtraCells('start_full_extra'),
  ],
};

const ESSEN_BOARD = loadBoard('essen');

const FULL_ESSEN_BOARD: MetacomBoardDefinition = {
  ...ESSEN_BOARD,
  cells: [
    ...ESSEN_BOARD.cells,
    ...loadExtraCells('essen_full_extra'),
  ],
};

const PIZZA_BOARD = loadBoard('pizza');
const TRINKEN_BOARD = loadBoard('trinken');

const FULL_TRINKEN_BOARD: MetacomBoardDefinition = {
  ...TRINKEN_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...TRINKEN_BOARD.cells,
    ...loadExtraCells('trinken_full_extra'),
  ],
};

const SPIELEN_BOARD = loadBoard('spielen');

const FULL_SPIELEN_BOARD: MetacomBoardDefinition = {
  ...SPIELEN_BOARD,
  rows: 4,
  columns: 4,
  cells: [
    ...SPIELEN_BOARD.cells,
    ...loadExtraCells('spielen_full_extra'),
  ],
};

const GEFUEHLE_BOARD = loadBoard('gefuehle');
const PERSONEN_BOARD = loadBoard('personen');
const SAETZE_BOARD = loadBoard('saetze');

export const METACOM_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: START_BOARD,
  essen: ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: TRINKEN_BOARD,
  spielen: SPIELEN_BOARD,
  gefuehle: GEFUEHLE_BOARD,
  personen: PERSONEN_BOARD,
  saetze: SAETZE_BOARD,
};

const EXTENDED_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: EXTENDED_START_BOARD,
  essen: ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: TRINKEN_BOARD,
  spielen: SPIELEN_BOARD,
  gefuehle: GEFUEHLE_BOARD,
  personen: PERSONEN_BOARD,
  saetze: SAETZE_BOARD,
};

const FULL_BOARDS: Record<string, MetacomBoardDefinition> = {
  start: FULL_START_BOARD,
  essen: FULL_ESSEN_BOARD,
  pizza: PIZZA_BOARD,
  trinken: FULL_TRINKEN_BOARD,
  spielen: FULL_SPIELEN_BOARD,
  gefuehle: GEFUEHLE_BOARD,
  personen: PERSONEN_BOARD,
  saetze: SAETZE_BOARD,
};

const EINSTEIGER_IDS = new Set(boardData.einsteigerIds);

function filterBoardCells(
  board: MetacomBoardDefinition,
  allowedIds: Set<string>,
): MetacomBoardDefinition {
  const cells = board.cells
    .filter((cell) => allowedIds.has(cell.id))
    .sort((a, b) => a.position - b.position)
    .map((cell, index) => ({ ...cell, position: index }));
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
