import { loadDatabase, saveDatabase } from '../db';
import { refreshLearningAnalytics } from '../services/analyticsService';

(async () => {
  const [dbPath] = process.argv.slice(2);
  if (!dbPath) {
    console.error('Usage: node updateAnalytics.js <db.json>');
    process.exit(1);
  }
  const db = await loadDatabase(dbPath);
  refreshLearningAnalytics(db);
  await saveDatabase(db, dbPath);
  console.log('analytics updated');
})();
