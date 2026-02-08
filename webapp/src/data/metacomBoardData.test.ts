import { describe, expect, it } from 'vitest';
import boardData from './metacomBoardData.json';

describe('metacomBoardData.json', () => {
  const FULL_BOARD_KEYS = [
    'start',
    'essen',
    'pizza',
    'trinken',
    'spielen',
    'gefuehle',
    'personen',
    'saetze',
  ];

  it('contains all required board definitions', () => {
    for (const key of FULL_BOARD_KEYS) {
      const board = boardData.boards[key as keyof typeof boardData.boards];
      expect(board, `board "${key}" should exist`).toBeDefined();
      expect(board.cells.length, `board "${key}" should have cells`).toBeGreaterThan(0);
    }
  });

  it('each full board has id, label, rows, and columns', () => {
    for (const key of FULL_BOARD_KEYS) {
      const board = boardData.boards[key as keyof typeof boardData.boards] as {
        id?: string;
        label?: string;
        rows?: number;
        columns?: number;
        cells: unknown[];
      };
      expect(board.id, `board "${key}" should have an id`).toBeTruthy();
      expect(board.label, `board "${key}" should have a label`).toBeTruthy();
      expect(board.rows, `board "${key}" should have rows`).toBeGreaterThan(0);
      expect(board.columns, `board "${key}" should have columns`).toBeGreaterThan(0);
    }
  });

  it('every cell has id, label, emoji, position, and type', () => {
    for (const [key, board] of Object.entries(boardData.boards)) {
      for (const cell of board.cells) {
        const c = cell as { id?: string; label?: string; emoji?: string; position?: number; type?: string };
        expect(c.id, `cell in "${key}" missing id`).toBeTruthy();
        expect(c.label, `cell in "${key}" missing label`).toBeTruthy();
        expect(c.emoji, `cell in "${key}" missing emoji`).toBeTruthy();
        expect(typeof c.position, `cell "${c.id}" in "${key}" has non-number position`).toBe('number');
        expect(['symbol', 'board'], `cell "${c.id}" in "${key}" has invalid type "${c.type}"`).toContain(c.type);
      }
    }
  });

  it('board cells have targetBoardId when type is board', () => {
    for (const [key, board] of Object.entries(boardData.boards)) {
      for (const cell of board.cells) {
        const c = cell as { id?: string; type?: string; targetBoardId?: string };
        if (c.type === 'board') {
          expect(c.targetBoardId, `board cell "${c.id}" in "${key}" missing targetBoardId`).toBeTruthy();
        }
      }
    }
  });

  it('cell ids are unique within each board', () => {
    for (const [key, board] of Object.entries(boardData.boards)) {
      const ids = board.cells.map((c) => (c as { id: string }).id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size, `board "${key}" has duplicate cell ids`).toBe(ids.length);
    }
  });

  it('einsteigerIds contains valid symbol IDs from the start board', () => {
    expect(boardData.einsteigerIds.length).toBeGreaterThan(0);
    const startCellIds = new Set(
      boardData.boards.start.cells.map((c) => (c as { id: string }).id),
    );
    for (const id of boardData.einsteigerIds) {
      expect(startCellIds.has(id), `einsteiger id "${id}" not found in start board`).toBe(true);
    }
  });
});
