import { Navigate, Route, Routes } from 'react-router-dom';
import { Admin } from './Admin';
import { BottomNav } from './BottomNav';
import { CaregiverArea } from './CaregiverArea';
import { FloatingSupportButton } from './FloatingSupportButton';
import { Help } from './Help';
import { LearningHub } from './LearningHub';
import { MetacomBoard } from './MetacomBoard';
import { ParentalGate } from './ParentalGate';
import { ProfileManager } from './ProfileManager';
import { ProfileSelect } from './ProfileSelect';
import { Settings } from './Settings';
import { SignLanguageRecorder } from './SignLanguageRecorder';
import { Teach } from './Teach';
import { TrainingUploadWithRecording } from './TrainingUpload';

// ========================================
// Main App Content
// ========================================
export function MainAppContent() {
  return (
    <>
      <main className="content main-content">
        <Routes>
          <Route path="/" element={<SignLanguageRecorder />} />
          <Route path="/lernen" element={<LearningHub />} />
          <Route path="/symbole" element={<MetacomBoard />} />
          <Route path="/tafel" element={<Navigate to="/symbole" replace />} />
          <Route path="/training" element={<TrainingUploadWithRecording />} />
          <Route path="/einstellungen" element={<Settings />} />
          <Route path="/hilfe" element={<Help />} />
          <Route path="/betreuung" element={<CaregiverArea />} />
          <Route path="/elterntor" element={<ParentalGate />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/beibringen" element={<Teach />} />
          <Route path="/auswahl" element={<ProfileSelect />} />
          <Route path="/profile" element={<ProfileManager />} />
          <Route path="/verlauf" element={<Navigate to="/" replace />} />
          <Route path="/videos" element={<Navigate to="/lernen" replace />} />
          <Route path="/dashboard" element={<Navigate to="/betreuung" replace />} />
          <Route path="/erkenntnisse" element={<Navigate to="/betreuung" replace />} />
          <Route path="/fortschritt" element={<Navigate to="/lernen" replace />} />
          <Route path="/fortschritt-detail" element={<Navigate to="/lernen" replace />} />
          <Route path="/uebersicht" element={<Navigate to="/betreuung" replace />} />
          <Route path="/tutorial" element={<Navigate to="/hilfe" replace />} />
          <Route path="/ueber" element={<Navigate to="/hilfe" replace />} />
          <Route path="/bericht" element={<Navigate to="/betreuung" replace />} />
          <Route path="/funktionen" element={<Navigate to="/hilfe" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <FloatingSupportButton />
      <BottomNav />
    </>
  );
}
