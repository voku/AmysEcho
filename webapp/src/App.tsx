import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { AboutAmysEcho } from './components/AboutAmysEcho';
import { CommunicationInsights } from './components/CommunicationInsights';
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
            <h1>Gestenerkennung für Amy</h1>
            <p className="muted">
              Amy zuerst – immer. Jede Geste ist eine Stimme. Jede Stimme zählt.
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
            <NavLink to="/erkenntnisse" className={({ isActive }) => (isActive ? 'active' : '')}>
              Erkenntnisse
            </NavLink>
            <NavLink to="/training" className={({ isActive }) => (isActive ? 'active' : '')}>
              Training
            </NavLink>
            <NavLink to="/einstellungen" className={({ isActive }) => (isActive ? 'active' : '')}>
              Einstellungen
            </NavLink>
            <NavLink to="/ueber" className={({ isActive }) => (isActive ? 'active' : '')}>
              Über Amy&apos;s Echo
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
            <Route path="/erkenntnisse" element={<CommunicationInsights />} />
            <Route path="/funktionen" element={<FeatureAvailability />} />
            <Route path="/training" element={<TrainingUploadWithRecording />} />
            <Route path="/fortschritt" element={<ProgressTracker />} />
            <Route path="/einstellungen" element={<Settings />} />
            <Route path="/hilfe" element={<Help />} />
            <Route path="/tutorial" element={<GestureTutorial />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/ueber" element={<AboutAmysEcho />} />
          </Routes>
        </main>

        <footer className="muted footer">
          ❤️ Für Amy – Jede Geste ist eine Stimme.
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
