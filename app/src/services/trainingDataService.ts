import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import { GestureTrainingData } from '../../db/models';

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
    throw new Error(
      // TODO: Diese Fehlermeldung für Lokalisierung auslagern.
      'Ungültige Trainingsdaten: Bitte gültige Gesten-ID und Landmarken (Tripel aus Zahlen) angeben.'
    );
  }

  await database.write(async () => {
    await database.get<GestureTrainingData>('gesture_training_data').create(sample => {
      sample.gestureDefinition.id = gestureId;
      sample.landmarkData = JSON.stringify(landmarkData);
      sample.source = source;
      sample.qualityScore = 1.0;
      sample.frameMetadata = JSON.stringify({});
      sample.customSyncStatus = 'pending';
    });
  });
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