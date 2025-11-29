/**
 * Hero - Welcome screen with Amy Loop visualization
 * Mirrors app/src/screens/HeroScreen.tsx
 * 
 * For Amy: The first thing Amy sees - a welcoming, clear starting point
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface WorkflowStep {
  icon: string;
  label: string;
  route: string;
  description: string;
}

const AMY_LOOP_STEPS: WorkflowStep[] = [
  {
    icon: '📷',
    label: 'Kamera',
    route: '/',
    description: 'Hand zeigen'
  },
  {
    icon: '🔍',
    label: 'Erkennung',
    route: '/',
    description: 'Geste erkennen'
  },
  {
    icon: '💬',
    label: 'Kommunikation',
    route: '/verlauf',
    description: 'Stimme geben'
  },
  {
    icon: '📚',
    label: 'Lernen',
    route: '/lernen',
    description: 'Besser werden'
  }
];

const AMY_FIRST_COMMITMENTS = [
  { icon: '⚡', title: 'Zero Interruption', description: 'Amys Kommunikation pausiert nie' },
  { icon: '🎯', title: 'Zero Confusion', description: 'Einfache, klare UI immer' },
  { icon: '⏱️', title: 'Zero Delay', description: 'Sofortiges Feedback für alles' },
  { icon: '🛡️', title: 'Zero Failure', description: 'Mehrere Fallback-Ebenen' },
  { icon: '💚', title: 'Zero Judgment', description: 'Versuche feiern, nicht nur Erfolge' },
  { icon: '❤️', title: 'Zero Compromise', description: 'Amys Bedürfnisse zuerst' }
];

export const Hero: React.FC = () => {
  return (
    <div className="hero-screen">
      {/* Header */}
      <header className="hero-header">
        <span className="hero-pill">Amy's Echo hört zu</span>
        <h1 className="hero-title">Willkommen bei Amy's Echo</h1>
        <p className="hero-subtitle">
          Die Gestenkamera übersetzt jedes Zeichen direkt in Stimme, Symbole und Verlauf.
          So bleibt das Gespräch mit Amy's Echo nie stehen.
        </p>
      </header>

      {/* Amy Loop Timeline */}
      <section className="amy-loop-section">
        <div className="amy-loop-timeline">
          {AMY_LOOP_STEPS.map((step, index) => (
            <React.Fragment key={step.label}>
              <Link to={step.route} className="loop-step-card">
                <span className="step-icon">{step.icon}</span>
                <strong>{step.label}</strong>
                <span className="step-desc">{step.description}</span>
              </Link>
              {index < AMY_LOOP_STEPS.length - 1 && (
                <span className="loop-arrow">→</span>
              )}
            </React.Fragment>
          ))}
          <span className="loop-return">↩️</span>
        </div>
      </section>

      {/* CTA Buttons */}
      <div className="hero-cta-row">
        <Link to="/" className="primary-button hero-cta">
          Zur Gestenkamera
        </Link>
        <Link to="/lernen" className="secondary-button hero-cta">
          Lernen entdecken
        </Link>
      </div>

      {/* Amy First Commitments */}
      <section className="commitments-section">
        <h2>Amy First Commitments</h2>
        <div className="commitment-grid">
          {AMY_FIRST_COMMITMENTS.map((commitment) => (
            <div key={commitment.title} className="commitment-card">
              <span className="commitment-icon">{commitment.icon}</span>
              <div className="commitment-content">
                <strong>{commitment.title}</strong>
                <p>{commitment.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Support Links */}
      <section className="hero-support">
        <h3>Unterstützung</h3>
        <div className="support-links">
          <Link to="/hilfe" className="support-link">
            ❓ Hilfe & FAQ
          </Link>
          <Link to="/tutorial" className="support-link">
            📖 Anleitung
          </Link>
          <Link to="/einstellungen" className="support-link">
            ⚙️ Einstellungen
          </Link>
          <Link to="/ueber" className="support-link">
            ℹ️ Über Amy's Echo
          </Link>
        </div>
      </section>
    </div>
  );
};
