export interface LLMSuggestions {
  nextWords: string[];
  caregiverPhrases: string[];
}

import { loadOpenAIApiKey } from '../storage';

export async function getLLMSuggestions(label: string): Promise<LLMSuggestions> {
  const apiKey = await loadOpenAIApiKey();
  if (!apiKey) {
    switch (label) {
      case 'hello':
        return { nextWords: ['Hi!'], caregiverPhrases: ['Ask how are you?'] };
      default:
        return { nextWords: [], caregiverPhrases: [`Try repeating ${label}`] };
    }
  }

  const prompt = `A child selected the word "${label}". Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: nextWords and caregiverPhrases.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as any;
    const content = JSON.parse(data.choices[0].message.content as string);
    return content as LLMSuggestions;
  } catch (err) {
    console.error('LLM error', err);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
