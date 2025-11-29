import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
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
import { Hero } from './components/Hero';
import { LearningHub } from './components/LearningHub';
import { Onboarding } from './components/Onboarding';
import { ParentArea } from './components/ParentArea';
import { ParentalGate } from './components/ParentalGate';
import { ProfileBar } from './components/ProfileBar';
import { ProfileSelect } from './components/ProfileSelect';
import { ProgressChart } from './components/ProgressChart';
import { ProgressTracker } from './components/ProgressTracker';
import { Settings } from './components/Settings';
import { Teach } from './components/Teach';
import { TrainingUploadWithRecording } from './components/TrainingUpload';
import { ApiConfigBar } from './components/ApiConfigBar';
import './App.css';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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
            <NavLink to="/eltern" className={({ isActive }) => (isActive ? 'active' : '')}>
              Eltern
            </NavLink>
            <NavLink to="/ueber" className={({ isActive }) => (isActive ? 'active' : '')}>
              Über
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <ApiConfigBar />
          <ProfileBar />
          <Routes>
            <Route path="/" element={<GestureDemo />} />
            <Route path="/willkommen" element={<Hero />} />
            <Route path="/auswahl" element={<ProfileSelect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/lernen" element={<LearningHub />} />
            <Route path="/verlauf" element={<GestureHistory />} />
            <Route path="/erkenntnisse" element={<CommunicationInsights />} />
            <Route path="/funktionen" element={<FeatureAvailability />} />
            <Route path="/training" element={<TrainingUploadWithRecording />} />
            <Route path="/fortschritt" element={<ProgressTracker />} />
            <Route path="/fortschritt-detail" element={<ProgressChart />} />
            <Route path="/einstellungen" element={<Settings />} />
            <Route path="/hilfe" element={<Help />} />
            <Route path="/tutorial" element={<GestureTutorial />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/ueber" element={<AboutAmysEcho />} />
            <Route path="/eltern" element={<ParentArea />} />
            <Route path="/elterntor" element={<ParentalGate />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/bericht" element={<CaregiverReport />} />
            <Route path="/beibringen" element={<Teach />} />
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
