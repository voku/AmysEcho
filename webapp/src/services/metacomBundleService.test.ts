import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  clearMetacomBundle,
  loadMetacomBoards,
  parseMetacomBundle,
  storeMetacomBundle,
} from './metacomBundleService';

const validBundle = JSON.stringify({
  version: '1.0',
  boards: [
    {
      id: 'start',
      label: 'Starttafel',
      rows: 1,
      columns: 2,
      cells: [
        { id: 'metacom_ja', label: 'Ja', emoji: '👍', position: 0, type: 'symbol' },
        {
          id: 'metacom_board_essen',
          label: 'Essen',
          emoji: '🍎',
          position: 1,
          type: 'board',
          targetBoardId: 'essen',
        },
      ],
    },
    {
      id: 'essen',
      label: 'Essen',
      rows: 1,
      columns: 1,
      cells: [
        { id: 'metacom_apfel', label: 'Apfel', emoji: '🍎', position: 0, type: 'symbol' },
      ],
    },
  ],
});

const openBoardBundle = JSON.stringify({
  format: 'open-board-0.1',
  id: 'start',
  name: 'Start',
  grid: { rows: 1, columns: 2 },
  buttons: [
    { id: 'ja', label: 'Ja', position: 0 },
    {
      id: 'essen',
      label: 'Essen',
      position: 1,
      actions: [{ type: 'open_board', board_id: 'essen' }],
    },
  ],
});

const openBoardSet = JSON.stringify({
  boards: [
    {
      format: 'open-board-0.1',
      id: 'start',
      name: 'Start',
      grid: { rows: 1, columns: 2 },
      buttons: [
        { id: 'ja', label: 'Ja', position: 0 },
        {
          id: 'essen',
          label: 'Essen',
          position: 1,
          actions: [{ action: 'switch_board', destination: 'essen' }],
        },
      ],
    },
    {
      format: 'open-board-0.1',
      id: 'essen',
      name: 'Essen',
      grid: { rows: 1, columns: 1 },
      buttons: [{ id: 'apfel', label: 'Apfel', position: 0 }],
    },
  ],
});

const openBoardOrderBundle = JSON.stringify({
  format: 'open-board-0.1',
  id: 'start',
  name: 'Simple Board',
  grid: {
    rows: 2,
    columns: 2,
    order: [
      [1, 2],
      [null, null],
    ],
  },
  buttons: [
    { id: 1, label: 'Happy' },
    { id: 2, label: 'Sad', hidden: true },
  ],
});

describe('metacomBundleService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearMetacomBundle();
  });

  it('parses a valid bundle', () => {
    const parsed = parseMetacomBundle(validBundle);
    expect(parsed.version).toBe('1.0');
    expect(parsed.boards).toHaveLength(2);
  });

  it('stores and loads boards from local storage', () => {
    const stored = storeMetacomBundle(validBundle);
    expect(stored.start).toBeDefined();
    const loaded = loadMetacomBoards();
    expect(loaded.start.label).toBe('Starttafel');
  });

  it('accepts Open Board Format bundles', () => {
    const stored = storeMetacomBundle(openBoardBundle);
    expect(stored.start.label).toBe('Start');
  });

  it('maps Open Board navigation actions to board cells', () => {
    const stored = storeMetacomBundle(openBoardSet);
    expect(stored.start.cells[1]?.type).toBe('board');
    expect(stored.start.cells[1]?.targetBoardId).toBe('essen');
  });

  it('uses grid order positioning and skips hidden buttons', () => {
    const stored = storeMetacomBundle(openBoardOrderBundle);
    expect(stored.start.cells).toHaveLength(1);
    expect(stored.start.cells[0]?.position).toBe(0);
  });

  it('throws on invalid bundles', () => {
    const invalidBundle = JSON.stringify({ version: '1.0', boards: [] });
    expect(() => parseMetacomBundle(invalidBundle)).toThrow('Metacom-Bundle enthält keine Boards.');
  });
});
