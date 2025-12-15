import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { AboutAmysEcho } from './components/AboutAmysEcho';
import { Admin } from './components/Admin';
import { CaregiverArea } from './components/CaregiverArea';
import { CaregiverReport } from './components/CaregiverReport';
import { CommunicationInsights } from './components/CommunicationInsights';
import { Dashboard } from './components/Dashboard';
import { FeatureAvailability } from './components/FeatureAvailability';
import { GestureRecorder } from './components/GestureRecorder';
import { GestureHistory } from './components/GestureHistory';
import { GestureTutorial } from './components/GestureTutorial';
import { Help } from './components/Help';
import { LearningHub } from './components/LearningHub';
import { ParentalGate } from './components/ParentalGate';
import { ProfileSelect } from './components/ProfileSelect';
import { ProgressChart } from './components/ProgressChart';
import { ProgressTracker } from './components/ProgressTracker';
import { Settings } from './components/Settings';
import { Teach } from './components/Teach';
import { TrainingUploadWithRecording } from './components/TrainingUpload';
import { useApiConfig } from './hooks/useApiConfig';
import { useAppState } from './hooks/useAppState';
import './App.css';

const AUTO_HIDE_BREAKPOINT_PX = 1024;
const HIDE_SCROLL_DELTA_PX = 12;
const MIN_SCROLL_POSITION_PX = 24;

// Storage-Schlüssel
const AUTH_KEY = 'webapp:auth-complete';
const ONBOARDING_KEY = 'webapp:onboarding-complete';

// ========================================
// Auth/Login Screen - Erster Schritt
// ========================================
export function LoginScreen({ onComplete }: { onComplete: () => void }) {
  const { apiBaseUrl, setTokens, setPersistToken } = useApiConfig();
  const { setProfileId } = useAppState();
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
      const refreshToken = payload?.tokens?.refreshToken ?? '';
      const profileFromUser =
        typeof payload?.user?.username === 'string'
          ? payload.user.username
          : typeof payload?.user?.id === 'string'
            ? payload.user.id
            : null;
      const normalizedProfile = (profileFromUser ?? username).trim();
      if (accessToken) {
        setPersistToken(true);
        setTokens({ accessToken, refreshToken });
        if (normalizedProfile) {
          setProfileId(normalizedProfile);
        }
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
  }, [apiBaseUrl, authMode, username, password, setPersistToken, setTokens, setProfileId, onComplete]);

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
      </header>



      {/* CTA Buttons */}
      <div className="hero-cta-row">
        <button className="primary hero-cta" onClick={handleStartCamera}>
          🖐️ Zur Gestenkamera
        </button>
        <button className="secondary hero-cta" onClick={handleStartLearning}>
          🧠 Lernen entdecken
        </button>
      </div>


    </div>
  );
}

// ========================================
// Bottom Navigation - Amy Loop Style
// ========================================
function BottomNav() {
  const lastScrollY = useRef(0);
  const prefersAutoHide = useRef(false);
  const scrollTicking = useRef(false);
  const resizeTicking = useRef(false);
  const isHiddenRef = useRef(false);
  const [isHidden, setIsHidden] = useState(false);

  const updateAutoHidePreference = useCallback(() => {
    if (typeof window === 'undefined') return;
    prefersAutoHide.current = window.innerWidth <= AUTO_HIDE_BREAKPOINT_PX;
    if (!prefersAutoHide.current && isHiddenRef.current) {
      isHiddenRef.current = false;
      setIsHidden(false);
    }
  }, []);

  const runScrollEffect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentY = window.scrollY;
    if (!prefersAutoHide.current) {
      lastScrollY.current = currentY;
      scrollTicking.current = false;
      return;
    }

    let nextHidden = isHiddenRef.current;

    if (currentY > lastScrollY.current + HIDE_SCROLL_DELTA_PX) {
      nextHidden = true;
    } else if (
      currentY < lastScrollY.current - HIDE_SCROLL_DELTA_PX ||
      currentY < MIN_SCROLL_POSITION_PX
    ) {
      nextHidden = false;
    }

    if (nextHidden !== isHiddenRef.current) {
      isHiddenRef.current = nextHidden;
      setIsHidden(nextHidden);
    }

    lastScrollY.current = currentY;
    scrollTicking.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    lastScrollY.current = window.scrollY;
    updateAutoHidePreference();

    const handleScroll = () => {
      if (!scrollTicking.current) {
        scrollTicking.current = true;
        window.requestAnimationFrame(runScrollEffect);
      }
    };

    const handleResize = () => {
      if (!resizeTicking.current) {
        resizeTicking.current = true;
        window.requestAnimationFrame(() => {
          updateAutoHidePreference();
          resizeTicking.current = false;
        });
      }
    };

    updateAutoHidePreference();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [runScrollEffect, updateAutoHidePreference]);

  const revealNav = () => {
    if (isHiddenRef.current) {
      isHiddenRef.current = false;
      setIsHidden(false);
    }
  };

  return (
    <nav
      className={`bottom-nav${isHidden ? ' bottom-nav-hidden' : ''}`}
      onMouseEnter={revealNav}
      onFocusCapture={revealNav}
      onTouchStart={revealNav}
    >
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
// Main App Content
// ========================================
function MainAppContent() {
  return (
    <>
      <main className="content main-content">
        <Routes>
          <Route path="/" element={<GestureRecorder />} />
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
          <Route path="/betreuung" element={<CaregiverArea />} />
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
export function useAppStatus() {
  const [status, setStatus] = useState<'loading' | 'auth' | 'hero' | 'app'>('loading');
  const { apiToken, refreshToken, persistToken } = useApiConfig();

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

  useEffect(() => {
    if (status === 'loading' || !persistToken) return;

    const noActiveTokens = !apiToken && !refreshToken;
    if (noActiveTokens) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AUTH_KEY, 'false');
      }
      setStatus('auth');
    }
  }, [apiToken, persistToken, refreshToken, status]);

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
    <BrowserRouter 
      basename={import.meta.env.BASE_URL}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
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
              <NavLink to="/betreuung" title="Betreuungsbereich">🤝</NavLink>
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
      </div>
    </BrowserRouter>
  );
}

export default App;
