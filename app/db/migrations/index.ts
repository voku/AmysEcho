import {
  createTable,
  addColumns,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'gesture_training_data',
          columns: [
            { name: 'custom_sync_status', type: 'string', isIndexed: true },
          ],
        }),
      ],
    },
     {
      toVersion: 6,
      steps: [
        createTable({
          name: 'corrections',
          columns: [
            { name: 'predicted_gesture', type: 'string', isIndexed: true },
            { name: 'actual_gesture', type: 'string', isIndexed: true },
            { name: 'confidence', type: 'number' },
            { name: 'landmarks', type: 'string' },
            { name: 'timestamp', type: 'number', isIndexed: true },
            { name: 'is_synced', type: 'boolean' },
          ],
        }),
      ],
    },
  ],
});
