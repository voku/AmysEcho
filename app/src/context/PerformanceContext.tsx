import React, { createContext, useState, useContext, ReactNode } from 'react';

interface PerformanceContextType {
  isLowPerformanceMode: boolean;
  toggleLowPerformanceMode: () => void;
}

const PerformanceContext = createContext<PerformanceContextType | undefined>(undefined);

export const PerformanceProvider = ({ children }: { children: ReactNode }) => {
  const [isLowPerformanceMode, setIsLowPerformanceMode] = useState(false);

  const toggleLowPerformanceMode = () => {
    setIsLowPerformanceMode(prev => !prev);
  };

  return (
    <PerformanceContext.Provider value={{ isLowPerformanceMode, toggleLowPerformanceMode }}>
      {children}
    </PerformanceContext.Provider>
  );
};

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (context === undefined) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
};
