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
  if (!gestureId || !landmarkData || landmarkData.length === 0) {
    throw new Error('Invalid training sample data');
  }

  await database.write(async () => {
    await database.get<GestureTrainingData>('gesture_training_data').create(sample => {
      sample.gestureDefinitionId = gestureId;
      sample.landmarkData = JSON.stringify(landmarkData);
      sample.source = source;
      sample.qualityScore = 1.0;
      sample.frameMetadata = JSON.stringify({});
      sample.customSyncStatus = 'pending';
    });
  });
}

export async function getTrainingSamples(gestureId?: string): Promise<TrainingSample[]> {
  let query = database.get<GestureTrainingData>('gesture_training_data').query();

  if (gestureId) {
    query = query.where('gesture_definition_id', gestureId);
  }

  const samples = await query.fetch();

  return samples.map(sample => ({
    id: sample.id,
    gestureDefinitionId: sample.gestureDefinitionId,
    landmarkData: JSON.parse(sample.landmarkData),
    source: sample.source,
    approved: sample.customSyncStatus === 'approved'
  }));
}

export async function clearTrainingSamples(gestureId?: string): Promise<void> {
  await database.write(async () => {
    let query = database.get<GestureTrainingData>('gesture_training_data').query();

    if (gestureId) {
      query = query.where('gesture_definition_id', gestureId);
    }

    const samples = await query.fetch();
    for (const sample of samples) {
      await sample.destroyPermanently();
    }
  });
}