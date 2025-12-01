import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, NavLink, Route, Routes, Navigate, useNavigate, Link } from 'react-router-dom';
import { AboutAmysEcho } from './components/AboutAmysEcho';
import { Admin } from './components/Admin';
import { CaregiverReport } from './components/CaregiverReport';
import { CommunicationInsights } from './components/CommunicationInsights';
import { Dashboard } from './components/Dashboard';
import { FeatureAvailability } from './components/FeatureAvailability';
import { GestureDemo } from './components/GestureDemo';
import { GestureHistory } from './components/GestureHistory';
import { GestureTutorial } from './components/GestureTutorial';
import { Help } from './components/Help';
import { LearningHub } from './components/LearningHub';
import { ParentArea } from './components/ParentArea';
import { ParentalGate } from './components/ParentalGate';
import { ProfileSelect } from './components/ProfileSelect';
import { ProgressChart } from './components/ProgressChart';
import { ProgressTracker } from './components/ProgressTracker';
import { Settings } from './components/Settings';
import { Teach } from './components/Teach';
import { TrainingUploadWithRecording } from './components/TrainingUpload';
import { useApiConfig } from './hooks/useApiConfig';
import { useSymbolStore } from './context/SymbolStore';
import './App.css';

// Storage-Schlüssel
const AUTH_KEY = 'webapp:auth-complete';
const ONBOARDING_KEY = 'webapp:onboarding-complete';

