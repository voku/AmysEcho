import { useCallback } from 'react';
import { audioService } from '../services/audioService';
import type { MetacomSymbolCell, MetacomSymbolRole } from '../types/metacom';

export interface SentenceSymbol {
  id: string;
  label: string;
  emoji: string;
  role?: MetacomSymbolRole;
}

interface SentenceComposerProps {
  queue: SentenceSymbol[];
  onRemoveLast: () => void;
  onClear: () => void;
  onSpeak?: (text: string) => void;
  onImprove?: () => void;
  improvedSentence?: string | null;
  improvementError?: string | null;
  isImproving?: boolean;
  slottingEnabled?: boolean;
  improveAllowed?: boolean;
  improvementHint?: string | null;
  displayMode?: 'panel' | 'strip';
}

/**
 * Sentence composer for Metacom boards.
 * Displays a symbol queue with backspace, clear and speak actions so Amy
 * can compose multi-symbol utterances before triggering TTS output.
 */
const SLOT_ORDER: Array<{ key: MetacomSymbolRole; label: string }> = [
  { key: 'person', label: 'Person' },
  { key: 'action', label: 'Aktion' },
  { key: 'object', label: 'Objekt' },
  { key: 'modifier', label: 'Modifier' },
  { key: 'negation', label: 'Negation' },
];

function groupByRole(queue: SentenceSymbol[]) {
  const grouped = new Map<MetacomSymbolRole, SentenceSymbol[]>();
  for (const symbol of queue) {
    if (!symbol.role) continue;
    const existing = grouped.get(symbol.role) ?? [];
    existing.push(symbol);
    grouped.set(symbol.role, existing);
  }
  return grouped;
}

export function SentenceComposer({
  queue,
  onRemoveLast,
  onClear,
  onSpeak,
  onImprove,
  improvedSentence,
  improvementError,
  isImproving,
  slottingEnabled,
  improveAllowed = true,
  improvementHint,
  displayMode = 'panel',
}: SentenceComposerProps) {
  const speakSentence = useCallback(async () => {
    if (queue.length === 0) return;
    const text = queue.map((s) => s.label).join(' ');
    await audioService.speak(text, { allowDuplicates: true });
    onSpeak?.(text);
  }, [queue, onSpeak]);

  const roleGroups = slottingEnabled ? groupByRole(queue) : null;
  const showImprovementHint =
    Boolean(improvementHint) && queue.length > 0 && !improvedSentence && !improvementError;
  const speakImprovedSentence = useCallback(async () => {
    if (!improvedSentence) return;
    await audioService.speak(improvedSentence, { allowDuplicates: true });
  }, [improvedSentence]);

  const isStrip = displayMode === 'strip';

  return (
    <div
      className={`sentence-composer${isStrip ? ' sentence-composer--strip' : ''}`}
      role="region"
      aria-label="Satzkomponist"
    >
      <div className="sentence-display" aria-live="polite" aria-atomic="true">
        {queue.length === 0 ? (
          <span className="muted">Wähle Symbole, um einen Satz zu bilden</span>
        ) : (
          <>
            {slottingEnabled && roleGroups ? (
              <div className="sentence-slots" aria-label="Satzbau-Hinweise">
                {SLOT_ORDER.map((slot) => {
                  const items = roleGroups.get(slot.key) ?? [];
                  return (
                    <div key={slot.key} className="sentence-slot">
                      <span className="sentence-slot-label">{slot.label}</span>
                      <span className="sentence-slot-items">
                        {items.length === 0 ? (
                          <span className="sentence-slot-empty">—</span>
                        ) : (
                          items.map((symbol, index) => (
                            <span key={`${symbol.id}-${index}`} className="sentence-chip">
                              {symbol.emoji} {symbol.label}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {isStrip ? (
              <div className="sentence-strip">
                {queue.map((symbol, index) => (
                  <span key={`${symbol.id}-${index}`} className="sentence-strip-item">
                    <span className="sentence-strip-emoji" aria-hidden="true">{symbol.emoji}</span>
                    <span className="sentence-strip-label">{symbol.label}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="sentence-symbols">
                {queue.map((symbol, index) => (
                  <span key={`${symbol.id}-${index}`} className="sentence-chip">
                    {symbol.emoji} {symbol.label}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </div>
      {(improvedSentence || improvementError) && (
        <div className="sentence-suggestion" aria-live="polite">
          {improvedSentence ? (
            <>
              <span>
                <strong>Vorschlag:</strong> {improvedSentence}
              </span>
              <div className="sentence-suggestion-actions">
                <button
                  className="secondary-button"
                  onClick={speakImprovedSentence}
                  aria-label="Vorschlag sprechen"
                >
                  🔊 Vorschlag sprechen
                </button>
              </div>
            </>
          ) : (
            <span className="sentence-error">{improvementError}</span>
          )}
        </div>
      )}

      <div className="sentence-actions">
        <button
          className="secondary-button"
          onClick={onRemoveLast}
          disabled={queue.length === 0}
          aria-label="Letztes Symbol löschen"
        >
          ⌫ Löschen
        </button>
        <button
          className="secondary-button"
          onClick={onClear}
          disabled={queue.length === 0}
          aria-label="Satz leeren"
        >
          🗑️ Leeren
        </button>
        <button
          className="primary-button"
          onClick={speakSentence}
          disabled={queue.length === 0}
          aria-label="Satz vorlesen"
        >
          🔊 Sprechen
        </button>
      </div>
      {(onImprove || showImprovementHint) && (
        <div className="sentence-improve">
          {onImprove && (
            <button
              className="secondary-button sentence-improve-button"
              onClick={onImprove}
              disabled={queue.length === 0 || isImproving || !improveAllowed}
              aria-label="Satz verbessern"
            >
              {isImproving ? '⏳ Satz verbessern' : '✨ Satz verbessern'}
            </button>
          )}
          {showImprovementHint && <span className="sentence-hint">{improvementHint}</span>}
        </div>
      )}
    </div>
  );
}

/** Helper to build a SentenceSymbol from a Metacom symbol cell */
export function cellToSentenceSymbol(cell: MetacomSymbolCell): SentenceSymbol {
  return {
    id: cell.symbolId ?? cell.id,
    label: cell.speech ?? cell.label,
    emoji: cell.emoji,
    ...(cell.role ? { role: cell.role } : {}),
  };
}

export type { SentenceComposerProps };
