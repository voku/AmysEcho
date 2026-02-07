import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSymbolStore } from '../context/SymbolStore';
import { useMetacomBundle } from '../hooks/useMetacomBundle';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { audioService } from '../services/audioService';
import {
  addMetacomMemoryItem,
  clearMetacomMemory,
  loadMetacomMemory,
  type MetacomMemoryItem,
} from '../services/metacomMemoryService';
import { buildNextWordLabel, getNextWordRecommendations } from '../services/metacomRecommendationService';
import { improveMetacomSentence } from '../services/metacomSentenceService';
import { resolveGestureSymbol } from '../services/metacomMappingService';
import type {
  MetacomBoardCell,
  MetacomBoardDefinition,
  MetacomCell,
  MetacomSymbolCell,
} from '../types/metacom';
import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { SymbolButton, type Symbol } from './SymbolButton';
import { SentenceComposer, cellToSentenceSymbol, type SentenceSymbol } from './SentenceComposer';
import type { MetacomVocabularySet } from '../types/metacomVocabulary';

const START_BOARD_ID = 'start';

function getBoard(
  boardId: string,
  boards: Record<string, MetacomBoardDefinition>,
): MetacomBoardDefinition {
  const startBoard = boards[START_BOARD_ID];
  if (!startBoard) {
    throw new Error('Metacom-Starttafel fehlt.');
  }
  return boards[boardId] ?? startBoard;
}

