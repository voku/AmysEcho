import { classifyGesture } from '../../server/src/recognizer';

(async () => {
  const result = await classifyGesture([[0, 0]]);
  if (result.processedBy !== 'local') {
    throw new Error('Expected offline fallback');
  }
  console.log('classification fallback', result.processedBy);
})();
