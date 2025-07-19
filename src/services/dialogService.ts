
const LLM_URL = process.env.LLM_URL || 'http://localhost:5000/suggest';

/**
 * Fetch adaptive suggestions from an LLM backend. Returns an empty
 * array when the user has not explicitly opted in via the LLM_OPT_IN
 * environment variable.
 */
export async function fetchSuggestions(label: string): Promise<string[]> {
  if (process.env.LLM_OPT_IN !== 'true') {
    return [];
  }
  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status}`);
  }
  const data = (await res.json()) as { suggestions: string[] };
  return data.suggestions;
}
