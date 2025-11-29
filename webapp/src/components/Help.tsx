/**
 * Help component - mirrors HelpScreen from the Expo app.
 * Provides documentation and FAQ for users.
 */
export function Help() {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Hilfe</p>
          <h2>Anleitung & FAQ</h2>
          <p className="muted">
            Hier findest du Antworten auf häufige Fragen und eine Anleitung zur Nutzung von Amy&apos;s Echo.
          </p>
        </div>
      </div>

      {/* Quick Start */}
      <div className="help-section">
        <h3>🚀 Schnellstart</h3>
        <ol className="help-steps">
          <li>
            <strong>Kamera starten:</strong> Klicke auf &quot;Kamera starten&quot; und erlaube den Zugriff.
          </li>
          <li>
            <strong>Geste zeigen:</strong> Halte deine Hand vor die Kamera und führe eine Geste aus.
          </li>
          <li>
            <strong>Erkennung prüfen:</strong> Die erkannte Geste wird angezeigt.
          </li>
          <li>
            <strong>Korrigieren:</strong> Falls falsch erkannt, nutze die Korrekturfunktion.
          </li>
          <li>
            <strong>Training:</strong> Nimm neue Gesten auf, um die Erkennung zu verbessern.
          </li>
        </ol>
      </div>

      {/* Supported Gestures */}
      <div className="help-section">
        <h3>✋ Unterstützte Gesten</h3>
        <p>Amy&apos;s Echo erkennt folgende Basis-Gesten:</p>
        <div className="gesture-list">
          <span className="badge">Alle</span>
          <span className="badge">Blau</span>
          <span className="badge">Essen</span>
          <span className="badge">Fertig</span>
          <span className="badge">Gelb</span>
          <span className="badge">Grün</span>
          <span className="badge">Nochmal</span>
          <span className="badge">Rot</span>
          <span className="badge">Satt</span>
          <span className="badge">Schwester</span>
          <span className="badge">Spielen</span>
          <span className="badge">Trinken</span>
        </div>
        <p className="muted small">
          Durch Training können weitere Gesten hinzugefügt werden.
        </p>
      </div>

      {/* FAQ */}
      <div className="help-section">
        <h3>❓ Häufige Fragen</h3>
        
        <details className="faq-item">
          <summary>Warum wird meine Hand nicht erkannt?</summary>
          <div className="faq-answer">
            <ul>
              <li>Stelle sicher, dass genug Licht vorhanden ist.</li>
              <li>Halte die Hand mittig vor die Kamera.</li>
              <li>Vermeide einen unruhigen Hintergrund.</li>
              <li>Die Hand sollte vollständig sichtbar sein.</li>
            </ul>
          </div>
        </details>

        <details className="faq-item">
          <summary>Wie kann ich die Erkennung verbessern?</summary>
          <div className="faq-answer">
            <p>
              Nutze die Training-Funktion, um neue Beispiele aufzunehmen. Je mehr Trainingsbeispiele 
              du hinzufügst, desto besser wird die Erkennung für deine spezifischen Handformen.
            </p>
          </div>
        </details>

        <details className="faq-item">
          <summary>Werden meine Daten gespeichert?</summary>
          <div className="faq-answer">
            <p>
              Alle Daten werden lokal in deinem Browser gespeichert. Trainingsbeispiele werden 
              an den Server gesendet, um das Modell zu verbessern. Keine persönlichen Daten 
              werden übertragen.
            </p>
          </div>
        </details>

        <details className="faq-item">
          <summary>Funktioniert die App offline?</summary>
          <div className="faq-answer">
            <p>
              Die Gestenerkennung funktioniert vollständig offline. Nur das Training und die 
              Modell-Updates benötigen eine Internetverbindung.
            </p>
          </div>
        </details>

        <details className="faq-item">
          <summary>Welche Browser werden unterstützt?</summary>
          <div className="faq-answer">
            <p>
              Amy&apos;s Echo funktioniert am besten in modernen Browsern:
            </p>
            <ul>
              <li>Chrome (empfohlen)</li>
              <li>Firefox</li>
              <li>Safari (iOS 15+)</li>
              <li>Edge</li>
            </ul>
          </div>
        </details>
      </div>

      {/* Tips */}
      <div className="help-section">
        <h3>💡 Tipps für beste Ergebnisse</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <span className="tip-icon">💡</span>
            <div>
              <strong>Gutes Licht</strong>
              <p className="muted small">Sorge für gleichmäßige Beleuchtung ohne starke Schatten.</p>
            </div>
          </div>
          <div className="tip-card">
            <span className="tip-icon">🎯</span>
            <div>
              <strong>Ruhige Hand</strong>
              <p className="muted small">Halte die Hand still für bessere Erkennung.</p>
            </div>
          </div>
          <div className="tip-card">
            <span className="tip-icon">📐</span>
            <div>
              <strong>Richtige Position</strong>
              <p className="muted small">Hand mittig im Bild, nicht zu nah oder zu weit.</p>
            </div>
          </div>
          <div className="tip-card">
            <span className="tip-icon">🔄</span>
            <div>
              <strong>Übung macht den Meister</strong>
              <p className="muted small">Trainiere regelmäßig mit neuen Beispielen.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="help-section">
        <h3>📧 Kontakt & Support</h3>
        <p>
          Bei Fragen oder Problemen wende dich an das Amy&apos;s Echo Team. 
          Feedback ist immer willkommen!
        </p>
        <p className="muted small">
          Diese Webapp ist eine Preview-Version und wird kontinuierlich verbessert.
        </p>
      </div>
    </section>
  );
}
