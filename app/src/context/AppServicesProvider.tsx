import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { mlService } from '../services';
import { audioService } from '../services';
import { checkForModelUpdate } from "../services";
import { syncTrainingData } from "../services";
import { syncService } from "../services";
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';
import {loadTensorflowModel, TensorflowModel} from "react-native-fast-tflite";
import {loadCustomModelUri} from "../storage";

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

      // Load ML models
      const landmarkModel = await loadTensorflowModel(
          require('./assets/models/hand_landmarker.tflite'),
      );
      let gestureModel: TensorflowModel | string = await loadTensorflowModel(
          require('./assets/models/gesture_classifier.tflite'),
      );

      const customModelUri = await loadCustomModelUri();
      if (customModelUri) {
        console.log('Loading custom model from:', customModelUri);
        gestureModel = customModelUri;
      }

      try {
        await mlService.loadModels(landmarkModel, gestureModel);
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
      syncService.syncUnsyncedData().catch(() => {});
      syncService.checkForNewModel('1.0').catch(() => {});
    }, 6 * 60 * 60 * 1000);
    syncTrainingData().catch(() => {});
    checkForModelUpdate().catch(() => {});
    syncService.syncUnsyncedData().catch(() => {});
    syncService.checkForNewModel('1.0').catch(() => {});
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
