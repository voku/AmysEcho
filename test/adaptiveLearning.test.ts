import { createDatabase, addGestureDefinition } from '../src/db';
import { processInteraction } from '../src/services/adaptiveLearningService';
import { GestureDefinition, InteractionLog } from '../src/types';

(async () => {
  const db = createDatabase();
  const def: GestureDefinition = {
    id: 'g1',
    symbolId: 's1',
    status: 'ready',
    healthScore: 70,
    minConfidenceThreshold: 0.5,
  };
  addGestureDefinition(db, def);

  const success: InteractionLog = {
    id: 'log1',
    gestureDefinitionId: 'g1',
    wasSuccessful: true,
    confidenceScore: 0.9,
    timestamp: Date.now(),
    processedBy: 'local',
  };

  let trigger = processInteraction(db, success);
  if (trigger) {
    throw new Error('HIP4 should not trigger on high health');
  }
  if (def.healthScore <= 70 || def.minConfidenceThreshold >= 0.5) {
    throw new Error('ALS did not reward success');
  }

  const fail: InteractionLog = {
    id: 'log2',
    gestureDefinitionId: 'g1',
    wasSuccessful: false,
    confidenceScore: 0.3,
    timestamp: Date.now(),
    processedBy: 'local',
  };

  trigger = processInteraction(db, fail);
  if (!trigger) {
    throw new Error('HIP4 should trigger when health is low');
  }
  if (def.healthScore >= 70 || def.minConfidenceThreshold <= 0.5) {
    throw new Error('ALS did not penalize failure');
  }
  console.log('adaptive learning ok');
})();
