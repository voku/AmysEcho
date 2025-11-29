/**
 * Teach - Simple entry point to add new gestures
 * Mirrors app/src/screens/TeachScreen.tsx
 * 
 * For Amy: A simple way to teach Amy new signs
 */
import React from 'react';
import { Link } from 'react-router-dom';

export const Teach: React.FC = () => {
  return (
    <div className="teach-screen">
      <div className="teach-content">
        <span className="teach-icon">✋</span>
        <h2>Neue Gebärde beibringen</h2>
        <p className="muted">
          Hilf Amy, neue Gesten zu lernen, indem du Trainingsbeispiele aufnimmst.
        </p>
        
        <Link to="/training" className="primary-button teach-button">
          Neue Gebärde hinzufügen
        </Link>
        
        <div className="teach-info">
          <h3>So funktioniert's:</h3>
          <ol>
            <li>Wähle eine Geste aus der Liste oder erstelle eine neue</li>
            <li>Zeige die Geste vor der Kamera</li>
            <li>Nimm mehrere Beispiele auf (je mehr, desto besser!)</li>
            <li>Die Beispiele werden zum Trainieren hochgeladen</li>
          </ol>
        </div>

        <div className="teach-tips">
          <h3>💡 Tipps für gute Trainingsbeispiele:</h3>
          <ul>
            <li>Gute Beleuchtung – Amy sieht besser bei Tageslicht</li>
            <li>Freier Hintergrund – weniger Ablenkung für die Erkennung</li>
            <li>Verschiedene Winkel – hilft Amy, die Geste zu verallgemeinern</li>
            <li>Natürliche Bewegungen – so wie die Geste im Alltag aussieht</li>
          </ul>
        </div>

        <Link to="/lernen" className="secondary-button">
          Zurück zum Lernbereich
        </Link>
      </div>
    </div>
  );
};