// ========================================
// Auth/Login Screen - Erster Schritt
// ========================================
function LoginScreen({ onComplete }: { onComplete: () => void }) {
  const { apiBaseUrl, setApiToken, setPersistToken } = useApiConfig();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setMessage('Bitte fülle Nutzername und Passwort aus.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Wird gesendet…');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Anmeldung fehlgeschlagen.');
      }

      const accessToken = payload?.tokens?.accessToken;
      if (accessToken) {
        setPersistToken(true);
        setApiToken(accessToken);
        setMessage('Erfolgreich! Weiter geht\'s…');
        setTimeout(onComplete, 500);
      } else {
        setMessage('Antwort ohne Token erhalten.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, authMode, username, password, setApiToken, setPersistToken, onComplete]);

  const handleSkip = useCallback(() => {
    // Ermöglicht das Überspringen für Demo-Zwecke
    onComplete();
  }, [onComplete]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">🔐</span>
          <h1>Willkommen bei Amy&apos;s Echo</h1>
          <p className="muted">
            Melde dich an oder erstelle ein neues Konto, um fortzufahren.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-mode-toggle">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => { setAuthMode('login'); setMessage(''); }}
            >
              Anmelden
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => { setAuthMode('register'); setMessage(''); }}
            >
              Registrieren
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="username">Nutzername</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Dein Nutzername"
              autoComplete={authMode === 'login' ? 'username' : 'new-username'}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {message && <p className="auth-message">{message}</p>}

          <button type="submit" className="primary full-width" disabled={isSubmitting}>
            {isSubmitting ? 'Wird gesendet…' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>

          <button type="button" className="ghost full-width" onClick={handleSkip}>
            Ohne Anmeldung fortfahren (Demo)
          </button>
        </form>

        <p className="auth-hint muted small">
          Die Anmeldung verbindet dich mit dem Backend für Gestentraining und Synchronisation.
        </p>
      </div>
    </div>
  );
}

// ========================================
// Hero/Welcome Screen - Nach Login
// ========================================
function HeroScreen({ onStart }: { onStart: () => void }) {
  const navigate = useNavigate();

  const handleStartCamera = useCallback(() => {
    onStart();
    navigate('/');
  }, [onStart, navigate]);

  const handleStartLearning = useCallback(() => {
    onStart();
    navigate('/lernen');
  }, [onStart, navigate]);

  return (
    <div className="hero-screen">
      <header className="hero-header">
        <span className="hero-pill">Amy&apos;s Echo hört zu</span>
        <h1 className="hero-title">Willkommen bei Amy&apos;s Echo</h1>
        <p className="hero-subtitle">
          Die Gestenkamera übersetzt jedes Zeichen direkt in Stimme, Symbole und Verlauf.
          So bleibt das Gespräch mit Amy&apos;s Echo nie stehen.
        </p>
      </header>

      {/* Amy Loop Visualization */}
      <section className="amy-loop-section">
        <h2 className="amy-loop-title">Der Amy-Loop</h2>
        <div className="amy-loop-timeline">
          <div className="loop-step-card">
            <span className="step-icon">🖐️</span>
            <strong>Kamera</strong>
            <span className="step-desc">Geste zeigen</span>
          </div>
          <span className="loop-arrow">→</span>
          <div className="loop-step-card">
            <span className="step-icon">🗂️</span>
            <strong>Verlauf</strong>
            <span className="step-desc">Geste prüfen</span>
          </div>
          <span className="loop-arrow">→</span>
          <div className="loop-step-card">
            <span className="step-icon">🧠</span>
            <strong>Lernen</strong>
            <span className="step-desc">Modell stärken</span>
          </div>
          <span className="loop-return">↩️</span>
        </div>
      </section>

      {/* CTA Buttons */}
      <div className="hero-cta-row">
        <button className="primary hero-cta" onClick={handleStartCamera}>
          🖐️ Zur Gestenkamera
        </button>
        <button className="secondary hero-cta" onClick={handleStartLearning}>
          🧠 Lernen entdecken
        </button>
      </div>

      {/* Amy First Commitments */}
      <section className="commitments-section">
        <h2>Amy First Commitments</h2>
        <div className="commitment-grid">
          <div className="commitment-card">
            <span className="commitment-icon">⚡</span>
            <div className="commitment-content">
              <strong>Zero Interruption</strong>
              <p>Amys Kommunikation pausiert nie</p>
            </div>
          </div>
          <div className="commitment-card">
            <span className="commitment-icon">🎯</span>
            <div className="commitment-content">
              <strong>Zero Confusion</strong>
              <p>Einfache, klare UI immer</p>
            </div>
          </div>
          <div className="commitment-card">
            <span className="commitment-icon">⏱️</span>
            <div className="commitment-content">
              <strong>Zero Delay</strong>
              <p>Sofortiges Feedback für alles</p>
            </div>
          </div>
          <div className="commitment-card">
            <span className="commitment-icon">🛡️</span>
            <div className="commitment-content">
              <strong>Zero Failure</strong>
              <p>Mehrere Fallback-Ebenen</p>
            </div>
          </div>
          <div className="commitment-card">
            <span className="commitment-icon">💚</span>
            <div className="commitment-content">
              <strong>Zero Judgment</strong>
              <p>Versuche feiern, nicht nur Erfolge</p>
            </div>
          </div>
          <div className="commitment-card">
            <span className="commitment-icon">❤️</span>
            <div className="commitment-content">
              <strong>Zero Compromise</strong>
              <p>Amys Bedürfnisse zuerst</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ========================================
// Bottom Navigation - Amy Loop Style
// ========================================
function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink
        to="/"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        end
      >
        <span className="nav-icon">🖐️</span>
        <span className="nav-label">Kamera</span>
      </NavLink>
      <NavLink
        to="/verlauf"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <span className="nav-icon">🗂️</span>
        <span className="nav-label">Verlauf</span>
      </NavLink>
      <NavLink
        to="/lernen"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <span className="nav-icon">🧠</span>
        <span className="nav-label">Lernen</span>
      </NavLink>
    </nav>
  );
}

// ========================================
// Workflow Reminder - keeps main actions visible
// ========================================
function WorkflowGuide() {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const { symbols, loading, syncError, lastSyncedAt } = useSymbolStore();
  const { profileId, lastRecognizedGesture } = useAppState();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const pendingCount = symbols.filter((symbol) => symbol.pending).length;

  const syncStatus = syncError
    ? `Sync-Fehler: ${syncError}`
    : loading
    ? 'Synchronisiere Symbole…'
    : pendingCount > 0
    ? `${pendingCount} Symbol(e) warten auf Upload`
    : lastSyncedAt
    ? `Synchronisiert um ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : 'Noch kein Sync durchgeführt';

  const connectionLabel = apiBaseUrl
    ? apiToken
      ? 'Backend verbunden'
      : 'Demo-Modus aktiv'
    : 'Kein Backend gewählt';

  const lastGestureLabel = lastRecognizedGesture || 'Noch nichts erkannt';

  return (
    <section className="card workflow-card" aria-label="Hauptablauf und Status">
      <div className="workflow-bar">
        <div className="workflow-title-row">
          <p className="eyebrow">Hauptablauf</p>
          <div className="workflow-summary" aria-live="polite">
            <span>{connectionLabel}</span>
            <span>•</span>
            <span>{syncStatus}</span>
            <span>•</span>
            <span>Profil {profileId}</span>
          </div>
        </div>
        <div className="workflow-quick">
          <Link to="/" className="workflow-mini primary">
            🖐️ Kamera
          </Link>
          <Link to="/lernen" className="workflow-mini">
            🧠 Lernen
          </Link>
          <button
            type="button"
            className="workflow-toggle"
            onClick={() => setDetailsOpen((prev) => !prev)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? 'Details ausblenden' : 'Details anzeigen'}
          </button>
        </div>
      </div>

      {detailsOpen && (
        <>
          <div className="workflow-chips" role="status" aria-live="polite">
            <div className="chip neutral">
              <span className="chip-label">Verbindung</span>
              <strong>{connectionLabel}</strong>
            </div>
            <div className={`chip ${syncError ? 'danger' : pendingCount > 0 ? 'warning' : 'success'}`}>
              <span className="chip-label">Symbole</span>
              <strong>{syncStatus}</strong>
            </div>
            <div className="chip neutral">
              <span className="chip-label">Letzte Geste</span>
              <strong>{lastGestureLabel}</strong>
            </div>
          </div>

          <div className="workflow-actions">
            <Link to="/verlauf" className="workflow-action">
              🗂️ Verlauf prüfen
            </Link>
            <Link to="/training" className="workflow-action ghost">
              🎥 Trainingsdaten hochladen
            </Link>
            <Link to="/" className="workflow-action primary">
              🖐️ Erkennung öffnen
            </Link>
            <Link to="/lernen" className="workflow-action">
              🧠 Lernen & Symbole
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// ========================================
// Main App Content
// ========================================
function MainAppContent() {
  return (
    <>
      <WorkflowGuide />
      <main className="content main-content">
        <Routes>
          <Route path="/" element={<GestureDemo />} />
          <Route path="/verlauf" element={<GestureHistory />} />
          <Route path="/lernen" element={<LearningHub />} />
          <Route path="/training" element={<TrainingUploadWithRecording />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/erkenntnisse" element={<CommunicationInsights />} />
          <Route path="/fortschritt" element={<ProgressTracker />} />
          <Route path="/fortschritt-detail" element={<ProgressChart />} />
          <Route path="/einstellungen" element={<Settings />} />
          <Route path="/hilfe" element={<Help />} />
          <Route path="/tutorial" element={<GestureTutorial />} />
          <Route path="/ueber" element={<AboutAmysEcho />} />
          <Route path="/eltern" element={<ParentArea />} />
          <Route path="/elterntor" element={<ParentalGate />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/bericht" element={<CaregiverReport />} />
          <Route path="/beibringen" element={<Teach />} />
          <Route path="/auswahl" element={<ProfileSelect />} />
          <Route path="/funktionen" element={<FeatureAvailability />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}

// ========================================
// App Status Hook
// ========================================
function useAppStatus() {
  const [status, setStatus] = useState<'loading' | 'auth' | 'hero' | 'app'>('loading');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = window.localStorage.getItem(AUTH_KEY) === 'true';
      const isOnboarded = window.localStorage.getItem(ONBOARDING_KEY) === 'true';

      if (!isAuth) {
        setStatus('auth');
      } else if (!isOnboarded) {
        setStatus('hero');
      } else {
        setStatus('app');
      }
    }
  }, []);

  const completeAuth = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_KEY, 'true');
    }
    setStatus('hero');
  }, []);

  const completeOnboarding = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setStatus('app');
  }, []);

  return { status, completeAuth, completeOnboarding };
}

// ========================================
// Main App Component
// ========================================
function App() {
  const { status, completeAuth, completeOnboarding } = useAppStatus();

  // Ladebildschirm
  if (status === 'loading') {
    return (
      <div className="app-shell loading-shell">
        <div className="loading-screen">
          <span className="loading-icon">❤️</span>
          <p>Lädt…</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="app-shell">
        {/* Header - immer sichtbar */}
        <header className="app-header compact-header">
          <div className="header-brand">
            <span className="brand-icon">❤️</span>
            <div>
              <p className="eyebrow">Amy&apos;s Echo</p>
              <h1>Gestenerkennung für Amy</h1>
            </div>
          </div>
          {status === 'app' && (
            <nav className="header-nav">
              <NavLink to="/einstellungen">⚙️</NavLink>
              <NavLink to="/hilfe">❓</NavLink>
              <NavLink to="/eltern">👨‍👩‍👧</NavLink>
            </nav>
          )}
        </header>

        {/* Content basierend auf Status */}
        {status === 'auth' && (
          <main className="content auth-content">
            <Routes>
              <Route path="*" element={<LoginScreen onComplete={completeAuth} />} />
            </Routes>
          </main>
        )}

        {status === 'hero' && (
          <main className="content hero-content">
            <Routes>
              <Route path="*" element={<HeroScreen onStart={completeOnboarding} />} />
            </Routes>
          </main>
        )}

        {status === 'app' && <MainAppContent />}

        {/* Footer - nur im Auth/Hero Modus */}
        {(status === 'auth' || status === 'hero') && (
          <footer className="muted footer">
            ❤️ Für Amy – Jede Geste ist eine Stimme.
          </footer>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
