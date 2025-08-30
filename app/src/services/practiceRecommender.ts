import { checkForDecliningAccuracy } from './healthScore';

export async function getPracticeRecommendation(
  gestureId: string,
): Promise<Date | null> {
  const isDeclining = await checkForDecliningAccuracy(gestureId);
  if (!isDeclining) {
    return null;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}
