import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { mlService } from '../src/services/mlService';
import { audioService } from '../src/services/audioService';
import { checkForModelUpdate } from "../src/services/modelUpdate";
import { syncTrainingData } from "../src/services/trainingSync";
import { adaptiveLearningService } from '../src/services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';

interface Services {
  mlService: typeof mlService;
  audioService: typeof audioService;
  adaptiveLearningService: typeof adaptiveLearningService;
}

const ServicesContext = createContext<Services | null>(null);

export const useServices = () => {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within an AppServicesProvider');
  }
  return context;
};

export const AppServicesProvider = ({ children }: { children: ReactNode }) => {
  const [areServicesReady, setAreServicesReady] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      try {
        await mlService.loadModels();
        // Other async service initializations can go here
      } catch (e) {
        console.error('Failed to initialize services:', e);
      } finally {
        setAreServicesReady(true);
      }
    }
    initializeServices();
    const interval = setInterval(() => {
      syncTrainingData().catch(() => {});
      checkForModelUpdate().catch(() => {});
    }, 6 * 60 * 60 * 1000);
    syncTrainingData().catch(() => {});
    checkForModelUpdate().catch(() => {});
    return () => clearInterval(interval);
  }, []);

  if (!areServicesReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const services = { mlService, audioService, adaptiveLearningService };

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
};
