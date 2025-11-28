import { useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';

type OnboardingStep = 'welcome' | 'name' | 'accessibility' | 'consent' | 'vocabulary' | 'complete';

interface OnboardingData {
  profileName: string;
  largeText: boolean;
  highContrast: boolean;
  analyticsConsent: boolean;
  vocabulary: string;
}

const VOCABULARY_SETS = [
  { id: 'basics', label: 'Basis', description: 'Essen, Trinken, Spielen, etc.' },
  { id: 'colors', label: 'Farben', description: 'Rot, Blau, Gelb, Grün, etc.' },
  { id: 'family', label: 'Familie', description: 'Mama, Papa, Schwester, etc.' },
  { id: 'emotions', label: 'Gefühle', description: 'Glücklich, Traurig, Müde, etc.' },
];

/**
 * Onboarding component - mirrors OnboardingScreen from the Expo app.
 * Guides new users through initial setup.
 */
export function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { setProfileId } = useAppState();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [data, setData] = useState<OnboardingData>({
    profileName: '',
    largeText: false,
    highContrast: false,
    analyticsConsent: false,
    vocabulary: 'basics',
  });

  const updateData = useCallback(<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const goToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step);
  }, []);

  const handleComplete = useCallback(() => {
    // Save profile
    const profileId = data.profileName.trim() || 'amy';
    setProfileId(profileId);
    
    // Save settings to localStorage
    const settings = {
      largeText: data.largeText,
      highContrast: data.highContrast,
      analyticsConsent: data.analyticsConsent,
      vocabulary: data.vocabulary,
      onboardingComplete: true,
    };
    localStorage.setItem('webapp:settings', JSON.stringify(settings));
    localStorage.setItem('webapp:onboarding-complete', 'true');
    
    setCurrentStep('complete');
    
    if (onComplete) {
      onComplete();
    }
  }, [data, setProfileId, onComplete]);

  const steps: Record<OnboardingStep, JSX.Element> = {
    welcome: (
      <div className="onboarding-step">
        <div className="onboarding-icon">❤️</div>
        <h2>Amy zuerst – immer.</h2>
        <p className="muted">
          Willkommen bei Amy&apos;s Echo! Diese App hilft bei der Kommunikation durch Gestenerkennung.
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
          value={data.profileName}
          onChange={(e) => updateData('profileName', e.target.value)}
          className="onboarding-input"
        />
        <div className="onboarding-buttons">
          <button className="ghost" onClick={() => goToStep('welcome')}>
            Zurück
          </button>
          <button className="primary" onClick={() => goToStep('accessibility')}>
            Weiter
          </button>
        </div>
      </div>
    ),

    accessibility: (
      <div className="onboarding-step">
        <div className="onboarding-icon">🫶</div>
        <h2>Barrierefreiheit</h2>
        <p className="muted">
          Passe Schriftgröße und Kontrast an, damit die Oberfläche überall klar erkennbar ist.
        </p>
        <div className="onboarding-toggles">
          <label className="toggle-item">
            <span>Große Schrift</span>
            <input
              type="checkbox"
              checked={data.largeText}
              onChange={(e) => updateData('largeText', e.target.checked)}
            />
          </label>
          <label className="toggle-item">
            <span>Hoher Kontrast</span>
            <input
              type="checkbox"
              checked={data.highContrast}
              onChange={(e) => updateData('highContrast', e.target.checked)}
            />
          </label>
        </div>
        <div className="onboarding-buttons">
          <button className="ghost" onClick={() => goToStep('name')}>
            Zurück
          </button>
          <button className="primary" onClick={() => goToStep('consent')}>
            Weiter
          </button>
        </div>
      </div>
    ),

    consent: (
      <div className="onboarding-step">
        <div className="onboarding-icon">🛡️</div>
        <h2>Anonyme Nutzungsdaten</h2>
        <p className="muted">
          Mit deiner Freigabe trainieren wir die Modelle anonym weiter – nie persönliche Daten, 
          nur bessere Gesten für alle.
        </p>
        <label className="consent-toggle">
          <input
            type="checkbox"
            checked={data.analyticsConsent}
            onChange={(e) => updateData('analyticsConsent', e.target.checked)}
          />
          <span>Ich stimme der anonymen Datennutzung zu</span>
        </label>
        <div className="onboarding-buttons">
          <button className="ghost" onClick={() => goToStep('accessibility')}>
            Zurück
          </button>
          <button className="primary" onClick={() => goToStep('vocabulary')}>
            Weiter
          </button>
        </div>
      </div>
    ),

    vocabulary: (
      <div className="onboarding-step">
        <div className="onboarding-icon">💬</div>
        <h2>Wortfeld auswählen</h2>
        <p className="muted">
          Starte mit dem Vokabular, das euren Alltag sofort erleichtert. Weitere Sets lassen sich jederzeit ergänzen.
        </p>
        <div className="vocabulary-grid">
          {VOCABULARY_SETS.map((vocab) => (
            <label
              key={vocab.id}
              className={`vocabulary-option ${data.vocabulary === vocab.id ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="vocabulary"
                value={vocab.id}
                checked={data.vocabulary === vocab.id}
                onChange={(e) => updateData('vocabulary', e.target.value)}
              />
              <div>
                <strong>{vocab.label}</strong>
                <p className="muted small">{vocab.description}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="onboarding-buttons">
          <button className="ghost" onClick={() => goToStep('consent')}>
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
          Dein Profil ist eingerichtet. Du kannst jetzt mit der Gestenerkennung beginnen.
        </p>
        <a href="/" className="primary-button">
          Zur Gestenerkennung
        </a>
      </div>
    ),
  };

  return (
    <section className="card onboarding-card">
      <div className="onboarding-progress">
        {(['welcome', 'name', 'accessibility', 'consent', 'vocabulary'] as OnboardingStep[]).map((step, index) => (
          <div
            key={step}
            className={`progress-dot ${currentStep === step ? 'active' : ''} ${
              ['welcome', 'name', 'accessibility', 'consent', 'vocabulary'].indexOf(currentStep) > index ? 'completed' : ''
            }`}
          />
        ))}
      </div>
      {steps[currentStep]}
    </section>
  );
}
