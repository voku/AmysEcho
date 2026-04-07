import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  gestureHistoryService,
  type GestureHistoryEntry,
  type GestureHistoryStats,
} from '../services/gestureHistoryService';

function formatDateTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function HistoryStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="gesture-history__stat">
      <span className="gesture-history__stat-label">{label}</span>
      <strong className="gesture-history__stat-value">{value}</strong>
    </div>
  );
}

export function GestureHistoryPage() {
  const [history, setHistory] = useState<GestureHistoryEntry[]>(() => gestureHistoryService.getRecentHistory());
  const [stats, setStats] = useState<GestureHistoryStats>(() => gestureHistoryService.getStats());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const syncFromService = () => {
      if (!active) return;
      setHistory(gestureHistoryService.getRecentHistory());
      setStats(gestureHistoryService.getStats());
    };

    const unsubscribe = gestureHistoryService.subscribe(syncFromService);
    void gestureHistoryService.ready().then(() => {
      if (!active) return;
      syncFromService();
      setReady(true);
    });

    syncFromService();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const latest = history[0] ?? null;
  const hasEntries = history.length > 0;
  const latestCountLabel = latest ? `${history.length} gespeicherte Gebärden` : 'Noch kein Verlauf';

  const summaryCards = useMemo(() => [
    { label: 'Erkannt', value: stats.totalGestures },
    { label: 'Heute', value: stats.recentActivity.today },
    { label: 'Diese Woche', value: stats.recentActivity.thisWeek },
    { label: 'Diese Stunde', value: gestureHistoryService.getRecentGestures(60).length },
  ], [stats]);

  return (
    <div className="gesture-history-page">
      <header className="gesture-history__hero">
        <div className="gesture-history__hero-copy">
          <p className="eyebrow">Verlauf</p>
          <h2>Zuletzt erkannte Gebärden</h2>
          <p className="muted">
            Die Kamera zeigt nur die letzte sichere Ausgabe. Hier bleibt die Folge der erkannten Gebärden sichtbar,
            damit du sehen kannst, was nacheinander passiert ist.
          </p>
        </div>
        <div className="gesture-history__hero-meta">
          <span className="gesture-history__hero-pill">{latestCountLabel}</span>
          <span className="gesture-history__hero-pill">Live mit der Kamera synchronisiert</span>
        </div>
        <div className="gesture-history__hero-actions">
          <Link to="/" className="gesture-screen__action gesture-screen__action--confirm">
            Zur Kamera
          </Link>
          {hasEntries ? (
            <button
              type="button"
              className="gesture-screen__action gesture-screen__action--alt"
              onClick={() => gestureHistoryService.clearHistory()}
            >
              Verlauf löschen
            </button>
          ) : null}
        </div>
      </header>

      <section className="gesture-history__summary" aria-label="Verlauf-Statistiken">
        {summaryCards.map((card) => (
          <HistoryStat key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="gesture-history__panel">
        <div className="gesture-history__section-title">
          <p className="eyebrow">Letzte Ausgabe</p>
          <span className="muted">Die aktuelle Kamera-Ausgabe spiegelt sich hier sofort wider.</span>
        </div>
        {latest ? (
          <div className="gesture-history__latest-card">
            <div className="gesture-history__latest-main">
              <strong>
                {latest.emoji} {latest.label}
              </strong>
              <span>
                {formatDateTime(latest.timestamp)} · {formatConfidence(latest.confidence)}
              </span>
            </div>
            {latest.audioResponse ? <p className="gesture-history__latest-audio">{latest.audioResponse}</p> : null}
          </div>
        ) : (
          <p className="gesture-history__empty-copy">
            Noch kein Verlauf gespeichert. Sobald Amy eine Gebärde erkennt, erscheint sie hier.
          </p>
        )}
      </section>

      <section className="gesture-history__panel">
        <div className="gesture-history__section-title">
          <p className="eyebrow">Chronologischer Verlauf</p>
          {!ready && <span className="muted">Wird geladen…</span>}
        </div>
        {hasEntries ? (
          <ol className="gesture-history__list">
            {history.map((entry) => (
              <li key={entry.id} className="gesture-history__item">
                <div className="gesture-history__item-main">
                  <strong>
                    {entry.emoji} {entry.label}
                  </strong>
                  <span className="muted">
                    {formatDateTime(entry.timestamp)} · {formatConfidence(entry.confidence)}
                  </span>
                </div>
                {entry.audioResponse ? (
                  <p className="gesture-history__item-audio">{entry.audioResponse}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="gesture-history__empty">
            <p>Hier erscheint die Folge der letzten erkannten Gebärden.</p>
            <Link to="/" className="gesture-screen__action gesture-screen__action--confirm">
              Kamera öffnen
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
