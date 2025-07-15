const LLM_URL = 'http://localhost:5000/suggest';

export async function getAdaptiveSuggestion(label: string): Promise<string[]> {
  if (!process.env.LLM_OPT_IN) {
    switch (label) {
      case 'hello':
        return ['Wave back', 'Ask how are you?'];
      default:
        return [`Try repeating ${label}`];
    }
  }

  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { suggestions: string[] };
    return data.suggestions;
  } catch {
    return [];
  }
}
