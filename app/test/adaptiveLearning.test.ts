import { createDatabase, addGestureDefinition } from '../../server/src/db';
import { processInteraction } from '../../server/src/services/adaptiveLearningService';
import { GestureDefinition, InteractionLog } from '../../server/src/types';

describe('Adaptive Learning', () => {
  it('should correctly process interactions and update gesture definitions', () => {
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
    expect(trigger).toBe(false);
    expect(def.healthScore).toBeGreaterThan(70);
    expect(def.minConfidenceThreshold).toBeLessThan(0.5);

    const fail: InteractionLog = {
      id: 'log2',
      gestureDefinitionId: 'g1',
      wasSuccessful: false,
      confidenceScore: 0.3,
      timestamp: Date.now(),
      processedBy: 'local',
    };

    trigger = processInteraction(db, fail);
    expect(trigger).toBe(true);
    expect(def.healthScore).toBeLessThan(70);
    expect(def.minConfidenceThreshold).toBeGreaterThan(0.5);
  });
});