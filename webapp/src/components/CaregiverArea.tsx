/**
 * CaregiverArea - Caregiver control center
 * Mirrors app/src/screens/ParentScreen.tsx
 * 
 * For Amy: Gives caregivers the tools to support Amy's communication journey
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface CaregiverOption {
  title: string;
  subtitle: string;
  route: string;
  requiresGate?: boolean;
}

const CAREGIVER_SECTIONS: Array<{ title: string; items: CaregiverOption[] }> = [
  {
    title: 'Profile & Verwaltung',
    items: [
      {
        title: 'Profilverwaltung',
        subtitle: 'Profile anlegen, bearbeiten oder wechseln',
        route: '/profile'
      },
      {
        title: 'Einstellungen',
        subtitle: 'Profil, Export und lokale Daten verwalten',
        route: '/einstellungen'
      }
    ]
  },
  {
    title: 'Kernfunktionen',
    items: [
      {
        title: 'Training starten',
        subtitle: 'Neue Beispiele aufnehmen oder gemeinsam üben',
        route: '/lernen'
      },
      {
        title: 'Symbole nutzen',
        subtitle: 'Metacom-Tafel als direkte Kommunikationshilfe öffnen',
        route: '/symbole'
      },
      {
        title: 'Adminbereich',
        subtitle: 'Technische Kernwerkzeuge für Symbole und Datensicherung',
        route: '/admin',
        requiresGate: true
      }
    ]
  },
  {
    title: 'Unterstützung',
    items: [
      {
        title: 'Profile auswählen',
        subtitle: 'Zwischen aktiven Profilen und Modi wechseln',
        route: '/auswahl'
      },
      {
        title: 'Hilfe & Kontakt',
        subtitle: 'Antworten, Tipps und Ansprechpartner finden',
        route: '/hilfe'
      }
    ]
  }
];

export const CaregiverArea: React.FC = () => {
  const [profile, setProfile] = React.useState<{ name: string } | null>(null);

  React.useEffect(() => {
    const savedProfile = localStorage.getItem('amysecho_active_profile');
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch {
        // Ignore
      }
    }
  }, []);

  const profileName = profile?.name?.trim() || 'dein Kind';

  return (
    <div className="caregiver-area">
      <h2>🤝 Betreuungsbereich</h2>
      
      <div className="caregiver-intro">
        <p>
          <strong>{profileName}</strong> steht im Mittelpunkt. 
          Wähle die Karte, die zu deiner nächsten Aufgabe passt – 
          für Erkennung, Training und die nötige Verwaltung rundherum.
        </p>
      </div>

      {CAREGIVER_SECTIONS.map((section) => (
        <section key={section.title} className="caregiver-section">
          <h3>{section.title}</h3>
          <div className="option-grid">
            {section.items.map((item) => (
              <Link
                key={item.title}
                to={item.requiresGate ? `/elterntor?target=${item.route}` : item.route}
                className="option-card"
              >
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
                {item.requiresGate && (
                  <span className="gate-badge">🔒 Geschützt</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div className="caregiver-actions">
        <Link to="/" className="secondary-button">
          Zurück zur Gebärdenkamera
        </Link>
      </div>
    </div>
  );
};
