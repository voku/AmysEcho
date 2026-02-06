/**
 * Metacom Mapping Service
 *
 * Unified mapping layer that resolves:
 *   gesture label → symbolId → boardId
 *
 * Uses Metacom boards as the source of truth, falling back to the
 * gesture-meaning service defaults when a symbol is not on any board.
 */

import { loadMetacomBoards } from './metacomBundleService';
import { gestureMeaningService } from './gestureMeaningService';
import type { MetacomBoardDefinition, MetacomSymbolCell } from '../types/metacom';

export interface SymbolResolution {
  symbolId: string;
  label: string;
  emoji: string;
  boardId: string | null;
  category: string | null;
  color: string | null;
  audioText: string;
}

/**
 * Resolve a gesture label to a Metacom symbol via boards.
 * Checks by symbolId first, then falls back to label matching, then to
 * the gestureMeaningService defaults.
 */
export function resolveGestureSymbol(
  gestureLabel: string,
  symbolId?: string | null,
): SymbolResolution | null {
  if (!gestureLabel && !symbolId) return null;

  const boards = loadMetacomBoards();

  // 1. Try resolving by explicit symbolId across all boards
  if (symbolId) {
    const byId = findSymbolById(boards, symbolId);
    if (byId) return byId;
  }

  // 2. Try resolving by gesture label across all boards
  const normalizedLabel = (gestureLabel ?? '').trim().toLowerCase();
  if (normalizedLabel) {
    const byLabel = findSymbolByLabel(boards, normalizedLabel);
    if (byLabel) return byLabel;
  }

  // 3. Fall back to gestureMeaningService
  const meaning = gestureMeaningService.getMeaning(normalizedLabel);
  if (meaning) {
    return {
      symbolId: meaning.gestureId,
      label: meaning.label,
      emoji: meaning.emoji,
      boardId: null,
      category: meaning.category,
      color: meaning.color,
      audioText: meaning.audioText ?? meaning.label,
    };
  }

  return null;
}

/**
 * Resolve a symbolId to its board location and metadata.
 */
export function resolveSymbolId(symbolId: string): SymbolResolution | null {
  if (!symbolId) return null;
  const boards = loadMetacomBoards();
  return findSymbolById(boards, symbolId);
}

function findSymbolById(
  boards: Record<string, MetacomBoardDefinition>,
  symbolId: string,
): SymbolResolution | null {
  for (const board of Object.values(boards)) {
    for (const cell of board.cells) {
      if (cell.type !== 'symbol') continue;
      const sym = cell as MetacomSymbolCell;
      if ((sym.symbolId ?? sym.id) === symbolId || sym.id === symbolId) {
        return cellToResolution(sym, board.id);
      }
    }
  }
  return null;
}

function findSymbolByLabel(
  boards: Record<string, MetacomBoardDefinition>,
  normalizedLabel: string,
): SymbolResolution | null {
  // Prefer start board matches
  const startBoard = boards['start'];
  if (startBoard) {
    for (const cell of startBoard.cells) {
      if (cell.type !== 'symbol') continue;
      if (cell.label.trim().toLowerCase() === normalizedLabel) {
        return cellToResolution(cell as MetacomSymbolCell, startBoard.id);
      }
    }
  }
  // Then check other boards
  for (const board of Object.values(boards)) {
    if (board.id === 'start') continue;
    for (const cell of board.cells) {
      if (cell.type !== 'symbol') continue;
      if (cell.label.trim().toLowerCase() === normalizedLabel) {
        return cellToResolution(cell as MetacomSymbolCell, board.id);
      }
    }
  }
  return null;
}

function cellToResolution(cell: MetacomSymbolCell, boardId: string): SymbolResolution {
  return {
    symbolId: cell.symbolId ?? cell.id,
    label: cell.label,
    emoji: cell.emoji,
    boardId,
    category: cell.category ?? null,
    color: cell.color ?? null,
    audioText: cell.speech ?? cell.label,
  };
}
