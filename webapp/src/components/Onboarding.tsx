import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Onboarding component - redirects to ProfileManager for profile setup
 */
export function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const navigate = useNavigate();

  const handleStart = useCallback(() => {
    localStorage.setItem('webapp:onboarding-complete', 'true');
    
    // Navigate to profile manager to create first profile
    navigate('/profile');
    
    if (onComplete) {
      onComplete();
    }
  }, [navigate, onComplete]);

  return (
    <section className="card onboarding-card">
      <div className="onboarding-step">
        <div className="onboarding-icon">❤️</div>
        <h2>Willkommen bei Amy's Echo!</h2>
        <p className="muted">
          Diese App hilft bei der Kommunikation durch Gebärdenerkennung.
        </p>
        <div className="amy-commitments">
          <div className="commitment">
            <span>✓</span> Zero Interruption – Kommunikation pausiert nie
          </div>
          <div className="commitment">
            <span>✓</span> Zero Confusion – Einfache, klare Oberfläche
          </div>
          <div className="commitment">
            <span>✓</span> Zero Delay – Sofortiges Feedback
          </div>
          <div className="commitment">
            <span>🔒</span> Sicher – Kryptografisch geschützte Profile
          </div>
        </div>
        <button className="primary" onClick={handleStart}>
          Profil erstellen
        </button>
      </div>
    </section>
  );
}
