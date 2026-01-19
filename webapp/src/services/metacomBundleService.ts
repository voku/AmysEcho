import type { MetacomBoardDefinition, MetacomCell } from '../types/metacom';
import { METACOM_BOARDS } from '../constants/metacomBoards';

const METACOM_BUNDLE_STORAGE_KEY = 'amysecho_metacom_bundle';
export const METACOM_BUNDLE_UPDATED_EVENT = 'amysecho:metacom-bundle-updated';

export interface MetacomBundle {
  version: string;
  boards: MetacomBoardDefinition[];
}

interface OpenBoardFormat {
  format: string;
  id?: string;
  name?: string;
  grid?: {
    rows?: number;
    columns?: number;
    order?: Array<Array<string | number | null>>;
  };
  buttons?: OpenBoardButton[];
}

interface OpenBoardButton {
  id?: string | number;
  label?: string;
  vocalization?: string;
  image_id?: string;
  row?: number;
  col?: number;
  position?: number;
  background_color?: string;
  actions?: Array<{ type?: string; action?: string; destination?: string; board_id?: string }>;
  load_board?: { id?: string; board_id?: string; name?: string; url?: string; data_url?: string };
  action?: string;
  hidden?: boolean;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function isMetacomBundle(value: unknown): value is MetacomBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as MetacomBundle;
  return typeof bundle.version === 'string' && Array.isArray(bundle.boards);
}

function isOpenBoardFormat(value: unknown): value is OpenBoardFormat {
  if (!value || typeof value !== 'object') return false;
  const board = value as OpenBoardFormat;
  return typeof board.format === 'string' && board.format.startsWith('open-board');
}

function extractButtonActionDestination(button: OpenBoardButton): string | null {
  const actions = button.actions ?? [];
  for (const action of actions) {
    const type = action.type ?? action.action ?? '';
    if (type === 'navigate' || type === 'open-board' || type === 'open_board' || type === 'switch_board') {
      const destination = action.destination ?? action.board_id;
      if (destination) {
        return String(destination);
      }
    }
  }
  const loadBoardDestination = button.load_board?.board_id ?? button.load_board?.id;
  if (loadBoardDestination) {
    return String(loadBoardDestination);
  }
  return null;
}

function buildOrderPositions(
  order: Array<Array<string | number | null>> | undefined,
  columns: number,
): Map<string, number> {
  const positions = new Map<string, number>();
  if (!Array.isArray(order)) {
    return positions;
  }
  order.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((entry, colIndex) => {
      if (entry === null || entry === undefined) return;
      positions.set(String(entry), rowIndex * columns + colIndex);
    });
  });
  return positions;
}

function mapOpenBoardButtons(
  buttons: OpenBoardButton[],
  columns: number,
  boardId: string,
  validDestinations: Set<string>,
  orderPositions: Map<string, number>,
): MetacomCell[] {
  return buttons
    .filter((button) => !button.hidden)
    .map((button, index) => {
      const buttonId = button.id ?? `${boardId}-button-${index}`;
      const orderPosition = orderPositions.get(String(buttonId));
      let position: number = index;
      if (typeof orderPosition === 'number' && Number.isInteger(orderPosition)) {
        position = orderPosition;
      } else {
        const buttonPosition = button.position;
        const row = button.row;
        const col = button.col;
        if (typeof buttonPosition === 'number' && Number.isInteger(buttonPosition)) {
          position = buttonPosition;
        } else if (
          typeof row === 'number'
          && typeof col === 'number'
          && Number.isInteger(row)
          && Number.isInteger(col)
        ) {
          position = row * columns + col;
        }
      }
      const label = button.label?.trim() || button.vocalization?.trim() || 'Symbol';
      const destination = extractButtonActionDestination(button);
      const color = button.background_color;
      if (destination && validDestinations.has(destination)) {
        const baseCell: MetacomCell = {
          id: String(buttonId),
          label,
          emoji: '🧭',
          position,
          type: 'board',
          targetBoardId: destination,
        };
        return color ? { ...baseCell, color } : baseCell;
      }

      const baseCell: MetacomCell = {
        id: String(buttonId),
        label,
        emoji: '🧩',
        position,
        type: 'symbol',
      };
      const speech = button.vocalization;
      const cellWithSpeech = speech ? { ...baseCell, speech } : baseCell;
      return color ? { ...cellWithSpeech, color } : cellWithSpeech;
    });
}

function parseOpenBoard(
  board: OpenBoardFormat,
  index: number,
  validDestinations: Set<string>,
  forcedId?: string,
): MetacomBoardDefinition {
  const rows = board.grid?.rows ?? 0;
  const columns = board.grid?.columns ?? 0;
  if (!isPositiveInteger(rows) || !isPositiveInteger(columns)) {
    throw new Error('Open-Board-Format benötigt gültige Rasterwerte.');
  }
  const label = board.name?.trim() || `Tafel ${index + 1}`;
  const id = forcedId ?? (board.id?.trim() || slugify(label) || `board-${index + 1}`);
  const buttons = board.buttons ?? [];
  if (buttons.length === 0) {
    throw new Error(`Open-Board-Format "${label}" enthält keine Buttons.`);
  }

  const orderPositions = buildOrderPositions(board.grid?.order, columns);

  return {
    id,
    label,
    rows,
    columns,
    cells: mapOpenBoardButtons(buttons, columns, id, validDestinations, orderPositions),
  };
}

