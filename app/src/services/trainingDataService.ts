import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import { GestureTrainingData } from '../../db/models';
import { trainingSessionManager, TrainingFeedback } from './TrainingSessionManager';

const INVALID_TRAINING_DATA_ERROR =
  'Ungültige Trainingsdaten: Bitte gültige Gesten-ID und Landmarken (Tripel aus Zahlen) angeben.';

export interface TrainingSample {
  id?: string;
  gestureDefinitionId: string;
  landmarkData: number[][];
  source?: string;
  approved?: boolean;
}

export async function addTrainingSample(
  gestureId: string,
  landmarkData: number[][],
  source: string = 'manual'
): Promise<void> {
  const isValidTuples =
    Array.isArray(landmarkData) &&
    landmarkData.length > 0 &&
    landmarkData.every(
      p => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n))
    );
  if (!gestureId || gestureId.trim() === '' || !isValidTuples) {
    throw new Error(INVALID_TRAINING_DATA_ERROR);
  }

  const createRecord = async () => {
    await database
      .get<GestureTrainingData>('gesture_training_data')
      .create(sample => {
        sample.gestureDefinition.id = gestureId;
        sample.landmarkData = JSON.stringify(landmarkData);
        sample.source = source;
        sample.qualityScore = 1.0;
        sample.frameMetadata = JSON.stringify({});
        sample.customSyncStatus = 'pending';
        sample.createdAt = new Date();
      });
  };

  // Try creating directly (works if caller already runs inside a writer),
  // and fall back to wrapping in a writer when necessary.
  try {
    await createRecord();
  } catch (_e) {
    await database.write(async () => {
      await createRecord();
    });
  }
}

export async function getTrainingSamples(gestureId?: string): Promise<TrainingSample[]> {
  const collection = database.get<GestureTrainingData>('gesture_training_data');
  const query = gestureId
    ? collection.query(Q.where('gesture_definition_id', gestureId))
    : collection.query();
  const samples = await query.fetch();

  return samples.map(sample => ({
    id: sample.id,
    gestureDefinitionId: sample.gestureDefinition.id,
    landmarkData: JSON.parse(sample.landmarkData),
    source: sample.source,
    approved: sample.customSyncStatus === 'approved',
  }));
}

export async function clearTrainingSamples(gestureId?: string): Promise<void> {
  await database.write(async () => {
    const collection = database.get<GestureTrainingData>('gesture_training_data');
    const query = gestureId
      ? collection.query(Q.where('gesture_definition_id', gestureId))
      : collection.query();
    const samplesToDelete = await query.fetch();
    if (samplesToDelete.length > 0) {
      const deletions = samplesToDelete.map(sample => sample.prepareDestroyPermanently());
      await database.batch(...deletions);
    }
  });
}

/**
 * Add training sample with session management and real-time feedback
 */
export async function addTrainingSampleWithFeedback(
  gestureId: string,
  landmarkData: number[][],
  source: string = 'manual'
): Promise<{ success: boolean; feedback: TrainingFeedback | null }> {
  try {
    // Add to session manager for feedback
    const feedback = trainingSessionManager.addSample([landmarkData]);

    // Save to database
    await addTrainingSample(gestureId, landmarkData, source);

    return {
      success: true,
      feedback
    };
  } catch (error) {
    console.error('Failed to add training sample with feedback:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to save training sample';
    return {
      success: false,
      feedback: {
        message,
        type: 'error'
      }
    };
  }
}

/**
 * Start a training session
 */
export function startTrainingSession(gestureId: string, targetSamples = 10) {
  return trainingSessionManager.startSession(gestureId, targetSamples);
}

/**
 * Get current training session progress
 */
export function getTrainingProgress() {
  return trainingSessionManager.getProgress();
}

/**
 * Subscribe to training session updates
 */
export function onTrainingUpdate(callback: (session: any) => void) {
  return trainingSessionManager.onSessionUpdate(callback);
}
