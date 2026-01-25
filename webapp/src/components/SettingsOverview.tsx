import { Link } from 'react-router-dom';

const OVERVIEW_ITEMS = [
  {
    title: 'Einstellungen',
    description: 'Profil, Datenschutz und Geräteoptionen konfigurieren.',
    route: '/einstellungen',
  },
  {
    title: 'Hilfe',
    description: 'Antworten, Tipps und Anleitungen für den Alltag.',
    route: '/hilfe',
  },
  {
    title: 'Betreuung',
    description: 'Berichte, Fortschritt und Unterstützungsfunktionen öffnen.',
    route: '/betreuung',
  },
  {
    title: 'Adminbereich',
    description: 'Sicherungen, Imports und technische Werkzeuge verwalten.',
    route: '/elterntor?target=/admin',
  },
];

export function SettingsOverview() {
  return (
    <section className="card settings-overview">
      <div className="card-header">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h2>Schaltzentrale</h2>
          <p className="muted">
            Alle wichtigen Bereiche gebündelt, damit du schnell weiterkommst.
          </p>
        </div>
      </div>

      <div className="settings-overview-grid">
        {OVERVIEW_ITEMS.map((item) => (
          <Link key={item.title} to={item.route} className="settings-overview-card">
            <strong>{item.title}</strong>
            <p className="muted">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
