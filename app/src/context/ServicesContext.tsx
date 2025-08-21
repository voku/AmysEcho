import React, { useContext } from 'react';
import type { audioService, backupService, gestureDataProtector } from '../services';
import type { adaptiveLearningService } from '../services/adaptiveLearningService';

export interface Services {
  audioService: typeof audioService;
  adaptiveLearningService: typeof adaptiveLearningService;
  backupService: typeof backupService;
  gestureDataProtector: typeof gestureDataProtector;
}

export const ServicesContext = React.createContext<Services | null>(null);

export const useServices = () => {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within an AppServicesProvider');
  }
  return context;
};
