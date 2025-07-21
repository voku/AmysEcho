import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { mlService } from '../services';
import { audioService } from '../services';
import { checkForModelUpdate } from "../services";
import { syncTrainingData } from "../services";
import { syncService } from "../services";
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';
import { useTensorflowModel } from '../hooks/useTensorflowModel';

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
  const landmarkModel = useTensorflowModel(
    require('./assets/models/hand_landmarker.tflite'),
  );
  const gestureModel = useTensorflowModel(
    require('./assets/models/gesture_classifier.tflite'),
    true,
  );

  useEffect(() => {
    if (!landmarkModel || !gestureModel) return;
    mlService
      .loadModels(landmarkModel, gestureModel)
      .then(() => setAreServicesReady(true))
      .catch(e => {
        console.error('Failed to initialize services:', e);
        setAreServicesReady(true);
      });
    const interval = setInterval(() => {
      syncTrainingData().catch(() => {});
      checkForModelUpdate().catch(() => {});
      syncService.syncUnsyncedData().catch(() => {});
      syncService.checkForNewModel('1.0').catch(() => {});
    }, 6 * 60 * 60 * 1000);
    syncTrainingData().catch(() => {});
    checkForModelUpdate().catch(() => {});
    syncService.syncUnsyncedData().catch(() => {});
    syncService.checkForNewModel('1.0').catch(() => {});
    return () => clearInterval(interval);
  }, [landmarkModel, gestureModel]);

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
