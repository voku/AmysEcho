import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { FeatureAvailability } from './components/FeatureAvailability';
import { GestureDemo } from './components/GestureDemo';
import { GestureHistory } from './components/GestureHistory';
import { GestureTutorial } from './components/GestureTutorial';
import { Help } from './components/Help';
import { LearningHub } from './components/LearningHub';
import { Onboarding } from './components/Onboarding';
import { ProfileBar } from './components/ProfileBar';
import { ProgressTracker } from './components/ProgressTracker';
import { Settings } from './components/Settings';
import { TrainingUploadWithRecording } from './components/TrainingUpload';
import { ApiConfigBar } from './components/ApiConfigBar';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">Amy&apos;s Echo</p>
            <h1>Web-Preview der Gestenerkennung</h1>
            <p className="muted">
              Diese Web-App nutzt dasselbe Gesture-Detector-Bundle wie die Expo-Version, ersetzt aber native Funktionen durch
              Browser-Pendants oder deaktivierte Pfade.
            </p>
          </div>
          <nav className="nav">
            <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')} end>
              Erkennung
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/lernen" className={({ isActive }) => (isActive ? 'active' : '')}>
              Lernen
            </NavLink>
            <NavLink to="/verlauf" className={({ isActive }) => (isActive ? 'active' : '')}>
              Verlauf
            </NavLink>
            <NavLink to="/training" className={({ isActive }) => (isActive ? 'active' : '')}>
              Training
            </NavLink>
            <NavLink to="/fortschritt" className={({ isActive }) => (isActive ? 'active' : '')}>
              Fortschritt
            </NavLink>
            <NavLink to="/einstellungen" className={({ isActive }) => (isActive ? 'active' : '')}>
              Einstellungen
            </NavLink>
            <NavLink to="/hilfe" className={({ isActive }) => (isActive ? 'active' : '')}>
              Hilfe
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <ApiConfigBar />
          <ProfileBar />
          <Routes>
            <Route path="/" element={<GestureDemo />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/lernen" element={<LearningHub />} />
            <Route path="/verlauf" element={<GestureHistory />} />
            <Route path="/funktionen" element={<FeatureAvailability />} />
            <Route path="/training" element={<TrainingUploadWithRecording />} />
            <Route path="/fortschritt" element={<ProgressTracker />} />
            <Route path="/einstellungen" element={<Settings />} />
            <Route path="/hilfe" element={<Help />} />
            <Route path="/tutorial" element={<GestureTutorial />} />
            <Route path="/onboarding" element={<Onboarding />} />
          </Routes>
        </main>

        <footer className="muted footer">
          Bekannte Unterschiede: kein SecureStore, keine nativen Haptics, Kamerazugriff nur mit Browser-Freigabe, Clip-Export
          über einfache Downloads.
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
