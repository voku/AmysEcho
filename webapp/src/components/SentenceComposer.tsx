import { useCallback } from 'react';
import { audioService } from '../services/audioService';
import type { MetacomSymbolCell } from '../types/metacom';

export interface SentenceSymbol {
  id: string;
  label: string;
  emoji: string;
}

interface SentenceComposerProps {
  queue: SentenceSymbol[];
  onRemoveLast: () => void;
  onClear: () => void;
  onSpeak?: (text: string) => void;
}

/**
 * Sentence composer for Metacom boards.
 * Displays a symbol queue with backspace, clear and speak actions so Amy
 * can compose multi-symbol utterances before triggering TTS output.
 */
export function SentenceComposer({ queue, onRemoveLast, onClear, onSpeak }: SentenceComposerProps) {
  const speakSentence = useCallback(async () => {
    if (queue.length === 0) return;
    const text = queue.map((s) => s.label).join(' ');
    await audioService.speak(text, { allowDuplicates: true });
    onSpeak?.(text);
  }, [queue, onSpeak]);

  return (
    <div className="sentence-composer" role="region" aria-label="Satzkomponist">
      <div className="sentence-display" aria-live="polite" aria-atomic="true">
        {queue.length === 0 ? (
          <span className="muted">Wähle Symbole, um einen Satz zu bilden</span>
        ) : (
          <span className="sentence-symbols">
            {queue.map((symbol, index) => (
              <span key={`${symbol.id}-${index}`} className="sentence-chip">
                {symbol.emoji} {symbol.label}
              </span>
            ))}
          </span>
        )}
      </div>

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
    </div>
  );
}

/** Helper to build a SentenceSymbol from a Metacom symbol cell */
export function cellToSentenceSymbol(cell: MetacomSymbolCell): SentenceSymbol {
  return {
    id: cell.symbolId ?? cell.id,
    label: cell.speech ?? cell.label,
    emoji: cell.emoji,
  };
}

export type { SentenceComposerProps };
