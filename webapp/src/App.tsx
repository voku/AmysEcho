import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HeroScreen } from './components/HeroScreen';
import { LoginScreen } from './components/LoginScreen';
import { MainAppContent } from './components/MainAppContent';
import { useAppStatus } from './hooks/useAppStatus';
import './App.css';


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
    >
      <div className="app-shell">
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
