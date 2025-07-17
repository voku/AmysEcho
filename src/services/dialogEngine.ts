import fetch from 'node-fetch';

export interface LLMRequest {
  input: string;
  context: string[];
  language: string;
  age: number;
}

export interface LLMSuggestions {
  nextWords: string[];
  caregiverPhrases: string[];
}

function getApiKey(): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return require('fs').readFileSync('.openai-key', 'utf8').trim();
  } catch {
    return undefined;
  }
}

export async function getLLMSuggestions(req: LLMRequest): Promise<LLMSuggestions> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { nextWords: [], caregiverPhrases: [] };
  }
  const prompt = `A ${req.age}-year-old child who speaks ${req.language} just selected the word "${req.input}". The current context is [${req.context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: "nextWords": string[] and "caregiverPhrases": string[].`;
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
    if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
    const data = (await response.json()) as any;
    const content = JSON.parse(data.choices[0].message.content as string);
    return content as LLMSuggestions;
  } catch (error) {
    console.error('LLM suggestion error:', error);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
