import { create } from 'zustand';
import type { audioService, backupService, gestureDataProtector, gdprService } from '../services';
import type { adaptiveLearningService } from '../services/adaptiveLearningService';

export interface Services {
  audioService: typeof audioService;
  adaptiveLearningService: typeof adaptiveLearningService;
  backupService: typeof backupService;
  gestureDataProtector: typeof gestureDataProtector;
  gdprService: typeof gdprService;
}

interface ServicesState extends Services {
  setServices: (services: Services) => void;
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

export const useServicesStore = create<ServicesState>((set) => ({
  // Initial services will be set by AppServicesProvider
  audioService: {} as any,
  adaptiveLearningService: {} as any,
  backupService: {} as any,
  gestureDataProtector: {} as any,
  gdprService: {} as any,
  isReady: false,
  setServices: (services) => set(services),
  setReady: (ready) => set({ isReady: ready }),
}));

// Hook for easy access to services
export const useServices = () => {
  const { audioService, adaptiveLearningService, backupService, gestureDataProtector, gdprService, isReady } = useServicesStore();

  if (!isReady) {
    throw new Error('Services not ready. Make sure AppServicesProvider has initialized.');
  }

  return {
    audioService,
    adaptiveLearningService,
    backupService,
    gestureDataProtector,
    gdprService,
  };
};