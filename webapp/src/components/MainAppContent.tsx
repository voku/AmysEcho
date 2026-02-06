import { Navigate, Route, Routes } from 'react-router-dom';
import { AboutAmysEcho } from './AboutAmysEcho';
import { Admin } from './Admin';
import { BottomNav } from './BottomNav';
import { CaregiverArea } from './CaregiverArea';
import { CaregiverReport } from './CaregiverReport';
import { CommunicationInsights } from './CommunicationInsights';
import { Dashboard } from './Dashboard';
import { FeatureAvailability } from './FeatureAvailability';
import { FloatingSupportButton } from './FloatingSupportButton';
import { Help } from './Help';
import { LearningHub } from './LearningHub';
import { MetacomBoard } from './MetacomBoard';
import { ParentalGate } from './ParentalGate';
import { ProfileManager } from './ProfileManager';
import { ProfileSelect } from './ProfileSelect';
import { ProgressChart } from './ProgressChart';
import { ProgressTracker } from './ProgressTracker';
import { Settings } from './Settings';
import { SettingsOverview } from './SettingsOverview';
import { SignLanguageHistory } from './SignLanguageHistory';
import { SignLanguageRecorder } from './SignLanguageRecorder';
import { SignLanguageTutorial } from './SignLanguageTutorial';
import { SignVideoGallery } from './SignVideoGallery';
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
          <Route path="/verlauf" element={<SignLanguageHistory />} />
          <Route path="/lernen" element={<LearningHub />} />
          <Route path="/symbole" element={<MetacomBoard />} />
          <Route path="/tafel" element={<Navigate to="/symbole" replace />} />
          <Route path="/training" element={<TrainingUploadWithRecording />} />
          <Route path="/videos" element={<SignVideoGallery />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/erkenntnisse" element={<CommunicationInsights />} />
          <Route path="/fortschritt" element={<ProgressTracker />} />
          <Route path="/fortschritt-detail" element={<ProgressChart />} />
          <Route path="/einstellungen" element={<Settings />} />
          <Route path="/uebersicht" element={<SettingsOverview />} />
          <Route path="/hilfe" element={<Help />} />
          <Route path="/tutorial" element={<SignLanguageTutorial />} />
          <Route path="/ueber" element={<AboutAmysEcho />} />
          <Route path="/betreuung" element={<CaregiverArea />} />
          <Route path="/elterntor" element={<ParentalGate />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/bericht" element={<CaregiverReport />} />
          <Route path="/beibringen" element={<Teach />} />
          <Route path="/auswahl" element={<ProfileSelect />} />
          <Route path="/profile" element={<ProfileManager />} />
          <Route path="/funktionen" element={<FeatureAvailability />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <FloatingSupportButton />
      <BottomNav />
    </>
  );
}
