export class CelebrationSystem {
  generateCelebration(attemptResult: any): string {
    if (attemptResult.success) {
      return attemptResult.gesture === 'emergency' ?
        '🆘 Notfall perfekt erkannt!' :
        'Fantastisch! Das war perfekt!';
    } else {
      return attemptResult.effort > 0.7 ?
        'Super Versuch! Du wirst immer besser!' :
        'Nochmal versuchen - du schaffst das!';
    }
  }
}