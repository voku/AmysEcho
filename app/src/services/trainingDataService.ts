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
  if (
    !gestureId ||
    gestureId.trim() === '' ||
    !Array.isArray(landmarkData) ||
    landmarkData.length === 0
  ) {
    throw new Error('Invalid training sample data');
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
  const samples = await collection.query().fetch();

  const filtered = gestureId
    ? samples.filter(s => s.gestureDefinition.id === gestureId)
    : samples;

  return filtered.map(sample => ({
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
    const samples = await collection.query().fetch();
    const filtered = gestureId
      ? samples.filter(s => s.gestureDefinition.id === gestureId)
      : samples;

    for (const sample of [...filtered]) {
      await sample.destroyPermanently();
    }
  });
}