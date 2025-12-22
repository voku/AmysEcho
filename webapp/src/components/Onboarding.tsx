import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState';

type OnboardingStep = 'welcome' | 'name' | 'complete';

/**
 * Onboarding component - mirrors OnboardingScreen from the Expo app.
 * Guides new users through initial setup.
 */
export function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { setProfileId, setDisplayName } = useAppState();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [profileName, setProfileName] = useState('');

  const goToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step);
  }, []);

  const handleComplete = useCallback(() => {
    // Save profile
    const displayName = profileName.trim();
    const profileId = displayName
      ? displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      : 'amy';
    
    setProfileId(profileId);
    if (displayName) {
      setDisplayName(displayName);
    }
    
    localStorage.setItem('webapp:onboarding-complete', 'true');
    
    setCurrentStep('complete');
    
    if (onComplete) {
      onComplete();
    }
  }, [profileName, setProfileId, setDisplayName, onComplete]);

  const steps: Record<OnboardingStep, React.JSX.Element> = {
    welcome: (
      <div className="onboarding-step">
        <div className="onboarding-icon">❤️</div>
        <h2>Amy zuerst – immer.</h2>
        <p className="muted">
          Willkommen bei Amy&apos;s Echo! Diese App hilft bei der Kommunikation durch Gebärdenerkennung.
          Der neue Amy-Loop bedeutet: Kamera → Verlauf → Lernen.
        </p>
        <div className="amy-commitments">
          <div className="commitment">
            <span>✓</span> Zero Interruption – Amy&apos;s Kommunikation pausiert nie
          </div>
          <div className="commitment">
            <span>✓</span> Zero Confusion – Einfache, klare Oberfläche
          </div>
          <div className="commitment">
            <span>✓</span> Zero Delay – Sofortiges Feedback
          </div>
        </div>
        <button className="primary" onClick={() => goToStep('name')}>
          Weiter
        </button>
      </div>
    ),

    name: (
      <div className="onboarding-step">
        <div className="onboarding-icon">👋</div>
        <h2>Wie darf ich dich nennen?</h2>
        <p className="muted">
          Gib einen Namen für dein Profil ein. Lass das Feld leer, wenn du bei &quot;Amy&quot; bleiben möchtest.
        </p>
        <input
          type="text"
          placeholder="Dein Name (optional)"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          className="onboarding-input"
        />
        <div className="onboarding-buttons">
          <button className="ghost" onClick={() => goToStep('welcome')}>
            Zurück
          </button>
          <button className="primary" onClick={handleComplete}>
            Fertig!
          </button>
        </div>
      </div>
    ),

    complete: (
      <div className="onboarding-step">
        <div className="onboarding-icon">🎉</div>
        <h2>Alles bereit!</h2>
        <p className="muted">
          Dein Profil ist eingerichtet. Du kannst jetzt mit der Gebärdenerkennung beginnen.
        </p>
        <Link to="/" className="primary-button">
          Zur Gebärdenerkennung
        </Link>
      </div>
    ),
  };

  return (
    <section className="card onboarding-card">
      <div className="onboarding-progress">
        {(['welcome', 'name'] as OnboardingStep[]).map((step, index) => (
          <div
            key={step}
            className={`progress-dot ${currentStep === step ? 'active' : ''} ${
              ['welcome', 'name'].indexOf(currentStep) > index ? 'completed' : ''
            }`}
          />
        ))}
      </div>
      {steps[currentStep]}
    </section>
  );
}
