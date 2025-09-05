import { Alert } from 'react-native';
import { gestureModel } from '../model';
import { getGestureHealth, saveHistoricalHealthData, checkForDecliningAccuracy } from './healthScore';
import { gestureDataProtector } from './dataProtection';
import { logger } from '../utils/logger';

export async function runDailyJobs() {
  const gestures = gestureModel.gestures;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Clean up expired gesture data for privacy
  try {
    const expiredCount = await gestureDataProtector.cleanupExpiredData();
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired gesture records`);
    }
  } catch (error) {
    logger.warn('Failed to cleanup expired gesture data:', error);
  }

  for (const gesture of gestures) {
    const health = await getGestureHealth(gesture.id, { windowMs: 24 * 60 * 60 * 1000 });
    if (health.count > 0) {
      await saveHistoricalHealthData(gesture.id, {
        date: today,
        successRate: health.successRate,
        count: health.count,
      });
    }
  }
}

export async function checkAllGesturesForDecliningAccuracy() {
  const gestures = gestureModel.gestures;

  for (const gesture of gestures) {
    const isDeclining = await checkForDecliningAccuracy(gesture.id);
    if (isDeclining) {
      Alert.alert(
        'Lernfortschritt',
        `Die Erkennungsrate für "${gesture.label}" sinkt. Vielleicht ist es Zeit für eine Übung.`,
      );
    }
  }
}


import { getPracticeRecommendation } from "./practiceRecommender";
import { addSchedule } from "./practiceScheduler";

export async function checkPracticeRecommendations() {
  const gestures = gestureModel.gestures;

  for (const gesture of gestures) {
    const recommendation = await getPracticeRecommendation(gesture.id);
    if (recommendation) {
      await addSchedule({
        gestureId: gesture.id,
        hour: recommendation.getHours(),
        minute: recommendation.getMinutes(),
        daysOfWeek: [recommendation.getDay()],
      });
    }
  }
}

