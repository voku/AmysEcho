import { loadOpenAIApiKey } from '../storage';

export type LLMSuggestionResponse = {
  nextWords: string[];
  caregiverPhrases: string[];
};

export interface LLMRequest {
  input: string;
  context: string[];
  language: string;
  age: number;
}

export async function getLLMSuggestions({ input, context, language, age }: LLMRequest): Promise<LLMSuggestionResponse> {
  const apiKey =
    (await loadOpenAIApiKey()) || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
  if (!apiKey) {
    return { nextWords: [], caregiverPhrases: [] };
  }

  const prompt = `A ${age}-year-old child who speaks ${language} just selected the word "${input}". The current context is [${context.join(
    ', '
  )}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: "nextWords" and "caregiverPhrases".`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!response.ok) {
      console.error(`API call failed with status: ${response.status}`);
      return { nextWords: [], caregiverPhrases: [] };
    }

    const data = (await response.json()) as any;
    const content = JSON.parse(data.choices[0].message.content as string);
    return content as LLMSuggestionResponse;
  } catch (error) {
    console.error('LLM suggestion fetch error:', error);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
