/**
 * Services Context for Web
 * Provides dependency injection for services.
 */

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { audioService } from '../services/audioService';
import { feedbackService } from '../services/feedbackService';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { correctionService } from '../services/correctionService';
import { gdprService } from '../services/gdprService';
import { gestureDataProtector } from '../services/dataProtection';
import { backupService } from '../services/backupService';

export interface Services {
  audioService: typeof audioService;
  feedbackService: typeof feedbackService;
  gestureHistoryService: typeof gestureHistoryService;
  correctionService: typeof correctionService;
  gdprService: typeof gdprService;
  gestureDataProtector: typeof gestureDataProtector;
  backupService: typeof backupService;
}

const ServicesContext = createContext<Services | null>(null);

interface ServicesProviderProps {
  children: ReactNode;
}

export function ServicesProvider({ children }: ServicesProviderProps) {
  const services = useMemo<Services>(() => ({
    audioService,
    feedbackService,
    gestureHistoryService,
    correctionService,
    gdprService,
    gestureDataProtector,
    backupService,
  }), []);

  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within a ServicesProvider');
  }
  return context;
}
