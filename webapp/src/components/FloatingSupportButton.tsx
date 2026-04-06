import { Link } from 'react-router-dom';

export function FloatingSupportButton() {
  return (
    <Link
      to="/betreuung"
      className="floating-support-button"
      aria-label="Betreuungsbereich mit Profilen, Hilfe und Wartung öffnen"
    >
      <span className="floating-support-icon" aria-hidden="true">⚙️</span>
      <span className="floating-support-label">Betreuung</span>
    </Link>
  );
}
