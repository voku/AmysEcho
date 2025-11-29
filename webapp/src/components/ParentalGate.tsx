/**
 * ParentalGate - Math challenge to access protected areas
 * Mirrors app/src/screens/ParentalGateScreen.tsx
 * 
 * For Amy: Protects sensitive areas while keeping Amy safe
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const ParentalGate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const target = searchParams.get('target') || '/';
  
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState(0);
  const [answer, setAnswer] = useState('');
  const [attempts, setAttempts] = useState(0);

  const generateProblem = () => {
    const a = Math.floor(Math.random() * 10) + 2; // 2..11
    const b = Math.floor(Math.random() * 10) + 2;
    setProblem(`${a} × ${b} = ?`);
    setSolution(a * b);
    setAnswer('');
  };

  useEffect(() => {
    generateProblem();
  }, []);

  const handleCheck = () => {
    if (parseInt(answer, 10) === solution) {
      // Correct! Navigate to target
      navigate(target);
    } else {
      // Wrong answer
      setAttempts(prev => prev + 1);
      generateProblem();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCheck();
    }
  };

  return (
    <div className="parental-gate">
      <div className="gate-card">
        <h2 className="gate-problem">{problem}</h2>
        
        <p className="gate-description">
          Bitte beantworte die kurze Rechenaufgabe, um fortzufahren.
        </p>

        <input
          type="number"
          className="gate-input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Antwort eingeben"
          autoFocus
          aria-label="Antwort auf Elternprüfung"
        />

        {attempts > 0 && (
          <p className="gate-hint">
            Das war nicht richtig. Versuch es noch einmal!
          </p>
        )}

        <div className="gate-actions">
          <button className="primary-button" onClick={handleCheck}>
            Bestätigen
          </button>
          <button className="secondary-button" onClick={() => navigate(-1)}>
            Zurück
          </button>
        </div>
      </div>
    </div>
  );
};
