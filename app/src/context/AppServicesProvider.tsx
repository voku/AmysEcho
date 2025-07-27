import React, {createContext, ReactNode, useContext, useEffect, useState} from 'react';
import {audioService, checkForModelUpdate, mlService, syncService, syncTrainingData} from '../services';
import {adaptiveLearningService} from '../services/adaptiveLearningService';
import {ActivityIndicator, View} from 'react-native';
import {useTensorflowModel} from '../hooks/useTensorflowModel';
import {GESTURE_CLASSIFIER_MODEL, GESTURE_LABELS, HAND_LANDMARKER_MODEL} from '../constants/modelPaths';

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
  const landmarkModel = useTensorflowModel(HAND_LANDMARKER_MODEL);
  const gestureModel = useTensorflowModel(GESTURE_CLASSIFIER_MODEL, true);

  useEffect(() => {
    if (!landmarkModel || !gestureModel) return;
    mlService
      .loadModels(landmarkModel, gestureModel, GESTURE_LABELS)
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
