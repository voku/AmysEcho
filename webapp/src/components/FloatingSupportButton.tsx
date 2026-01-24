import { Link } from 'react-router-dom';

export function FloatingSupportButton() {
  return (
    <Link
      to="/uebersicht"
      className="floating-support-button"
      aria-label="Übersicht für Einstellungen, Hilfe und Betreuung öffnen"
    >
      <span className="floating-support-icon" aria-hidden="true">⚙️</span>
      <span className="floating-support-label">Übersicht</span>
    </Link>
  );
}