function parseBundlePayload(payload: unknown): MetacomBundle {
  if (isMetacomBundle(payload)) {
    return payload;
  }
  if (isOpenBoardFormat(payload)) {
    const id = payload.id?.trim() || slugify(payload.name ?? '') || 'start';
    return {
      version: payload.format,
      boards: [parseOpenBoard(payload, 0, new Set([id]), id)],
    };
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { boards?: unknown[] }).boards)) {
    const boards = (payload as { boards?: unknown[] }).boards ?? [];
    const openBoards = boards.filter(isOpenBoardFormat);
    if (openBoards.length === boards.length && openBoards.length > 0) {
      const boardIds = openBoards.map((board, index) =>
        board.id?.trim() || slugify(board.name ?? '') || `board-${index + 1}`,
      );
      const destinationSet = new Set(boardIds);
      return {
        version: 'open-board-bundle',
        boards: openBoards.map((board, index) =>
          parseOpenBoard(board, index, destinationSet, boardIds[index]),
        ),
      };
    }
  }

  throw new Error('Metacom-Bundle hat ein unbekanntes Format.');
}

function validateCell(cell: MetacomCell, boardId: string, maxPosition: number): void {
  if (!cell.id || !cell.label || !cell.emoji) {
    throw new Error(`Metacom-Zelle in "${boardId}" ist unvollständig.`);
  }
  if (!Number.isInteger(cell.position) || cell.position < 0 || cell.position >= maxPosition) {
    throw new Error(`Metacom-Zelle "${cell.id}" hat eine ungültige Position.`);
  }
  if (cell.type === 'board' && !cell.targetBoardId) {
    throw new Error(`Metacom-Zelle "${cell.id}" benötigt ein Ziel-Board.`);
  }
}

function validateBoard(board: MetacomBoardDefinition): void {
  if (!board.id || !board.label) {
    throw new Error('Metacom-Board benötigt eine ID und ein Label.');
  }
  if (!isPositiveInteger(board.rows) || !isPositiveInteger(board.columns)) {
    throw new Error(`Metacom-Board "${board.id}" hat ungültige Rasterwerte.`);
  }
  if (!Array.isArray(board.cells)) {
    throw new Error(`Metacom-Board "${board.id}" enthält keine Zellenliste.`);
  }

  const maxPosition = board.rows * board.columns;
  const usedPositions = new Set<number>();
  for (const cell of board.cells) {
    validateCell(cell, board.id, maxPosition);
    if (usedPositions.has(cell.position)) {
      throw new Error(`Metacom-Board "${board.id}" nutzt Position ${cell.position} doppelt.`);
    }
    usedPositions.add(cell.position);
  }
}

function buildBoardRecord(boards: MetacomBoardDefinition[]): Record<string, MetacomBoardDefinition> {
  return boards.reduce<Record<string, MetacomBoardDefinition>>((acc, board) => {
    acc[board.id] = board;
    return acc;
  }, {});
}

function validateBundle(bundle: MetacomBundle): void {
  if (!bundle.version || typeof bundle.version !== 'string') {
    throw new Error('Metacom-Bundle benötigt eine Versionsangabe.');
  }
  if (!Array.isArray(bundle.boards) || bundle.boards.length === 0) {
    throw new Error('Metacom-Bundle enthält keine Boards.');
  }

  bundle.boards.forEach(validateBoard);
  const boardIds = new Set(bundle.boards.map((board) => board.id));
  if (!boardIds.has('start')) {
    console.warn('Metacom bundle has no start board; falling back to the first board.');
  }

  for (const board of bundle.boards) {
    for (const cell of board.cells) {
      if (cell.type === 'board' && !boardIds.has(cell.targetBoardId)) {
        throw new Error(`Metacom-Board "${board.id}" verweist auf ein unbekanntes Ziel-Board.`);
      }
    }
  }
}

export function parseMetacomBundle(raw: string): MetacomBundle {
  const parsed = parseBundlePayload(JSON.parse(raw));
  validateBundle(parsed);
  return parsed;
}

export function storeMetacomBundle(raw: string): Record<string, MetacomBoardDefinition> {
  const bundle = parseMetacomBundle(raw);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(METACOM_BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
    window.dispatchEvent(new Event(METACOM_BUNDLE_UPDATED_EVENT));
  }
  return buildBoardRecord(bundle.boards);
}

export function clearMetacomBundle(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(METACOM_BUNDLE_STORAGE_KEY);
  window.dispatchEvent(new Event(METACOM_BUNDLE_UPDATED_EVENT));
}

export function loadMetacomBoards(): Record<string, MetacomBoardDefinition> {
  if (typeof window === 'undefined') {
    return METACOM_BOARDS;
  }
  const raw = window.localStorage.getItem(METACOM_BUNDLE_STORAGE_KEY);
  if (!raw) return METACOM_BOARDS;
  try {
    const bundle = parseMetacomBundle(raw);
    return buildBoardRecord(bundle.boards);
  } catch (error) {
    console.warn('Failed to load Metacom bundle', error);
    return METACOM_BOARDS;
  }
}

export function getMetacomSymbols(boards: Record<string, MetacomBoardDefinition>) {
  return Object.values(boards)
    .flatMap((board) => board.cells.filter((cell) => cell.type === 'symbol'))
    .map((cell) => ({
      id: cell.id,
      label: cell.label,
      emoji: cell.emoji,
      category: cell.category,
      color: cell.color,
    }));
}
