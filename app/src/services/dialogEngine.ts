import { loadBackendToken } from '../storage';

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
  // LLM Hint: This endpoint points to our secure backend proxy, NOT directly to OpenAI.
  const proxyUrl = 'https://your-secure-proxy-server.com/generate-suggestions';

  // LLM Hint: In a real app, this token would come from an authentication service.
  const authToken = (await loadBackendToken()) || 'user-session-jwt-token-placeholder';

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        input,
        context,
        language,
        age,
      }),
    });

    if (!response.ok) {
      console.error(`API call failed with status: ${response.status}`);
      return { nextWords: [], caregiverPhrases: [] };
    }

    return (await response.json()) as LLMSuggestionResponse;
  } catch (error) {
    console.error('LLM suggestion fetch error:', error);
    return { nextWords: [], caregiverPhrases: [] }; // Return empty on error
  }
}