export function MetacomBoard() {
  const { symbols } = useSymbolStore();
  const { lastRecognizedSign, profileMetadata, profileId } = useAppState();
  const { apiToken, refreshAccessToken, sentenceImproveEndpoint } = useApiConfig();
  const navigate = useNavigate();
  const vocabularySet = (profileMetadata?.vocabularySet ?? 'basis') as MetacomVocabularySet;
  const { boards } = useMetacomBundle({ vocabularySet });
  const [boardHistory, setBoardHistory] = useState<string[]>([START_BOARD_ID]);
  const [lastSpoken, setLastSpoken] = useState<string | null>(null);
  const [lastSymbolSelection, setLastSymbolSelection] = useState<MetacomSymbolCell | null>(null);
  const [sentenceQueue, setSentenceQueue] = useState<SentenceSymbol[]>([]);
  const [lastAddedSign, setLastAddedSign] = useState<string | null>(null);
  const [slottingEnabled, setSlottingEnabled] = useState(false);
  const [improvedSentence, setImprovedSentence] = useState<string | null>(null);
  const [improvementError, setImprovementError] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [lastSentence, setLastSentence] = useState<string | null>(null);
  const [lastSentenceAt, setLastSentenceAt] = useState<number | null>(null);
  const [memoryItems, setMemoryItems] = useState<MetacomMemoryItem[]>([]);
  const improveAllowed = Boolean(apiToken);
  const improvementHint = improveAllowed ? null : 'Für Satzvorschläge bitte anmelden.';
  const childAge = profileMetadata?.childAge ?? null;

  useEffect(() => {
    setMemoryItems(loadMetacomMemory(profileId));
  }, [profileId]);

  // Resolve the most recently detected gesture to a Metacom symbol
  const detectedResolution = useMemo(
    () => (lastRecognizedSign ? resolveGestureSymbol(lastRecognizedSign) : null),
    [lastRecognizedSign],
  );

  // Auto-add recognized gestures to sentence queue when a new sign is detected
  useEffect(() => {
    if (!lastRecognizedSign || lastRecognizedSign === lastAddedSign) return;
    if (!detectedResolution) return;
    const symbol: SentenceSymbol = {
      id: detectedResolution.symbolId,
      label: detectedResolution.audioText,
      emoji: detectedResolution.emoji,
    };
    setSentenceQueue((prev) => [...prev, symbol]);
    setLastAddedSign(lastRecognizedSign);
  }, [lastRecognizedSign, lastAddedSign, detectedResolution]);

  useEffect(() => {
    setImprovedSentence(null);
    setImprovementError(null);
  }, [sentenceQueue]);

  const currentBoardId = boardHistory[boardHistory.length - 1] ?? START_BOARD_ID;
  const board = getBoard(currentBoardId, boards);
  const fallbackBoardId = useMemo(() => START_BOARD_ID, []);

  useEffect(() => {
    if (!boards[currentBoardId]) {
      setBoardHistory([fallbackBoardId]);
    }
  }, [boards, currentBoardId, fallbackBoardId]);

  const allCells = useMemo(() => {
    const map = new Map<string, MetacomCell>();
    Object.values(boards).forEach((boardDefinition) => {
      boardDefinition.cells.forEach((cell) => {
        if (!map.has(cell.id)) {
          map.set(cell.id, cell);
        }
      });
    });
    return Array.from(map.values());
  }, [boards]);

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

  const addBoardSelectionToSentence = useCallback((cell: MetacomBoardCell) => {
    const speechText = cell.speech ?? cell.label;
    if (!speechText) return;
    setSentenceQueue((prev) => [
      ...prev,
      {
        id: cell.id,
        label: speechText,
        emoji: cell.emoji,
        ...(cell.role ? { role: cell.role } : {}),
      },
    ]);
  }, []);

  const handleCellPress = useCallback(
    async (cell: MetacomCell) => {
      if (cell.type === 'board') {
        setBoardHistory((prev) => [...prev, cell.targetBoardId]);
        setLastSymbolSelection(null);
        const speechText = cell.speech ?? cell.label;
        addBoardSelectionToSentence(cell);
        await speakSelection(speechText);
        return;
      }

      setLastSymbolSelection(cell);
      setSentenceQueue((prev) => [...prev, cellToSentenceSymbol(cell)]);
      const speechText = cell.speech ?? cell.label;
      await speakSelection(speechText);
    },
    [addBoardSelectionToSentence, speakSelection]
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

  const handleRemoveLast = useCallback(() => {
    setSentenceQueue((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);

  const handleClearSentence = useCallback(() => {
    setSentenceQueue([]);
  }, []);

  const handleSaveToMemory = useCallback(() => {
    if (!lastSymbolSelection) return;
    const item: MetacomMemoryItem = {
      id: lastSymbolSelection.symbolId ?? lastSymbolSelection.id,
      label: lastSymbolSelection.speech ?? lastSymbolSelection.label,
      emoji: lastSymbolSelection.emoji,
      ...(lastSymbolSelection.role ? { role: lastSymbolSelection.role } : {}),
    };
    setMemoryItems(addMetacomMemoryItem(profileId, item));
  }, [lastSymbolSelection, profileId]);

  const handleClearMemory = useCallback(() => {
    clearMetacomMemory(profileId);
    setMemoryItems([]);
  }, [profileId]);

  const handleMemoryPress = useCallback(
    async (item: MetacomMemoryItem) => {
      setSentenceQueue((prev) => [...prev, item]);
      await speakSelection(item.label);
    },
    [speakSelection],
  );

  const handleSentenceSpoken = useCallback((text: string) => {
    setLastSentence(text);
    setLastSentenceAt(Date.now());
  }, []);

  const handleImproveSentence = useCallback(async () => {
    if (sentenceQueue.length === 0) return;
    if (!apiToken) {
      setImprovementError('Satzverbesserung ist nur mit Anmeldung verfügbar.');
      return;
    }
    setIsImproving(true);
    setImprovedSentence(null);
    setImprovementError(null);
    const sentenceText = sentenceQueue.map((symbol) => symbol.label).join(' ');
    try {
      const suggestion = await improveMetacomSentence({
        endpoint: sentenceImproveEndpoint,
        sentence: sentenceText,
        token: apiToken,
        refreshAccessToken,
      });
      setImprovedSentence(suggestion);
    } catch (error) {
      const errorMessages: Record<number, string> = {
        401: SESSION_EXPIRED_MESSAGE,
        429: 'Zu viele Anfragen. Bitte später erneut versuchen.',
        503: 'Satzverbesserung ist gerade nicht verfügbar.',
      };
      const status = error instanceof HttpError ? error.status : 0;
      const message = errorMessages[status] ?? 'Satzverbesserung konnte nicht abgeschlossen werden.';
      setImprovementError(message);
    } finally {
      setIsImproving(false);
    }
  }, [apiToken, refreshAccessToken, sentenceImproveEndpoint, sentenceQueue]);

  const recommendationLabel = useMemo(
    () =>
      buildNextWordLabel({
        childAge,
        lastSentence,
        lastSentenceAt,
        now: new Date(),
      }),
    [childAge, lastSentence, lastSentenceAt],
  );

  const recommendationCells = useMemo(() => {
    if (sentenceQueue.length === 0) return [];
    const currentBoardCellIds = new Set(board.cells.map((cell) => cell.id));
    const candidateCells = allCells.filter((cell) => !currentBoardCellIds.has(cell.id));
    return getNextWordRecommendations({
      cells: candidateCells,
      queue: sentenceQueue,
      context: {
        childAge,
        lastSentence,
        lastSentenceAt,
        now: new Date(),
      },
      maxRecommendations: 3,
    });
  }, [allCells, board.cells, childAge, lastSentence, lastSentenceAt, sentenceQueue]);

  return (
    <section className="card metacom-board">
      <header className="metacom-header">
        <div>
          <p className="eyebrow">Metacom</p>
          <h2>{board.label}</h2>
        </div>
        <div className="metacom-header-actions">
          <button
            className="secondary-button"
            onClick={() => setSlottingEnabled((prev) => !prev)}
            aria-pressed={slottingEnabled}
          >
            Satzbau-Hilfe {slottingEnabled ? 'an' : 'aus'}
          </button>
          {canGoBack && (
            <button className="secondary-button" onClick={handleBack}>
              Zurück
            </button>
          )}
        </div>
      </header>

      <div className="metacom-status" aria-live="polite">
        <div className="metacom-status-details">
          <span className="muted">Letzte Auswahl</span>
          <strong className="metacom-status-text">
            {lastSpoken ?? 'Noch keine Auswahl'}
          </strong>
        </div>
        {lastSymbolSelection && (
          <div className="metacom-status-actions">
            <button className="secondary-button" onClick={handleUseAsGesture}>
              Als Gebärde nutzen
            </button>
            <button className="secondary-button" onClick={handleSaveToMemory}>
              Merken
            </button>
          </div>
        )}
      </div>

      {detectedResolution && (
        <div className="metacom-detected" aria-live="polite" data-testid="detected-gesture">
          <span>🖐️</span>
          <span className="metacom-detected-label">
            {detectedResolution.emoji} {detectedResolution.label}
          </span>
          <span className="muted">erkannt</span>
        </div>
      )}

      <SentenceComposer
        queue={sentenceQueue}
        onRemoveLast={handleRemoveLast}
        onClear={handleClearSentence}
        onSpeak={handleSentenceSpoken}
        onImprove={handleImproveSentence}
        improvedSentence={improvedSentence}
        improvementError={improvementError}
        isImproving={isImproving}
        slottingEnabled={slottingEnabled}
        improveAllowed={improveAllowed}
        improvementHint={improvementHint}
      />

      {recommendationCells.length > 0 && (
        <div className="metacom-recommendations" role="region" aria-label="Nächste Wörter">
          <p className="metacom-recommendations-label">{recommendationLabel}</p>
          <div className="metacom-recommendations-grid">
            {recommendationCells.map((cell) => (
              <div key={`recommend-${cell.id}`} className="metacom-recommendation-cell">
                <SymbolButton symbol={resolveSymbol(cell)} onPress={() => handleCellPress(cell)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {memoryItems.length > 0 && (
        <div className="metacom-memory" role="region" aria-label="Merkliste">
          <div className="metacom-memory-header">
            <p className="metacom-memory-label">Merkliste</p>
            <button className="secondary-button" onClick={handleClearMemory}>
              Merkliste leeren
            </button>
          </div>
          <div className="metacom-memory-grid">
            {memoryItems.map((item) => (
              <div key={`memory-${item.id}`} className="metacom-memory-cell">
                <SymbolButton
                  symbol={{ id: item.id, name: item.label, emoji: item.emoji }}
                  onPress={() => handleMemoryPress(item)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
