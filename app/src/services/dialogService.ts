export async function getAdaptiveSuggestion(label: string): Promise<string[]> {
  switch (label) {
    case 'hello':
      return ['Wave back', 'Ask how are you?'];
    default:
      return [`Try repeating ${label}`];
  }
}
