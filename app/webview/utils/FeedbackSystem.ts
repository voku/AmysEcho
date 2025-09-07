export class FeedbackSystem {
  generateFeedback(attemptResult: any): string {
    if (attemptResult.effort > 0.8) {
      return 'Das war ein sehr guter Versuch! Bleib dran!';
    } else if (attemptResult.effort > 0.6) {
      return 'Gute Arbeit! Versuche es nochmal.';
    } else {
      return 'Kein Problem! Jeder fängt mal klein an.';
    }
  }
}