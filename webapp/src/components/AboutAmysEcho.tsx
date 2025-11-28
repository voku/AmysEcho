/**
 * AboutAmysEcho component - The self-discovery of Amy's Echo.
 * 
 * This component represents what Amy's Echo knows about itself:
 * - Its purpose: helping non-verbal children communicate
 * - Its principles: Amy First commitments
 * - Its capabilities: gesture recognition, learning, and adaptation
 * - Its values: reliability, simplicity, and celebration of every attempt
 */
export function AboutAmysEcho() {
  return (
    <section className="card about-amy">
      <div className="card-header">
        <div>
          <p className="eyebrow">Über uns</p>
          <h2>Amy&apos;s Echo</h2>
          <p className="muted">
            Eine multimodale Kommunikationsplattform für nicht-sprechende Kinder.
          </p>
        </div>
      </div>

      {/* Mission Statement */}
      <div className="about-section mission">
        <div className="mission-icon">❤️</div>
        <h3>Unsere Mission</h3>
        <p className="mission-statement">
          <strong>Amy zuerst – immer.</strong>
        </p>
        <p>
          Jede Zeile Code, jede Funktion, jede Entscheidung dient einem einzigen Zweck: 
          Amy dabei zu helfen, sich auszudrücken. Wir bauen keine App – wir bauen eine Brücke 
          zwischen Amy&apos;s Gedanken und der Welt um sie herum.
        </p>
      </div>

      {/* Amy First Commitments */}
      <div className="about-section commitments">
        <h3>Unsere Versprechen</h3>
        <div className="commitment-grid">
          <div className="commitment-item">
            <span className="commitment-emoji">🚫</span>
            <div>
              <strong>Keine Unterbrechung</strong>
              <p>Audio, Video und Text bleiben ohne Pause aktiv – auch bei Netzproblemen.</p>
            </div>
          </div>
          <div className="commitment-item">
            <span className="commitment-emoji">🧭</span>
            <div>
              <strong>Keine Verwirrung</strong>
              <p>Klare Symbole, einfache Wörter und sofortige Gestenübersetzung.</p>
            </div>
          </div>
          <div className="commitment-item">
            <span className="commitment-emoji">⚡️</span>
            <div>
              <strong>Keine Verzögerung</strong>
              <p>Lokale Modelle und Fallbacks reagieren sofort, selbst offline.</p>
            </div>
          </div>
          <div className="commitment-item">
            <span className="commitment-emoji">🛡️</span>
            <div>
              <strong>Keine Ausfälle</strong>
              <p>Cloud, MLP-Fallback und manuelle Bestätigung sichern jedes Gespräch.</p>
            </div>
          </div>
          <div className="commitment-item">
            <span className="commitment-emoji">🎉</span>
            <div>
              <strong>Kein Urteil</strong>
              <p>Jeder Versuch wird gefeiert – Fortschritt zählt mehr als Perfektion.</p>
            </div>
          </div>
          <div className="commitment-item">
            <span className="commitment-emoji">🤍</span>
            <div>
              <strong>Kein Kompromiss</strong>
              <p>Amy bestimmt Prioritäten. Alles andere richtet sich nach ihr.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="about-section how-it-works">
        <h3>Wie es funktioniert</h3>
        <div className="amy-loop">
          <div className="loop-step">
            <div className="loop-icon">📷</div>
            <div className="loop-content">
              <strong>Kamera</strong>
              <p>Erkennt Gesten in Echtzeit mit MediaPipe-Handtracking</p>
            </div>
          </div>
          <div className="loop-arrow">→</div>
          <div className="loop-step">
            <div className="loop-icon">🧠</div>
            <div className="loop-content">
              <strong>Erkennung</strong>
              <p>MLP-Klassifikation wandelt Handpositionen in Bedeutung um</p>
            </div>
          </div>
          <div className="loop-arrow">→</div>
          <div className="loop-step">
            <div className="loop-icon">💬</div>
            <div className="loop-content">
              <strong>Kommunikation</strong>
              <p>Sofortiges Feedback als Symbol, Text und Sprache</p>
            </div>
          </div>
          <div className="loop-arrow">→</div>
          <div className="loop-step">
            <div className="loop-icon">📚</div>
            <div className="loop-content">
              <strong>Lernen</strong>
              <p>Trainingsbeispiele verbessern die Erkennung kontinuierlich</p>
            </div>
          </div>
        </div>
      </div>

      {/* What Amy's Echo Knows */}
      <div className="about-section self-awareness">
        <h3>Was ich bin</h3>
        <div className="awareness-list">
          <div className="awareness-item">
            <span className="awareness-check">✓</span>
            <p>Ich bin eine <strong>Brücke zur Kommunikation</strong> – ich übersetze Gesten in Worte.</p>
          </div>
          <div className="awareness-item">
            <span className="awareness-check">✓</span>
            <p>Ich bin <strong>geduldig und urteilsfrei</strong> – jeder Versuch ist ein Erfolg.</p>
          </div>
          <div className="awareness-item">
            <span className="awareness-check">✓</span>
            <p>Ich bin <strong>anpassungsfähig</strong> – ich lerne aus jedem Training dazu.</p>
          </div>
          <div className="awareness-item">
            <span className="awareness-check">✓</span>
            <p>Ich bin <strong>zuverlässig</strong> – ich funktioniere auch ohne Internet.</p>
          </div>
          <div className="awareness-item">
            <span className="awareness-check">✓</span>
            <p>Ich bin <strong>für Amy</strong> – alles was ich tue, dient ihrer Kommunikation.</p>
          </div>
        </div>
      </div>

      {/* Technology */}
      <div className="about-section technology">
        <h3>Technologie</h3>
        <div className="tech-stack">
          <div className="tech-item">
            <strong>MediaPipe</strong>
            <p>Hand-Landmark-Erkennung in Echtzeit</p>
          </div>
          <div className="tech-item">
            <strong>MLP Neural Network</strong>
            <p>Klassifikation von 21 Hand-Landmarks</p>
          </div>
          <div className="tech-item">
            <strong>Browser-basiert</strong>
            <p>Funktioniert auf jedem Gerät mit Kamera</p>
          </div>
          <div className="tech-item">
            <strong>Lokale Speicherung</strong>
            <p>Daten bleiben auf dem Gerät</p>
          </div>
        </div>
      </div>

      {/* Credits */}
      <div className="about-section credits">
        <h3>Für Amy</h3>
        <p className="dedication">
          Diese App wurde mit Liebe entwickelt für Amy und alle Kinder, 
          die eine neue Art der Kommunikation brauchen. 
          Jede Geste ist eine Stimme. Jede Stimme zählt.
        </p>
        <div className="heart-pulse">❤️</div>
      </div>
    </section>
  );
}
