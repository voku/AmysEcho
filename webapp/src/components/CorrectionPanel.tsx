import { useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';

const AVAILABLE_GESTURES = [
  { id: 'alle', label: 'Alle' },
  { id: 'blau', label: 'Blau' },
  { id: 'essen', label: 'Essen' },
  { id: 'fertig', label: 'Fertig' },
  { id: 'gelb', label: 'Gelb' },
  { id: 'gruen', label: 'Grün' },
  { id: 'nochmal', label: 'Nochmal' },
  { id: 'rot', label: 'Rot' },
  { id: 'satt', label: 'Satt' },
  { id: 'schwester', label: 'Schwester' },
  { id: 'spielen', label: 'Spielen' },
  { id: 'trinken', label: 'Trinken' },
];

interface CorrectionPanelProps {
  recognizedGesture: string | null;
  onCorrection?: (originalGesture: string, correctedGesture: string) => void;
}

/**
 * Panel for correcting misrecognized gestures.
 * Mirrors the CorrectionPanel from the Expo app.
 */
export function CorrectionPanel({ recognizedGesture, onCorrection }: CorrectionPanelProps) {
  const { recordGesture } = useAppState();
  const [selectedCorrection, setSelectedCorrection] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [correctionApplied, setCorrectionApplied] = useState(false);

  const handleCorrectionSelect = useCallback((gestureId: string) => {
    setSelectedCorrection(gestureId);
  }, []);

  const handleApplyCorrection = useCallback(() => {
    if (!selectedCorrection || !recognizedGesture) return;
    
    // Record the corrected gesture
    recordGesture(selectedCorrection);
    
    // Notify parent if callback provided
    if (onCorrection) {
      onCorrection(recognizedGesture, selectedCorrection);
    }
    
    setCorrectionApplied(true);
    setShowPanel(false);
    setSelectedCorrection(null);
    
    // Reset after 3 seconds
    setTimeout(() => {
      setCorrectionApplied(false);
    }, 3000);
  }, [selectedCorrection, recognizedGesture, recordGesture, onCorrection]);

  const handleOpenPanel = useCallback(() => {
    setShowPanel(true);
    setCorrectionApplied(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    setShowPanel(false);
    setSelectedCorrection(null);
  }, []);

  if (!recognizedGesture) {
    return (
      <div className="notice muted">
        <p>Warte auf erkannte Geste, um Korrektur anzubieten...</p>
      </div>
    );
  }

  if (correctionApplied) {
    return (
      <div className="notice success">
        <strong>✓ Korrektur gespeichert!</strong>
        <p>Die Geste wurde korrigiert. Das hilft, die Erkennung zu verbessern.</p>
      </div>
    );
  }

  if (!showPanel) {
    return (
      <div className="correction-trigger">
        <p className="muted">
          Erkannt: <strong>{recognizedGesture}</strong>
        </p>
        <button className="ghost" onClick={handleOpenPanel}>
          War das falsch? Korrigieren
        </button>
      </div>
    );
  }

  return (
    <div className="correction-panel">
      <div className="panel-header">
        <p className="eyebrow">Korrektur</p>
        <h3>Welche Geste war gemeint?</h3>
        <p className="muted">
          Wähle die richtige Geste aus. Diese Information hilft, die Erkennung zu verbessern.
        </p>
      </div>

      <div className="gesture-options">
        {AVAILABLE_GESTURES.map((gesture) => (
          <button
            key={gesture.id}
            className={`gesture-option ${selectedCorrection === gesture.id ? 'selected' : ''}`}
            onClick={() => handleCorrectionSelect(gesture.id)}
            disabled={gesture.id === recognizedGesture}
          >
            {gesture.label}
            {gesture.id === recognizedGesture && <span className="current-badge">Aktuell</span>}
          </button>
        ))}
      </div>

      <div className="controls">
        <button 
          className="primary" 
          onClick={handleApplyCorrection}
          disabled={!selectedCorrection}
        >
          Korrektur übernehmen
        </button>
        <button className="ghost" onClick={handleClosePanel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
