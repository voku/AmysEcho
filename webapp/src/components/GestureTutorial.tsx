import { Link } from 'react-router-dom';

/**
 * GestureTutorial component - mirrors GestureTutorialScreen from the Expo app.
 * Teaches users how to use gestures effectively.
 */
export function GestureTutorial() {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Tutorial</p>
          <h2>So funktioniert die Gestenerkennung</h2>
          <p className="muted">
            Lerne, wie du Gesten optimal vor der Kamera zeigst, um die beste Erkennung zu erzielen.
          </p>
        </div>
      </div>

      {/* Step-by-step guide */}
      <div className="tutorial-steps">
        <div className="tutorial-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h3>📷 Kamera freigeben</h3>
            <p>
              Erlaube der App den Zugriff auf deine Kamera. Die Gestenerkennung funktioniert 
              nur mit aktivierter Kamera.
            </p>
          </div>
        </div>

        <div className="tutorial-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h3>✋ Hand positionieren</h3>
            <p>
              Halte deine Hand so vor die Kamera, dass sie vollständig sichtbar ist. 
              Die Hand sollte mittig im Bild sein.
            </p>
            <div className="tip-box">
              <strong>💡 Tipp:</strong> Etwa 30-50cm Abstand zur Kamera funktioniert am besten.
            </div>
          </div>
        </div>

        <div className="tutorial-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h3>🤲 Geste zeigen</h3>
            <p>
              Führe die Geste langsam und deutlich aus. Halte die Position für etwa 1-2 Sekunden.
            </p>
            <div className="tip-box">
              <strong>💡 Tipp:</strong> Ruhige, gleichmäßige Bewegungen werden besser erkannt.
            </div>
          </div>
        </div>

        <div className="tutorial-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h3>🎯 Erkennung abwarten</h3>
            <p>
              Warte auf das visuelle Feedback. Die erkannte Geste wird oben rechts angezeigt.
              Bei einer erfolgreichen Erkennung siehst du das Label.
            </p>
          </div>
        </div>

        <div className="tutorial-step">
          <div className="step-number">5</div>
          <div className="step-content">
            <h3>✏️ Bei Bedarf korrigieren</h3>
            <p>
              Falls die Geste falsch erkannt wurde, kannst du sie korrigieren. 
              Das hilft, die Erkennung zu verbessern.
            </p>
          </div>
        </div>
      </div>

      {/* Best practices */}
      <div className="tutorial-section">
        <h3>✨ Beste Ergebnisse erzielen</h3>
        <div className="best-practices">
          <div className="practice-item">
            <span className="practice-icon">💡</span>
            <div>
              <strong>Gute Beleuchtung</strong>
              <p>Stelle sicher, dass dein Gesicht und deine Hände gut beleuchtet sind.</p>
            </div>
          </div>
          <div className="practice-item">
            <span className="practice-icon">🖼️</span>
            <div>
              <strong>Ruhiger Hintergrund</strong>
              <p>Ein einfarbiger Hintergrund verbessert die Erkennung deutlich.</p>
            </div>
          </div>
          <div className="practice-item">
            <span className="practice-icon">📐</span>
            <div>
              <strong>Richtige Position</strong>
              <p>Die Kamera sollte auf Augenhöhe sein und dich frontal erfassen.</p>
            </div>
          </div>
          <div className="practice-item">
            <span className="practice-icon">🔄</span>
            <div>
              <strong>Übung macht den Meister</strong>
              <p>Je öfter du trainierst, desto besser wird die Erkennung für dich.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Common gestures */}
      <div className="tutorial-section">
        <h3>🤲 Basis-Gesten</h3>
        <p className="muted">Diese Gesten sind standardmäßig verfügbar:</p>
        <div className="gesture-examples">
          {[
            { name: 'Essen', emoji: '🍽️', description: 'Hand zum Mund führen' },
            { name: 'Trinken', emoji: '🥤', description: 'Trinkbewegung zeigen' },
            { name: 'Spielen', emoji: '🎮', description: 'Spielerische Handbewegung' },
            { name: 'Fertig', emoji: '✅', description: 'Beide Hände flach nach unten' },
            { name: 'Nochmal', emoji: '🔄', description: 'Kreisende Bewegung' },
            { name: 'Hilfe', emoji: '🆘', description: 'Hand heben' },
          ].map((gesture) => (
            <div key={gesture.name} className="gesture-example">
              <span className="gesture-emoji">{gesture.emoji}</span>
              <div>
                <strong>{gesture.name}</strong>
                <p className="muted small">{gesture.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Call to action */}
      <div className="tutorial-cta">
        <Link to="/" className="primary-button">
          🎯 Jetzt ausprobieren
        </Link>
        <Link to="/training" className="secondary-button">
          📚 Training starten
        </Link>
      </div>
    </section>
  );
}
