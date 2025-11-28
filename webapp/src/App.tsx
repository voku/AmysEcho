import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { FeatureAvailability } from './components/FeatureAvailability';
import { GestureDemo } from './components/GestureDemo';
import { GestureHistory } from './components/GestureHistory';
import { ProfileBar } from './components/ProfileBar';
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
              Gestenerkennung
            </NavLink>
            <NavLink to="/verlauf" className={({ isActive }) => (isActive ? 'active' : '')}>
              Verlauf
            </NavLink>
            <NavLink to="/training" className={({ isActive }) => (isActive ? 'active' : '')}>
              Training / Upload
            </NavLink>
            <NavLink to="/funktionen" className={({ isActive }) => (isActive ? 'active' : '')}>
              Grenzen & Alternativen
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <ApiConfigBar />
          <ProfileBar />
          <Routes>
            <Route path="/" element={<GestureDemo />} />
            <Route path="/verlauf" element={<GestureHistory />} />
            <Route path="/funktionen" element={<FeatureAvailability />} />
            <Route path="/training" element={<TrainingUploadWithRecording />} />
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
