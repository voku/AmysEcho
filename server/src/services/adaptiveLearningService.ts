import { Database, getGestureDefinitionById, updateGestureDefinition } from '../db';
import { InteractionLog } from '../types';

/**
 * Adjust gesture definition metrics after an interaction.
 * Returns true when HIP 4 proactive practice should be triggered.
 */
export function processInteraction(
  db: Database,
  log: InteractionLog,
): boolean {
  const def = getGestureDefinitionById(db, log.gestureDefinitionId);
  if (!def) return false;

  if (log.wasSuccessful) {
    def.healthScore = Math.min(100, def.healthScore + 1);
    def.minConfidenceThreshold = Math.max(0, def.minConfidenceThreshold - 0.01);
  } else {
    def.healthScore = Math.max(0, def.healthScore - 5);
    def.minConfidenceThreshold = Math.min(1, def.minConfidenceThreshold + 0.02);
  }

  updateGestureDefinition(db, def);

  return def.healthScore < 70;
}
