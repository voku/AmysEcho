import { Alert } from 'react-native';
import { gestureModel } from '../model';
import { getGestureHealth, saveHistoricalHealthData, checkForDecliningAccuracy } from './healthScore';
import { gestureDataProtector } from './dataProtection';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      // Check if Amy is currently active before showing practice suggestion
      const isActive = await checkAmyCommunicationActivity();
      if (!isActive) {
        Alert.alert(
          'Lernfortschritt',
          `Die Erkennungsrate für "${gesture.label}" sinkt. Vielleicht ist es Zeit für eine Übung.`,
        );
      } else {
        // Schedule practice for later when Amy is less active
        await scheduleAdaptivePractice(gesture.id);
      }
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

// Adaptive Practice System - Amy First
const COMMUNICATION_ACTIVITY_KEY = 'amy_communication_activity';
const QUIET_PERIODS_KEY = 'amy_quiet_periods';

/**
 * Check if Amy is currently actively communicating
 */
export async function checkAmyCommunicationActivity(): Promise<boolean> {
  try {
    const activityData = await AsyncStorage.getItem(COMMUNICATION_ACTIVITY_KEY);
    if (!activityData) return false;

    const activity = JSON.parse(activityData);
    const now = Date.now();
    const recentActivityWindow = 30 * 60 * 1000; // 30 minutes

    // Check for recent gestures (communication activity)
    const recentGestures = activity.gestures?.filter((g: any) =>
      now - g.timestamp < recentActivityWindow
    ) || [];

    // Consider Amy active if she's made gestures in the last 30 minutes
    return recentGestures.length >= 3;
  } catch (error) {
    logger.warn('Failed to check Amy communication activity:', error);
    return false; // Default to not active if we can't check
  }
}

/**
 * Schedule practice for a quieter time when Amy is less active
 */
export async function scheduleAdaptivePractice(gestureId: string): Promise<void> {
  try {
    // Find Amy's quiet periods based on historical activity
    const quietPeriods = await getAmyQuietPeriods();

    if (quietPeriods.length > 0) {
      // Schedule for the next available quiet period
      const nextQuietPeriod = quietPeriods[0];
      const scheduleTime = new Date();
      scheduleTime.setHours(nextQuietPeriod.hour, nextQuietPeriod.minute, 0, 0);

      // If the time has passed today, schedule for tomorrow
      if (scheduleTime < new Date()) {
        scheduleTime.setDate(scheduleTime.getDate() + 1);
      }

      await addSchedule({
        gestureId,
        hour: scheduleTime.getHours(),
        minute: scheduleTime.getMinutes(),
        daysOfWeek: [scheduleTime.getDay()],
      });

      logger.info(`Scheduled adaptive practice for ${gestureId} at ${scheduleTime.toLocaleTimeString()}`);
    } else {
      // No quiet periods identified, schedule for evening when Amy might be calmer
      const eveningTime = new Date();
      eveningTime.setHours(18, 0, 0, 0); // 6 PM

      await addSchedule({
        gestureId,
        hour: 18,
        minute: 0,
        daysOfWeek: [eveningTime.getDay()],
      });

      logger.info(`Scheduled evening practice for ${gestureId} due to no quiet periods identified`);
    }
  } catch (error) {
    logger.warn('Failed to schedule adaptive practice:', error);
  }
}

/**
 * Analyze Amy's activity patterns to identify quiet periods
 */
export async function getAmyQuietPeriods(): Promise<Array<{hour: number, minute: number, confidence: number}>> {
  try {
    const activityData = await AsyncStorage.getItem(COMMUNICATION_ACTIVITY_KEY);
    if (!activityData) {
      // Default quiet periods if no data available
      return [
        { hour: 14, minute: 0, confidence: 0.5 }, // 2 PM
        { hour: 16, minute: 30, confidence: 0.5 }, // 4:30 PM
        { hour: 19, minute: 0, confidence: 0.5 }, // 7 PM
      ];
    }

    const activity = JSON.parse(activityData);
    const hourlyActivity: Record<number, number> = {};

    // Analyze activity by hour
    activity.gestures?.forEach((g: any) => {
      const hour = new Date(g.timestamp).getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    });

    // Find hours with lowest activity
    const hours = Object.keys(hourlyActivity).map(Number);
    const sortedHours = hours.sort((a, b) => hourlyActivity[a] - hourlyActivity[b]);

    // Return top 3 quietest hours
    return sortedHours.slice(0, 3).map(hour => ({
      hour,
      minute: Math.floor(Math.random() * 60), // Random minute to distribute schedules
      confidence: 0.8 // High confidence based on historical data
    }));

  } catch (error) {
    logger.warn('Failed to analyze quiet periods:', error);
    // Fallback to default quiet periods
    return [
      { hour: 14, minute: 0, confidence: 0.3 },
      { hour: 16, minute: 30, confidence: 0.3 },
      { hour: 19, minute: 0, confidence: 0.3 },
    ];
  }
}

/**
 * Record Amy's communication activity for adaptive scheduling
 */
export async function recordAmyActivity(gesture: string, timestamp: number = Date.now()): Promise<void> {
  try {
    const activityData = await AsyncStorage.getItem(COMMUNICATION_ACTIVITY_KEY);
    const activity = activityData ? JSON.parse(activityData) : { gestures: [] };

    // Add new gesture activity
    activity.gestures.push({
      gesture,
      timestamp,
      type: 'communication'
    });

    // Keep only recent activity (last 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    activity.gestures = activity.gestures.filter((g: any) => g.timestamp > weekAgo);

    // Limit stored data size
    if (activity.gestures.length > 1000) {
      activity.gestures = activity.gestures.slice(-500);
    }

    await AsyncStorage.setItem(COMMUNICATION_ACTIVITY_KEY, JSON.stringify(activity));
  } catch (error) {
    logger.warn('Failed to record Amy activity:', error);
  }
}

