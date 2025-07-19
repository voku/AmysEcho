
// LLM Hint: Define a clear type for the expected JSON response from the LLM.
// This helps with type safety and makes it clear what structure the prompt should request.
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

// Retain existing interface name for backward compatibility within the codebase.
export interface LLMSuggestions {
  nextWords: string[];
  caregiverPhrases: string[];
}

function getApiKey(): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    // LLM Hint: The .openai-key file is documented in README.md. Replace with
    // secure storage when integrating into the mobile app.
    return require('fs').readFileSync('.openai-key', 'utf8').trim();
  } catch {
    return undefined;
  }
}

export async function getLLMSuggestions(req: LLMRequest): Promise<LLMSuggestionResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { nextWords: [], caregiverPhrases: [] };
  }
  // LLM Hint: The prompt is the most critical part. It should clearly state the
  // role, the context, the desired output format (JSON), and the exact keys for
  // the JSON object. The formatting here mirrors the guidelines in docs/TODO.md.
  const prompt = `A ${req.age}-year-old child who speaks ${req.language} just selected the word "${req.input}". The current context is [${req.context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: "nextWords" and "caregiverPhrases".`;
  console.log('LLM Prompt:', prompt);
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
    return content as LLMSuggestionResponse;
  } catch (error) {
    console.error('LLM suggestion error:', error);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
