import React, {createContext, ReactNode, useContext, useEffect, useState} from 'react';
import {audioService, checkForModelUpdate, mlService, syncService, syncTrainingData} from '../services';
import {adaptiveLearningService} from '../services/adaptiveLearningService';
import {ActivityIndicator, View} from 'react-native';
import { Asset } from 'expo-asset';
import {GESTURE_CLASSIFIER_MODEL, HAND_LANDMARKER_MODEL} from '../constants/modelPaths';
import { loadCustomModelUri } from '../storage';

interface Services {
  mlService: typeof mlService;
  audioService: typeof audioService;
  adaptiveLearningService: typeof adaptiveLearningService;
}

const ServicesContext = createContext<Services | null>(null);
const gestureLabels = require('../../assets/models/gesture_labels.json');

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
        const landmarkAsset = Asset.fromModule(HAND_LANDMARKER_MODEL);
        await landmarkAsset.downloadAsync();
        if (!landmarkAsset.localUri) {
          throw new Error('Failed to get local URI for landmark model asset.');
        }

        const gestureAsset = Asset.fromModule(GESTURE_CLASSIFIER_MODEL);
        await gestureAsset.downloadAsync();
        if (!gestureAsset.localUri) {
          throw new Error('Failed to get local URI for gesture model asset.');
        }

        let customGestureModelUri = await loadCustomModelUri();
        let gestureModelSource: { url: string };

        if (customGestureModelUri) {
          gestureModelSource = { url: customGestureModelUri };
        } else {
          gestureModelSource = { url: gestureAsset.localUri };
        }

        await mlService.loadModels(
          { url: landmarkAsset.localUri },
          gestureModelSource,
          gestureLabels,
        );
        setAreServicesReady(true);

        const interval = setInterval(() => {
          syncTrainingData().catch(() => {});
          checkForModelUpdate().catch(() => {});
          syncService.uploadPendingTrainingData().catch(() => {});
          syncService.checkForNewModel().catch(() => {});
        }, 6 * 60 * 60 * 1000);

        syncTrainingData().catch(() => {});
        checkForModelUpdate().catch(() => {});
        syncService.uploadPendingTrainingData().catch(() => {});
        syncService.checkForNewModel().catch(() => {});

        return () => clearInterval(interval);
      } catch (e) {
        console.error('Failed to initialize services:', e);
        setAreServicesReady(true);
      }
    }

    initializeServices();
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
