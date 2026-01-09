import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface HeroScreenProps {
  onStart: () => void;
}

// ========================================
// Hero/Welcome Screen - Nach Login
// ========================================
export function HeroScreen({ onStart }: HeroScreenProps) {
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
          🖐️ Zur Gebärdenkamera
        </button>
        <button className="secondary hero-cta" onClick={handleStartLearning}>
          🧠 Lernen entdecken
        </button>
      </div>
    </div>
  );
}
