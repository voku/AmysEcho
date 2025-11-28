/**
 * Services Context for Web
 * Provides dependency injection for services.
 */

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { audioService } from '../services/audioService';
import { feedbackService } from '../services/feedbackService';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { correctionService } from '../services/correctionService';
import { gdprService } from '../services/gdprService';

export interface Services {
  audioService: typeof audioService;
  feedbackService: typeof feedbackService;
  gestureHistoryService: typeof gestureHistoryService;
  correctionService: typeof correctionService;
  gdprService: typeof gdprService;
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
