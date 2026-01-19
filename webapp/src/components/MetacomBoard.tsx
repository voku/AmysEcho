import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSymbolStore } from '../context/SymbolStore';
import { useMetacomBundle } from '../hooks/useMetacomBundle';
import { audioService } from '../services/audioService';
import type { MetacomBoardDefinition, MetacomCell, MetacomSymbolCell } from '../types/metacom';
import { SymbolButton, type Symbol } from './SymbolButton';

const START_BOARD_ID = 'start';

function getBoard(
  boardId: string,
  boards: Record<string, MetacomBoardDefinition>,
): MetacomBoardDefinition {
  const fallback = boards[START_BOARD_ID] ?? Object.values(boards)[0];
  if (!fallback) {
    throw new Error('Metacom-Starttafel fehlt.');
  }
  return boards[boardId] ?? fallback;
}

export function MetacomBoard() {
  const { symbols } = useSymbolStore();
  const { boards } = useMetacomBundle();
  const navigate = useNavigate();
  const [boardHistory, setBoardHistory] = useState<string[]>([START_BOARD_ID]);
  const [lastSpoken, setLastSpoken] = useState<string | null>(null);
  const [lastSymbolSelection, setLastSymbolSelection] = useState<MetacomSymbolCell | null>(null);

  const currentBoardId = boardHistory[boardHistory.length - 1] ?? START_BOARD_ID;
  const board = getBoard(currentBoardId, boards);
  const fallbackBoardId = useMemo(
    () => boards[START_BOARD_ID]?.id ?? Object.values(boards)[0]?.id ?? START_BOARD_ID,
    [boards]
  );

  useEffect(() => {
    if (!boards[currentBoardId]) {
      setBoardHistory([fallbackBoardId]);
    }
  }, [boards, currentBoardId, fallbackBoardId]);

  const symbolLookup = useMemo(
    () => new Map(symbols.map((symbol) => [symbol.id, symbol])),
    [symbols]
  );

  const cellsByPosition = useMemo(() => {
    const map = new Map<number, MetacomCell>();
    for (const cell of board.cells) {
      map.set(cell.position, cell);
    }
    return map;
  }, [board.cells]);

  const resolveSymbol = useCallback(
    (cell: MetacomCell): Symbol => {
      const storedSymbol = cell.type === 'symbol'
        ? symbolLookup.get(cell.symbolId ?? cell.id)
        : symbolLookup.get(cell.id);
      const category = storedSymbol?.category ?? cell.category;
      const color = cell.color ?? storedSymbol?.color ?? undefined;
      const baseSymbol: Symbol = {
        id: cell.id,
        name: storedSymbol?.name ?? cell.label,
        emoji: storedSymbol?.emoji ?? cell.emoji,
      };
      if (category) {
        baseSymbol.category = category;
      }
      if (color) {
        baseSymbol.color = color;
      }
      return baseSymbol;
    },
    [symbolLookup]
  );

  const speakSelection = useCallback(async (text: string) => {
    setLastSpoken(text);
    await audioService.speak(text, { allowDuplicates: true });
  }, []);

  const handleCellPress = useCallback(
    async (cell: MetacomCell) => {
      if (cell.type === 'board') {
        setBoardHistory((prev) => [...prev, cell.targetBoardId]);
        setLastSymbolSelection(null);
        await speakSelection(cell.label);
        return;
      }

      setLastSymbolSelection(cell);
      const speechText = cell.speech ?? cell.label;
      await speakSelection(speechText);
    },
    [speakSelection]
  );

  const canGoBack = boardHistory.length > 1;
  const handleBack = useCallback(() => {
    if (!canGoBack) return;
    setBoardHistory((prev) => prev.slice(0, -1));
  }, [canGoBack]);

  const handleUseAsGesture = useCallback(() => {
    if (!lastSymbolSelection) return;
    const gestureParam = encodeURIComponent(lastSymbolSelection.label);
    const symbolIdParam = encodeURIComponent(lastSymbolSelection.symbolId ?? lastSymbolSelection.id);
    navigate(`/training?gesture=${gestureParam}&symbolId=${symbolIdParam}`);
  }, [lastSymbolSelection, navigate]);

  return (
    <section className="card metacom-board">
      <header className="metacom-header">
        <div>
          <p className="eyebrow">Metacom</p>
          <h2>{board.label}</h2>
        </div>
        {canGoBack && (
          <button className="secondary-button" onClick={handleBack}>
            Zurück
          </button>
        )}
      </header>

      <div className="metacom-status" aria-live="polite">
        <div className="metacom-status-details">
          <span className="muted">Letzte Auswahl</span>
          <strong className="metacom-status-text">
            {lastSpoken ?? 'Noch keine Auswahl'}
          </strong>
        </div>
        {lastSymbolSelection && (
          <button className="secondary-button" onClick={handleUseAsGesture}>
            Als Gebärde nutzen
          </button>
        )}
      </div>

      <div
        className="metacom-grid"
        style={{ '--metacom-columns': board.columns } as CSSProperties}
      >
        {Array.from({ length: board.rows * board.columns }).map((_, index) => {
          const cell = cellsByPosition.get(index);
          if (!cell) {
            return <div key={`empty-${index}`} className="metacom-cell metacom-cell-empty" aria-hidden="true" />;
          }

          return (
            <div key={cell.id} className="metacom-cell">
              <SymbolButton
                symbol={resolveSymbol(cell)}
                onPress={() => handleCellPress(cell)}
                largeText
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
