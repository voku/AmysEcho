import { HistoricalHealthEntry, loadHistoricalHealthData } from './healthScore';

export async function getPracticeRecommendation(gestureId: string): Promise<Date | null> {
  const data = await loadHistoricalHealthData(gestureId);
  if (data.length < 7) {
    return null;
  }

  // For now, we will use a simple heuristic: if the success rate has been declining for the last 3 days,
  // recommend practicing tomorrow.
  const recentData = data.slice(-3);
  if (recentData.length === 3 && recentData[0].successRate > recentData[1].successRate && recentData[1].successRate > recentData[2].successRate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  return null;
}
