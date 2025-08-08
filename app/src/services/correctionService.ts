export const correctionService = {
  async logCorrection(correction: string) {
    await fetch('/api/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correction }),
    });
  },
};
export default correctionService;
