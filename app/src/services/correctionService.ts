export const correctionService = {
  async logCorrection(gesture: string) {
    await fetch('/api/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gesture }),
    });
  },
};
export default correctionService;
